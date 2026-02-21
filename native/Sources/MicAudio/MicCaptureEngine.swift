import Foundation
import AVFAudio
import AVFoundation
import CoreAudio
import Shared

struct AudioInputDevice {
    let id: String
    let name: String
    let isDefault: Bool
}

/// Captures microphone audio using AVAudioEngine and writes PCM to stdout
final class MicCaptureEngine {
    private let format: AudioFormat
    private let chunkDurationMs: Int
    private let pcmWriter = PCMWriter()
    private var audioEngine: AVAudioEngine?
    private var analyzer: AudioAnalyzer?
    private let deviceId: String?

    enum PermissionStatus: String {
        case granted
        case denied
        case undetermined
    }

    init(format: AudioFormat, chunkDurationMs: Int, enableLevels: Bool = false, fftBins: Int = 128, levelIntervalMs: Int = 50, deviceId: String? = nil) {
        self.format = format
        self.chunkDurationMs = chunkDurationMs
        self.deviceId = deviceId
        if enableLevels {
            self.analyzer = AudioAnalyzer(sampleRate: format.sampleRate, fftBins: fftBins, intervalMs: levelIntervalMs)
        }
    }

    /// Check microphone permission status
    func checkPermission() -> PermissionStatus {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            return .granted
        case .denied, .restricted:
            return .denied
        case .notDetermined:
            return .undetermined
        @unknown default:
            return .denied
        }
    }

    static func listDevices() -> [AudioInputDevice] {
        let defaultID = getDefaultInputDeviceID()

        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size) == noErr else {
            return []
        }

        let count = Int(size) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: count)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &deviceIDs) == noErr else {
            return []
        }

        var devices: [AudioInputDevice] = []
        for deviceID in deviceIDs {
            // Check if device has input channels
            var inputAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyStreamConfiguration,
                mScope: kAudioObjectPropertyScopeInput,
                mElement: kAudioObjectPropertyElementMain
            )
            var streamSize: UInt32 = 0
            guard AudioObjectGetPropertyDataSize(deviceID, &inputAddress, 0, nil, &streamSize) == noErr,
                  streamSize > 0 else { continue }

            let bufferListData = UnsafeMutableRawPointer.allocate(byteCount: Int(streamSize), alignment: MemoryLayout<AudioBufferList>.alignment)
            defer { bufferListData.deallocate() }
            guard AudioObjectGetPropertyData(deviceID, &inputAddress, 0, nil, &streamSize, bufferListData) == noErr else { continue }
            let bufferList = bufferListData.assumingMemoryBound(to: AudioBufferList.self).pointee

            // Sum up input channels across all buffers
            var totalChannels: UInt32 = 0
            let bufferCount = Int(bufferList.mNumberBuffers)
            if bufferCount > 0 {
                withUnsafePointer(to: bufferList.mBuffers) { ptr in
                    let buffers = UnsafeBufferPointer(start: ptr, count: bufferCount)
                    for buf in buffers {
                        totalChannels += buf.mNumberChannels
                    }
                }
            }
            guard totalChannels > 0 else { continue }

            // Get device name
            var nameAddress = AudioObjectPropertyAddress(
                mSelector: kAudioObjectPropertyName,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            var name: CFString = "" as CFString
            var nameSize = UInt32(MemoryLayout<CFString>.size)
            AudioObjectGetPropertyData(deviceID, &nameAddress, 0, nil, &nameSize, &name)

            // Get device UID
            var uidAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDeviceUID,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            var uid: CFString = "" as CFString
            var uidSize = UInt32(MemoryLayout<CFString>.size)
            AudioObjectGetPropertyData(deviceID, &uidAddress, 0, nil, &uidSize, &uid)

            devices.append(AudioInputDevice(
                id: uid as String,
                name: name as String,
                isDefault: deviceID == defaultID
            ))
        }
        return devices
    }

    private static func getDefaultInputDeviceID() -> AudioDeviceID {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var deviceID: AudioDeviceID = 0
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &deviceID)
        return deviceID
    }

    private func setInputDevice(engine: AVAudioEngine, uid: String) throws {
        // Find device ID by UID
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size)
        let count = Int(size) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: count)
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &deviceIDs)

        for deviceID in deviceIDs {
            var uidAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDeviceUID,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            var deviceUID: CFString = "" as CFString
            var uidSize = UInt32(MemoryLayout<CFString>.size)
            AudioObjectGetPropertyData(deviceID, &uidAddress, 0, nil, &uidSize, &deviceUID)

            if (deviceUID as String) == uid {
                let audioUnit = engine.inputNode.audioUnit!
                var inputDeviceID = deviceID
                let status = AudioUnitSetProperty(
                    audioUnit,
                    kAudioOutputUnitProperty_CurrentDevice,
                    kAudioUnitScope_Global,
                    0,
                    &inputDeviceID,
                    UInt32(MemoryLayout<AudioDeviceID>.size)
                )
                guard status == noErr else {
                    throw NSError(domain: "MicCapture", code: Int(status),
                        userInfo: [NSLocalizedDescriptionKey: "Failed to set input device (error \(status))"])
                }
                return
            }
        }

        let available = MicCaptureEngine.listDevices().map { "\($0.name) (\($0.id))" }.joined(separator: ", ")
        throw NSError(domain: "MicCapture", code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Device not found: \(uid). Available: \(available)"])
    }

    /// Start capturing microphone audio
    func start() throws {
        let engine = AVAudioEngine()
        self.audioEngine = engine

        // Select specific input device if requested
        if let deviceId = self.deviceId {
            try setInputDevice(engine: engine, uid: deviceId)
        }

        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)

        // Target format: mono, linear16, at our desired sample rate
        guard let targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: format.sampleRate,
            channels: AVAudioChannelCount(format.channels),
            interleaved: true
        ) else {
            throw NSError(domain: "MicCapture", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Failed to create target audio format"])
        }

        // Install a converter if needed
        guard let converter = AVAudioConverter(from: inputFormat, to: targetFormat) else {
            throw NSError(domain: "MicCapture", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Failed to create audio converter from \(inputFormat) to \(targetFormat)"])
        }

        let writerRef = self.pcmWriter
        let analyzerRef = self.analyzer
        let framesPerChunk = AVAudioFrameCount(format.sampleRate * Double(chunkDurationMs) / 1000.0)

        inputNode.installTap(onBus: 0, bufferSize: framesPerChunk, format: inputFormat) { buffer, _ in
            // Convert to target format
            let frameCapacity = AVAudioFrameCount(
                Double(buffer.frameLength) * targetFormat.sampleRate / inputFormat.sampleRate
            )
            guard frameCapacity > 0 else { return }
            guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCapacity) else {
                return
            }

            var error: NSError?
            let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }

            converter.convert(to: convertedBuffer, error: &error, withInputFrom: inputBlock)

            if let error = error {
                FileHandle.standardError.write(Data("Conversion error: \(error)\n".utf8))
                return
            }

            guard let int16Data = convertedBuffer.int16ChannelData else { return }
            let byteCount = Int(convertedBuffer.frameLength) * MemoryLayout<Int16>.size
            let data = Data(bytes: int16Data[0], count: byteCount)
            writerRef.write(data)

            if let analyzer = analyzerRef {
                let sampleCount = Int(convertedBuffer.frameLength)
                if let result = analyzer.analyze(samples: int16Data[0], count: sampleCount) {
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

        engine.prepare()
        try engine.start()
    }

    /// Stop capturing
    func stop() {
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil
    }

    func getFrequencyBands() -> [Double]? {
        return analyzer?.getFrequencyBands()
    }

    deinit {
        stop()
    }
}
