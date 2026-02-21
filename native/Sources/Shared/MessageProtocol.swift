import Foundation

/// JSON messages sent over stderr to communicate with the Node.js host process
public enum Message {
    case ready(sampleRate: Int, channels: Int, bitDepth: Int, chunkDurationMs: Int, frequencyBands: [Double]? = nil)

    case error(code: String, message: String)
    case stopped(reason: String)
    case audioLevel(rms: Double, peak: Double, fft: [[String: Double]], timestamp: Double)

    public func send() {
        var json: [String: Any]
        switch self {
        case .ready(let sampleRate, let channels, let bitDepth, let chunkDurationMs, let frequencyBands):
            json = [
                "type": "ready",
                "sampleRate": sampleRate,
                "channels": channels,
                "bitDepth": bitDepth,
                "chunkDurationMs": chunkDurationMs
            ]
            if let bands = frequencyBands {
                json["frequencyBands"] = bands
            }
        case .error(let code, let message):
            json = [
                "type": "error",
                "code": code,
                "message": message
            ]
        case .stopped(let reason):
            json = [
                "type": "stopped",
                "reason": reason
            ]
        case .audioLevel(let rms, let peak, let fft, let timestamp):
            json = [
                "type": "audio_level",
                "rms": rms,
                "peak": peak,
                "fft": fft,
                "timestamp": timestamp
            ]
        }

        guard let data = try? JSONSerialization.data(withJSONObject: json),
              let string = String(data: data, encoding: .utf8) else {
            return
        }

        // Write to stderr as newline-delimited JSON
        FileHandle.standardError.write(Data((string + "\n").utf8))
    }
}

/// Error codes matching what the TypeScript side expects
public enum ErrorCode {
    public static let permissionDenied = "PERMISSION_DENIED"
    public static let deviceNotFound = "DEVICE_NOT_FOUND"
    public static let captureError = "CAPTURE_ERROR"
    public static let invalidArgs = "INVALID_ARGS"
}
