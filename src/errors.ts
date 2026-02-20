/** Base error class for @deepgram/electron */
export class DeepgramElectronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepgramElectronError";
  }
}

/** Thrown when required macOS permissions are not granted */
export class PermissionDeniedError extends DeepgramElectronError {
  public readonly permission: "system_audio" | "microphone";

  constructor(permission: "system_audio" | "microphone", message?: string) {
    super(
      message ??
        `Permission denied: ${permission === "system_audio" ? "System audio recording" : "Microphone access"} not granted. ` +
          `Please grant permission in System Settings > Privacy & Security.`
    );
    this.name = "PermissionDeniedError";
    this.permission = permission;
  }
}

/** Thrown when running on an unsupported platform */
export class PlatformError extends DeepgramElectronError {
  constructor(message?: string) {
    super(
      message ??
        "@deepgram/electron requires macOS 14.2 (Sonoma) or later with Core Audio Taps support."
    );
    this.name = "PlatformError";
  }
}

/** Thrown when the Deepgram WebSocket connection fails */
export class ConnectionError extends DeepgramElectronError {
  public readonly code?: number;
  public readonly retryable: boolean;

  constructor(message: string, code?: number, retryable = true) {
    super(message);
    this.name = "ConnectionError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Thrown when a Swift binary fails to start or crashes */
export class BinaryError extends DeepgramElectronError {
  public readonly binaryName: string;
  public readonly exitCode?: number;

  constructor(binaryName: string, message: string, exitCode?: number) {
    super(`${binaryName}: ${message}`);
    this.name = "BinaryError";
    this.binaryName = binaryName;
    this.exitCode = exitCode;
  }
}
