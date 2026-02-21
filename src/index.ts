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
  AudioLevelEvent,
  AudioLevelPreset,
  AudioLevelsConfig,
  BatchProgressEvent,
  InputDevice,
  FFTBin,
  TranscriptionMode,
} from "./types.js";

// Errors
export {
  DeepgramElectronError,
  PermissionDeniedError,
  PlatformError,
  ConnectionError,
  BinaryError,
} from "./errors.js";
