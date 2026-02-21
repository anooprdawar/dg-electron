import Foundation
import CoreAudio
import AudioToolbox
import Accelerate
import Shared

// MARK: - AudioObjectID helpers

extension AudioObjectID {
    static let system = AudioObjectID(kAudioObjectSystemObject)
    static let unknown = kAudioObjectUnknown
    var isValid: Bool { self != Self.unknown }
}

private func readDefaultOutputDevice() throws -> AudioDeviceID {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultSystemOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var deviceID = AudioDeviceID.unknown
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    let err = AudioObjectGetPropertyData(AudioObjectID.system, &address, 0, nil, &size, &deviceID)
    guard err == noErr else {
        throw NSError(domain: "AudioTap", code: Int(err),
            userInfo: [NSLocalizedDescriptionKey: "Failed to get default output device (error \(err))"])
    }
    return deviceID
}

private func readDeviceUID(_ deviceID: AudioDeviceID) throws -> String {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceUID,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var uid: CFString = "" as CFString
    var size = UInt32(MemoryLayout<CFString>.size)
    let err = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &uid)
    guard err == noErr else {
        throw NSError(domain: "AudioTap", code: Int(err),
            userInfo: [NSLocalizedDescriptionKey: "Failed to get device UID (error \(err))"])
    }
    return uid as String
}

private func translatePIDToObjectID(_ pid: pid_t) throws -> AudioObjectID {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyTranslatePIDToProcessObject,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var objectID = AudioObjectID.unknown
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    var inPID = pid
    let err = AudioObjectGetPropertyData(AudioObjectID.system, &address, UInt32(MemoryLayout<pid_t>.size), &inPID, &size, &objectID)
    guard err == noErr, objectID.isValid else {
        throw NSError(domain: "AudioTap", code: Int(err),
            userInfo: [NSLocalizedDescriptionKey: "Failed to translate PID \(pid) to audio object (error \(err))"])
    }
    return objectID
}

// MARK: - AudioTapManager

/// Manages system audio capture using Core Audio Taps API (macOS 14.2+)
@available(macOS 14.2, *)
final class AudioTapManager {
    private let format: AudioFormat
    private let chunkDurationMs: Int
    private let mute: Bool
    private let pcmWriter = PCMWriter()
    private var analyzer: AudioAnalyzer?

    private var tapID: AudioObjectID = .unknown
    private var aggregateDeviceID: AudioObjectID = .unknown
    private var deviceProcID: AudioDeviceIOProcID?
    private var isRunning = false

    init(format: AudioFormat, chunkDurationMs: Int, mute: Bool, enableLevels: Bool = false, fftBins: Int = 128, levelIntervalMs: Int = 50) {
        self.format = format
        self.chunkDurationMs = chunkDurationMs
        self.mute = mute
        if enableLevels {
            self.analyzer = AudioAnalyzer(sampleRate: format.sampleRate, fftBins: fftBins, intervalMs: levelIntervalMs)
        }
    }

    /// Check if we have permission to create audio taps
    func checkPermission() -> Bool {
        let tapDescription = CATapDescription(stereoMixdownOfProcesses: [])
        tapDescription.uuid = UUID()

        var testTapID: AudioObjectID = .unknown
        let status = AudioHardwareCreateProcessTap(tapDescription, &testTapID)

        if status == noErr && testTapID.isValid {
            AudioHardwareDestroyProcessTap(testTapID)
            return true
        }

        // -66753 is kAudioHardwareNotPermittedError
        return status != -66753
    }

