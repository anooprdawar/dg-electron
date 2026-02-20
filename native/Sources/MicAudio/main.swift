import Foundation
import Shared

// MARK: - Argument Parsing

var sampleRate: Int = 16000
var chunkDurationMs: Int = 200
var checkPermissionOnly: Bool = false

var args = CommandLine.arguments.dropFirst()
while let arg = args.first {
    args = args.dropFirst()
    switch arg {
    case "--sample-rate":
        guard let next = args.first, let value = Int(next) else {
            Message.error(code: ErrorCode.invalidArgs, message: "Missing value for --sample-rate").send()
            exit(1)
        }
        sampleRate = value
        args = args.dropFirst()
    case "--chunk-duration":
        guard let next = args.first, let value = Int(next) else {
            Message.error(code: ErrorCode.invalidArgs, message: "Missing value for --chunk-duration").send()
            exit(1)
        }
        chunkDurationMs = value
        args = args.dropFirst()
    case "--check-permission":
        checkPermissionOnly = true
    default:
        Message.error(code: ErrorCode.invalidArgs, message: "Unknown argument: \(arg)").send()
        exit(1)
    }
}

// MARK: - Main

let format = AudioFormat(
    sampleRate: Float64(sampleRate),
    channels: 1,
    bitDepth: 16
)

let engine = MicCaptureEngine(format: format, chunkDurationMs: chunkDurationMs)

if checkPermissionOnly {
    let status = engine.checkPermission()
    if status == .granted {
        Message.ready(sampleRate: sampleRate, channels: 1, bitDepth: 16, chunkDurationMs: chunkDurationMs).send()
        exit(0)
    } else {
        Message.error(code: ErrorCode.permissionDenied, message: "Microphone access not granted (status: \(status))").send()
        exit(1)
    }
}

// Handle SIGTERM/SIGINT for graceful shutdown
let stopSemaphore = DispatchSemaphore(value: 0)

signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)

let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
termSource.setEventHandler {
    engine.stop()
    Message.stopped(reason: "signal").send()
    stopSemaphore.signal()
}
termSource.resume()

let intSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
intSource.setEventHandler {
    engine.stop()
    Message.stopped(reason: "signal").send()
    stopSemaphore.signal()
}
intSource.resume()

// Start capture
do {
    try engine.start()
    Message.ready(sampleRate: sampleRate, channels: 1, bitDepth: 16, chunkDurationMs: chunkDurationMs).send()
} catch {
    Message.error(code: ErrorCode.captureError, message: error.localizedDescription).send()
    exit(1)
}

// Keep running until signal
stopSemaphore.wait()
exit(0)
