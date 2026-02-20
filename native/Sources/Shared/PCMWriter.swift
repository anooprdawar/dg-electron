import Foundation

/// Writes PCM audio data to stdout for consumption by the Node.js host process.
/// Thread-safe: uses a serial dispatch queue to serialize writes.
public final class PCMWriter {
    private let writeQueue = DispatchQueue(label: "com.deepgram.pcm-writer", qos: .userInteractive)
    private let stdout = FileHandle.standardOutput
    private var totalBytesWritten: UInt64 = 0

    public init() {}

    /// Write raw PCM bytes to stdout
    public func write(_ data: Data) {
        writeQueue.sync {
            self.stdout.write(data)
            self.totalBytesWritten += UInt64(data.count)
        }
    }

    /// Write PCM samples from a raw pointer (used with AVAudioPCMBuffer)
    public func write(from pointer: UnsafeRawPointer, byteCount: Int) {
        let data = Data(bytes: pointer, count: byteCount)
        write(data)
    }
}
