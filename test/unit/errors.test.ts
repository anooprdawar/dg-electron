import { describe, it, expect } from "vitest";
import {
  DeepgramElectronError,
  PermissionDeniedError,
  PlatformError,
  ConnectionError,
  BinaryError,
} from "../../src/errors.js";

describe("DeepgramElectronError", () => {
  it("creates error with correct name and message", () => {
    const err = new DeepgramElectronError("test message");
    expect(err.name).toBe("DeepgramElectronError");
    expect(err.message).toBe("test message");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("PermissionDeniedError", () => {
  it("creates system_audio error with default message", () => {
    const err = new PermissionDeniedError("system_audio");
    expect(err.name).toBe("PermissionDeniedError");
    expect(err.permission).toBe("system_audio");
    expect(err.message).toContain("System audio recording");
    expect(err).toBeInstanceOf(DeepgramElectronError);
  });

  it("creates microphone error with default message", () => {
    const err = new PermissionDeniedError("microphone");
    expect(err.permission).toBe("microphone");
    expect(err.message).toContain("Microphone access");
  });

  it("accepts custom message", () => {
    const err = new PermissionDeniedError("microphone", "Custom msg");
    expect(err.message).toBe("Custom msg");
  });
});

describe("PlatformError", () => {
  it("creates error with default message", () => {
    const err = new PlatformError();
    expect(err.name).toBe("PlatformError");
    expect(err.message).toContain("macOS 14.2");
  });

  it("accepts custom message", () => {
    const err = new PlatformError("Custom platform msg");
    expect(err.message).toBe("Custom platform msg");
  });
});

describe("ConnectionError", () => {
  it("creates error with code and retryable flag", () => {
    const err = new ConnectionError("timeout", 408, true);
    expect(err.name).toBe("ConnectionError");
    expect(err.message).toBe("timeout");
    expect(err.code).toBe(408);
    expect(err.retryable).toBe(true);
  });

  it("defaults retryable to true", () => {
    const err = new ConnectionError("error");
    expect(err.retryable).toBe(true);
  });
});

describe("BinaryError", () => {
  it("creates error with binary name and exit code", () => {
    const err = new BinaryError("dg-system-audio", "crashed", 1);
    expect(err.name).toBe("BinaryError");
    expect(err.binaryName).toBe("dg-system-audio");
    expect(err.exitCode).toBe(1);
    expect(err.message).toContain("dg-system-audio");
    expect(err.message).toContain("crashed");
  });
});
