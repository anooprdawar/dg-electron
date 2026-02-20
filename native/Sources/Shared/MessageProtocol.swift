import Foundation

/// JSON messages sent over stderr to communicate with the Node.js host process
public enum Message {
    case ready(sampleRate: Int, channels: Int, bitDepth: Int, chunkDurationMs: Int)
    case error(code: String, message: String)
    case stopped(reason: String)

    public func send() {
        let json: [String: Any]
        switch self {
        case .ready(let sampleRate, let channels, let bitDepth, let chunkDurationMs):
            json = [
                "type": "ready",
                "sampleRate": sampleRate,
                "channels": channels,
                "bitDepth": bitDepth,
                "chunkDurationMs": chunkDurationMs
            ]
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
