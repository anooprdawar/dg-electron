import { execSync } from "node:child_process";
import { PlatformError } from "../errors.js";

/** Minimum macOS version required (Sonoma 14.2 for Core Audio Taps) */
const MIN_MACOS_MAJOR = 14;
const MIN_MACOS_MINOR = 2;

/** Get the current macOS version as [major, minor, patch] */
export function getMacOSVersion(): [number, number, number] {
  if (process.platform !== "darwin") {
    throw new PlatformError(
      "@deepgram/electron is only supported on macOS."
    );
  }

  try {
    const version = execSync("sw_vers -productVersion", {
      encoding: "utf8",
    }).trim();
    const parts = version.split(".").map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  } catch {
    throw new PlatformError("Failed to determine macOS version.");
  }
}

/** Verify the current platform meets minimum requirements */
export function assertPlatform(): void {
  const [major, minor] = getMacOSVersion();

  if (
    major < MIN_MACOS_MAJOR ||
    (major === MIN_MACOS_MAJOR && minor < MIN_MACOS_MINOR)
  ) {
    throw new PlatformError(
      `macOS ${major}.${minor} detected. @deepgram/electron requires macOS ${MIN_MACOS_MAJOR}.${MIN_MACOS_MINOR}+ (Sonoma with Core Audio Taps).`
    );
  }
}
