import type { PermissionResult } from "../types.js";
import { DeepgramElectron } from "../transcription/TranscriptionManager.js";

/**
 * Standalone permission checker.
 * Delegates to DeepgramElectron.checkPermissions() for the actual check.
 */
export async function checkPermissions(
  logLevel?: "debug" | "info" | "warn" | "error" | "silent"
): Promise<PermissionResult> {
  return DeepgramElectron.checkPermissions(logLevel);
}
