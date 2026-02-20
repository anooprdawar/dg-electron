import Foundation
import CoreAudio

/// Audio format configuration shared between capture binaries
public struct AudioFormat {
    public let sampleRate: Float64
    public let channels: UInt32
    public let bitDepth: UInt32

    public static let defaultFormat = AudioFormat(
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16
    )

    public init(sampleRate: Float64, channels: UInt32, bitDepth: UInt32) {
        self.sampleRate = sampleRate
        self.channels = channels
        self.bitDepth = bitDepth
    }

    public var bytesPerFrame: UInt32 {
        return channels * (bitDepth / 8)
    }

    public var bytesPerSecond: UInt32 {
        return UInt32(sampleRate) * bytesPerFrame
    }

    /// Create an AudioStreamBasicDescription for linear PCM
    public var streamDescription: AudioStreamBasicDescription {
        return AudioStreamBasicDescription(
            mSampleRate: sampleRate,
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked,
            mBytesPerPacket: bytesPerFrame,
            mFramesPerPacket: 1,
            mBytesPerFrame: bytesPerFrame,
            mChannelsPerFrame: channels,
            mBitsPerChannel: bitDepth,
            mReserved: 0
        )
    }
}
