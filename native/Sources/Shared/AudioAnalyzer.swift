import Foundation
import Accelerate

/// Result of audio level analysis for a chunk of PCM data
public struct AudioLevelResult {
    public let rms: Double
    public let peak: Double
    public let fft: [(freq: Double, magnitude: Double)]
    public let timestamp: TimeInterval
}

/// Computes RMS, peak, and optional FFT audio levels from Int16 PCM data.
/// Uses Apple's Accelerate framework (vDSP) for efficient DSP operations.
public final class AudioAnalyzer {
    private let sampleRate: Float64
    private let fftBins: Int
    private let intervalMs: Int

    // FFT resources (nil when fftBins == 0)
    private let fftLength: Int
    private let dftSetup: vDSP_DFT_Setup?
    private var window: [Float]
    private var frequencyBands: [Double]

    // Throttling
    private var lastEmitTime: TimeInterval = 0

    public init(sampleRate: Float64, fftBins: Int, intervalMs: Int) {
        self.sampleRate = sampleRate
        self.fftBins = fftBins
        self.intervalMs = intervalMs

        if fftBins > 0 {
            // FFT length must be power of 2, at least 2x fftBins
            let minLength = fftBins * 2
            var length = 1
            while length < minLength {
                length *= 2
            }
            self.fftLength = length

            // Create DFT setup for forward real-to-complex transform
            self.dftSetup = vDSP_DFT_zop_CreateSetup(
                nil,
                vDSP_Length(length),
                .FORWARD
            )

            // Precompute Hanning window
            self.window = [Float](repeating: 0, count: length)
            vDSP_hann_window(&self.window, vDSP_Length(length), Int32(vDSP_HANN_NORM))

            // Precompute frequency band labels for the first fftBins bins
            let binResolution = sampleRate / Double(length)
            self.frequencyBands = (0..<fftBins).map { Double($0) * binResolution }
        } else {
            self.fftLength = 0
            self.dftSetup = nil
            self.window = []
            self.frequencyBands = []
        }
    }

    deinit {
        if let setup = dftSetup {
            vDSP_DFT_DestroySetup(setup)
        }
    }

    /// Returns precomputed frequency band center values in Hz.
    public func getFrequencyBands() -> [Double] {
        return frequencyBands
    }

    /// Analyze a buffer of Int16 PCM samples.
    /// Returns nil if the throttle interval has not elapsed since the last emission.
    public func analyze(samples: UnsafePointer<Int16>, count: Int) -> AudioLevelResult? {
        let now = ProcessInfo.processInfo.systemUptime
        let intervalSec = Double(intervalMs) / 1000.0

        if now - lastEmitTime < intervalSec {
            return nil
        }

        guard count > 0 else { return nil }

        // Convert Int16 to Float
        var floatSamples = [Float](repeating: 0, count: count)
        var int16Copy = [Int16](repeating: 0, count: count)
        memcpy(&int16Copy, samples, count * MemoryLayout<Int16>.size)
        vDSP_vflt16(int16Copy, 1, &floatSamples, 1, vDSP_Length(count))

        // Scale to [-1.0, 1.0]
        var scale: Float = 1.0 / 32768.0
        vDSP_vsmul(floatSamples, 1, &scale, &floatSamples, 1, vDSP_Length(count))

        // Compute RMS
        var rms: Float = 0
        vDSP_rmsqv(floatSamples, 1, &rms, vDSP_Length(count))

        // Compute peak (absolute maximum)
        var peak: Float = 0
        vDSP_maxmgv(floatSamples, 1, &peak, vDSP_Length(count))

        // Compute FFT if configured
        var fftResult: [(freq: Double, magnitude: Double)] = []

        if let setup = dftSetup, fftBins > 0 {
            let length = fftLength

            // Zero-pad or truncate to fftLength, then apply window
            var windowed = [Float](repeating: 0, count: length)
            let copyCount = min(count, length)
            for i in 0..<copyCount {
                windowed[i] = floatSamples[i] * window[i]
            }

            // Prepare split complex input (interleave real into real/imag)
            var inputReal = [Float](repeating: 0, count: length)
            let inputImag = [Float](repeating: 0, count: length)
            for i in 0..<length {
                inputReal[i] = windowed[i]
            }

            // Output buffers
            var outputReal = [Float](repeating: 0, count: length)
            var outputImag = [Float](repeating: 0, count: length)

            // Execute DFT
            vDSP_DFT_Execute(setup, inputReal, inputImag, &outputReal, &outputImag)

            // Compute magnitudes for positive frequencies (first half)
            let halfLength = length / 2
            let binsToReturn = min(fftBins, halfLength)

            var magnitudes = [Float](repeating: 0, count: binsToReturn)
            for i in 0..<binsToReturn {
                let re = outputReal[i]
                let im = outputImag[i]
                magnitudes[i] = sqrtf(re * re + im * im) / Float(length)
            }

            let binResolution = sampleRate / Double(length)
            fftResult = (0..<binsToReturn).map { i in
                (freq: Double(i) * binResolution, magnitude: Double(magnitudes[i]))
            }
        }

        lastEmitTime = now

        return AudioLevelResult(
            rms: Double(rms),
            peak: Double(peak),
            fft: fftResult,
            timestamp: now
        )
    }
}
