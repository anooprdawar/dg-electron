import Foundation
import AVFAudio
import AVFoundation
import CoreAudio
import Shared

/// Captures microphone audio using AVAudioEngine and writes PCM to stdout
final class MicCaptureEngine {
    private let format: AudioFormat
    private let chunkDurationMs: Int
    private let pcmWriter = PCMWriter()
    private var audioEngine: AVAudioEngine?
    private var analyzer: AudioAnalyzer?

    enum PermissionStatus: String {
        case granted
        case denied
        case undetermined
    }

    init(format: AudioFormat, chunkDurationMs: Int, enableLevels: Bool = false, fftBins: Int = 128, levelIntervalMs: Int = 50) {
        self.format = format
        self.chunkDurationMs = chunkDurationMs
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

    /// Start capturing microphone audio
    func start() throws {
        let engine = AVAudioEngine()
        self.audioEngine = engine

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
