/** Source of a transcript event */
export type AudioSource = "system" | "mic";

/** FFT frequency bin with labeled frequency */
export interface FFTBin {
  freq: number;
  magnitude: number;
}

/** Audio level event for visualizations */
export interface AudioLevelEvent {
  source: AudioSource;
  rms: number;
  peak: number;
  fft: FFTBin[];
  timestamp: number;
}

/** Available audio input device */
export interface InputDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

/** Batch transcription progress */
export interface BatchProgressEvent {
  phase: "recording" | "uploading" | "processing";
  bytesRecorded?: number;
}

/** Audio level configuration presets */
export type AudioLevelPreset = "spectrogram" | "vu-meter" | "waveform";

/** Audio level configuration */
export interface AudioLevelsConfig {
  preset?: AudioLevelPreset;
  enabled?: boolean;
  fftBins?: number;
  intervalMs?: number;
}

/** Transcription mode */
export type TranscriptionMode = "streaming" | "batch";

/** Permission status for an audio source */
export type PermissionStatus = "granted" | "denied" | "unknown";

/** Permission check result */
export interface PermissionResult {
  systemAudio: PermissionStatus;
  microphone: PermissionStatus;
}

/** A single transcribed word with timing */
export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
}

/** Transcript event emitted to consumers */
export interface TranscriptEvent {
  /** Which audio source produced this transcript */
  source: AudioSource;
  /** The transcribed text */
  transcript: string;
  /** Whether this is a final (non-interim) result */
  is_final: boolean;
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Individual word details */
  words: TranscriptWord[];
  /** Speech is final for this utterance */
  speech_final?: boolean;
  /** Channel index */
  channel_index?: number[];
  /** Duration of audio processed */
  duration?: number;
  /** Start time of this segment */
  start?: number;
}

/** Utterance end event */
export interface UtteranceEndEvent {
  source: AudioSource;
  last_word_end?: number;
}

/** Deepgram connection options */
export interface DeepgramOptions {
  /** Deepgram API key */
  apiKey: string;
  /** Transcription model (default: "nova-3") */
  model?: string;
  /** Language code (default: "en") */
  language?: string;
  /** Enable punctuation (default: true) */
  punctuate?: boolean;
  /** Enable smart formatting (default: true) */
  smart_format?: boolean;
  /** Enable utterance detection */
  utterances?: boolean;
  /** Utterance end silence threshold in ms */
  utterance_end_ms?: number;
  /** Interim results (default: true) */
  interim_results?: boolean;
  /** Voice activity detection events */
  vad_events?: boolean;
  /** Encoding override (default: "linear16") */
  encoding?: string;
  /** Custom Deepgram API URL */
  apiUrl?: string;
}

/** System audio capture options */
export interface SystemAudioOptions {
  /** Enable system audio capture (default: true) */
  enabled?: boolean;
  /** Sample rate in Hz (default: 16000) */
  sampleRate?: number;
  /** Chunk duration in ms for buffering (default: 200) */
  chunkDurationMs?: number;
  /** Mute system audio while capturing (default: false) */
  mute?: boolean;
  /** Only capture audio from these process IDs */
  includeProcesses?: number[];
  /** Exclude audio from these process IDs */
  excludeProcesses?: number[];
}

/** Microphone capture options */
export interface MicOptions {
  /** Enable microphone capture (default: true) */
  enabled?: boolean;
  /** Sample rate in Hz (default: 16000) */
  sampleRate?: number;
  /** Chunk duration in ms for buffering (default: 200) */
  chunkDurationMs?: number;
  /** Specific audio input device ID */
  deviceId?: string;
}

/** Top-level configuration for DeepgramElectron */
export interface DeepgramElectronConfig {
  /** Deepgram API connection settings */
  deepgram: DeepgramOptions;
  /** System audio capture settings */
  systemAudio?: SystemAudioOptions;
  /** Microphone capture settings */
  mic?: MicOptions;
  /** Log level */
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
  /** Transcription mode: streaming (default) or batch */
  mode?: TranscriptionMode;
  /** Audio level reporting configuration */
  audioLevels?: AudioLevelsConfig;
}

/** Events emitted by DeepgramElectron */
export interface DeepgramElectronEvents {
  transcript: (event: TranscriptEvent) => void;
  system_transcript: (event: TranscriptEvent) => void;
  mic_transcript: (event: TranscriptEvent) => void;
  utterance_end: (event: UtteranceEndEvent) => void;
  audio_level: (event: AudioLevelEvent) => void;
  batch_progress: (event: BatchProgressEvent) => void;
  started: () => void;
  stopped: () => void;
  error: (error: Error) => void;
}

/** Control message from Swift binary over stderr */
export interface BinaryMessage {
  type: "ready" | "error" | "stopped" | "audio_level";
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  chunkDurationMs?: number;
  code?: string;
  message?: string;
  reason?: string;
  frequencyBands?: number[];
  rms?: number;
  peak?: number;
  fft?: { freq: number; magnitude: number }[];
  timestamp?: number;
}
