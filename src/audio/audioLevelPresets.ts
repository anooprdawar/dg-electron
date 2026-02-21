import type { AudioLevelsConfig } from "../types.js";

export interface ResolvedAudioLevels {
  enabled: boolean;
  fftBins: number;
  intervalMs: number;
}

const PRESETS: Record<string, ResolvedAudioLevels> = {
  spectrogram: { enabled: true, fftBins: 128, intervalMs: 50 },
  "vu-meter": { enabled: true, fftBins: 0, intervalMs: 100 },
  waveform: { enabled: true, fftBins: 0, intervalMs: 20 },
};

export function resolveAudioLevels(config?: AudioLevelsConfig): ResolvedAudioLevels {
  if (!config) return { enabled: false, fftBins: 0, intervalMs: 50 };

  if (config.preset) {
    return PRESETS[config.preset] ?? { enabled: false, fftBins: 0, intervalMs: 50 };
  }

  return {
    enabled: config.enabled ?? false,
    fftBins: config.fftBins ?? 128,
    intervalMs: config.intervalMs ?? 50,
  };
}
