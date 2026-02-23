// Main API
export { DeepgramElectron } from "./transcription/TranscriptionManager.js";
export { DeepgramFlux } from "./transcription/DeepgramFlux.js";
export type { DeepgramFluxConfig, DeepgramFluxEvents } from "./transcription/DeepgramFlux.js";

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
  FluxTurnEvent,
  FluxOptions,
} from "./types.js";

// Errors
export {
  DeepgramElectronError,
  PermissionDeniedError,
  PlatformError,
  ConnectionError,
  BinaryError,
} from "./errors.js";
