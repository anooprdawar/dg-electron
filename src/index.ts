// Main API
export { DeepgramElectron } from "./transcription/TranscriptionManager.js";

// Permission checking
export { checkPermissions } from "./permissions/PermissionChecker.js";

// Types
export type {
  AudioSource,
  PermissionStatus,
  PermissionResult,
  TranscriptWord,
  TranscriptEvent,
  UtteranceEndEvent,
  DeepgramOptions,
  SystemAudioOptions,
  MicOptions,
  DeepgramElectronConfig,
  DeepgramElectronEvents,
} from "./types.js";

// Errors
export {
  DeepgramElectronError,
  PermissionDeniedError,
  PlatformError,
  ConnectionError,
  BinaryError,
} from "./errors.js";
