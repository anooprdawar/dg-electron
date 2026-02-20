// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DeepgramAudioCapture",
    platforms: [
        .macOS(.v14)
    ],
    targets: [
        .target(
            name: "Shared",
            path: "Sources/Shared"
        ),
        .executableTarget(
            name: "dg-system-audio",
            dependencies: ["Shared"],
            path: "Sources/SystemAudio",
            linkerSettings: [
                .linkedFramework("CoreAudio"),
                .linkedFramework("AudioToolbox"),
            ]
        ),
        .executableTarget(
            name: "dg-mic-audio",
            dependencies: ["Shared"],
            path: "Sources/MicAudio",
            linkerSettings: [
                .linkedFramework("AVFAudio"),
                .linkedFramework("AVFoundation"),
            ]
        ),
    ]
)