    /// Start capturing system audio
    func start(includeProcesses: [pid_t], excludeProcesses: [pid_t]) throws {
        guard !isRunning else { return }

        // Step 1: Create the tap description
        let tapDescription: CATapDescription

        if !includeProcesses.isEmpty {
            let objectIDs = try includeProcesses.map { try translatePIDToObjectID($0) }
            tapDescription = CATapDescription(stereoMixdownOfProcesses: objectIDs)
        } else if !excludeProcesses.isEmpty {
            let objectIDs = try excludeProcesses.map { try translatePIDToObjectID($0) }
            tapDescription = CATapDescription(stereoGlobalTapButExcludeProcesses: objectIDs)
        } else {
            // Capture all system audio
            tapDescription = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
        }

        tapDescription.uuid = UUID()
        tapDescription.muteBehavior = mute ? .mutedWhenTapped : .unmuted

        // Step 2: Create the process tap
        var status = AudioHardwareCreateProcessTap(tapDescription, &tapID)
        if status != noErr {
            if status == -66753 {
                throw NSError(domain: "AudioTap", code: Int(status),
                    userInfo: [NSLocalizedDescriptionKey: "System audio recording permission denied"])
            }
            throw NSError(domain: "AudioTap", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Failed to create process tap (error \(status))"])
        }

        // Step 3: Get default output device UID
        let outputDeviceID = try readDefaultOutputDevice()
        let outputUID = try readDeviceUID(outputDeviceID)

        // Step 4: Create aggregate device with tap + output
        let tapUUIDString = tapDescription.uuid.uuidString
        let aggregateUID = UUID().uuidString

        let description: [String: Any] = [
            kAudioAggregateDeviceNameKey: "Deepgram System Audio Tap",
            kAudioAggregateDeviceUIDKey: aggregateUID,
            kAudioAggregateDeviceMainSubDeviceKey: outputUID,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceIsStackedKey: false,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceSubDeviceListKey: [
                [kAudioSubDeviceUIDKey: outputUID]
            ],
            kAudioAggregateDeviceTapListKey: [
                [
                    kAudioSubTapDriftCompensationKey: true,
                    kAudioSubTapUIDKey: tapUUIDString
                ]
            ]
        ]

        status = AudioHardwareCreateAggregateDevice(description as CFDictionary, &aggregateDeviceID)
        guard status == noErr else {
            AudioHardwareDestroyProcessTap(tapID)
            tapID = .unknown
            throw NSError(domain: "AudioTap", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Failed to create aggregate device (error \(status))"])
        }

        // Step 5: Set up IO proc to receive audio via block-based API
        let writerRef = self.pcmWriter
        let analyzerRef = self.analyzer

        let ioBlock: AudioDeviceIOBlock = { inNow, inInputData, inInputTime, outOutputData, inOutputTime in
            let bufferList = inInputData.pointee
            let bufferCount = Int(bufferList.mNumberBuffers)

            withUnsafePointer(to: inInputData.pointee.mBuffers) { firstBufferPtr in
                let buffers = UnsafeBufferPointer<AudioBuffer>(start: firstBufferPtr, count: bufferCount)
                for buffer in buffers {
                    guard let data = buffer.mData, buffer.mDataByteSize > 0 else { continue }
                    writerRef.write(Data(bytes: data, count: Int(buffer.mDataByteSize)))

                    if let analyzer = analyzerRef {
                        let byteCount = Int(buffer.mDataByteSize)
                        let sampleCount = byteCount / MemoryLayout<Int16>.size
                        data.withMemoryRebound(to: Int16.self, capacity: sampleCount) { int16Ptr in
                            if let result = analyzer.analyze(samples: int16Ptr, count: sampleCount) {
                                let fftData = result.fft.map { ["freq": $0.freq, "magnitude": $0.magnitude] }
                                Message.audioLevel(
                                    rms: result.rms,
                                    peak: result.peak,
                                    fft: fftData,
                                    timestamp: result.timestamp
                                ).send()
                            }
                        }
                    }
                }
            }
        }

        let captureQueue = DispatchQueue(label: "com.deepgram.system-audio-capture", qos: .userInteractive)
        status = AudioDeviceCreateIOProcIDWithBlock(&deviceProcID, aggregateDeviceID, captureQueue, ioBlock)

        guard status == noErr, let procID = deviceProcID else {
            cleanup()
            throw NSError(domain: "AudioTap", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Failed to create IO proc (error \(status))"])
        }

        // Step 6: Start the device
        status = AudioDeviceStart(aggregateDeviceID, procID)
        guard status == noErr else {
            cleanup()
            throw NSError(domain: "AudioTap", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "Failed to start audio device (error \(status))"])
        }

        isRunning = true
    }

    /// Stop capturing
    func stop() {
        guard isRunning else { return }
        isRunning = false

        if let procID = deviceProcID {
            AudioDeviceStop(aggregateDeviceID, procID)
            AudioDeviceDestroyIOProcID(aggregateDeviceID, procID)
        }

        cleanup()
    }

    private func cleanup() {
        if aggregateDeviceID.isValid {
            AudioHardwareDestroyAggregateDevice(aggregateDeviceID)
            aggregateDeviceID = .unknown
        }
        if tapID.isValid {
            AudioHardwareDestroyProcessTap(tapID)
            tapID = .unknown
        }
        deviceProcID = nil
    }

    func getFrequencyBands() -> [Double]? {
        return analyzer?.getFrequencyBands()
    }

    deinit {
        stop()
    }
}
