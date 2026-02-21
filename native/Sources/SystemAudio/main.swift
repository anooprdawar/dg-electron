import Foundation
import Shared

// MARK: - Argument Parsing

var sampleRate: Int = 16000
var chunkDurationMs: Int = 200
var muteOutput: Bool = false
var includeProcesses: [pid_t] = []
var excludeProcesses: [pid_t] = []
var checkPermissionOnly: Bool = false
var enableLevels: Bool = false
var levelIntervalMs: Int = 50
var fftBins: Int = 128

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
    case "--mute":
        muteOutput = true
    case "--include-processes":
        guard let next = args.first else {
            Message.error(code: ErrorCode.invalidArgs, message: "Missing value for --include-processes").send()
            exit(1)
        }
        includeProcesses = next.split(separator: ",").compactMap { pid_t($0) }
        args = args.dropFirst()
    case "--exclude-processes":
        guard let next = args.first else {
            Message.error(code: ErrorCode.invalidArgs, message: "Missing value for --exclude-processes").send()
            exit(1)
        }
        excludeProcesses = next.split(separator: ",").compactMap { pid_t($0) }
        args = args.dropFirst()
    case "--check-permission":
        checkPermissionOnly = true
    case "--enable-levels":
        enableLevels = true
    case "--level-interval-ms":
        guard let next = args.first, let value = Int(next) else {
            Message.error(code: ErrorCode.invalidArgs, message: "Missing value for --level-interval-ms").send()
            exit(1)
        }
        levelIntervalMs = value
        args = args.dropFirst()
    case "--fft-bins":
        guard let next = args.first, let value = Int(next) else {
            Message.error(code: ErrorCode.invalidArgs, message: "Missing value for --fft-bins").send()
            exit(1)
        }
        fftBins = value
        args = args.dropFirst()
    default:
        Message.error(code: ErrorCode.invalidArgs, message: "Unknown argument: \(arg)").send()
        exit(1)
    }
}

// MARK: - Main

if #available(macOS 14.2, *) {
    let format = AudioFormat(
        sampleRate: Float64(sampleRate),
        channels: 1,
        bitDepth: 16
    )

    let manager = AudioTapManager(format: format, chunkDurationMs: chunkDurationMs, mute: muteOutput, enableLevels: enableLevels, fftBins: fftBins, levelIntervalMs: levelIntervalMs)

    if checkPermissionOnly {
        let hasPermission = manager.checkPermission()
        if hasPermission {
            Message.ready(sampleRate: sampleRate, channels: 1, bitDepth: 16, chunkDurationMs: chunkDurationMs).send()
        } else {
            Message.error(code: ErrorCode.permissionDenied, message: "System audio recording not granted").send()
        }
        exit(hasPermission ? 0 : 1)
    }

    // Handle SIGTERM/SIGINT for graceful shutdown
    let stopSemaphore = DispatchSemaphore(value: 0)

    signal(SIGTERM, SIG_IGN)
    signal(SIGINT, SIG_IGN)

    let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    termSource.setEventHandler {
        manager.stop()
        Message.stopped(reason: "signal").send()
        stopSemaphore.signal()
    }
    termSource.resume()

    let intSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    intSource.setEventHandler {
        manager.stop()
        Message.stopped(reason: "signal").send()
        stopSemaphore.signal()
    }
    intSource.resume()

    // Start capture
    do {
        try manager.start(
            includeProcesses: includeProcesses,
            excludeProcesses: excludeProcesses
        )
        Message.ready(sampleRate: sampleRate, channels: 1, bitDepth: 16, chunkDurationMs: chunkDurationMs, frequencyBands: manager.getFrequencyBands()).send()
    } catch {
        Message.error(code: ErrorCode.captureError, message: error.localizedDescription).send()
        exit(1)
    }

    // Keep running until signal
    stopSemaphore.wait()
    exit(0)
} else {
    Message.error(code: "UNSUPPORTED_OS", message: "macOS 14.2 or later is required for system audio capture").send()
    exit(1)
}
