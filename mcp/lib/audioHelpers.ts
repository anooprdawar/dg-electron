import { extname } from "node:path";

export const MIME_MAP: Record<string, string> = {
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  m4a: "audio/mp4",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  webm: "audio/webm",
  opus: "audio/ogg",
  aac: "audio/aac",
  aiff: "audio/aiff",
  aif: "audio/aiff",
};

export function getMimeType(filePath: string): string {
  const ext = extname(filePath).slice(1).toLowerCase();
  return MIME_MAP[ext] ?? "audio/mpeg";
}

export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
  speaker?: number;
}

export interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

export interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

export interface DeepgramSentimentSegment {
  text: string;
  start_word: number;
  end_word: number;
  sentiment: string;
  sentiment_score: number;
}

export interface DeepgramTopicSegment {
  text: string;
  start_word: number;
  end_word: number;
  topics: Array<{ topic: string; confidence_score: number }>;
}

export interface DeepgramResponse {
  metadata?: {
    duration?: number;
    channels?: number;
    model?: string;
  };
  results?: {
    channels?: DeepgramChannel[];
    summary?: {
      short?: string;
      result?: string;
    };
    sentiments?: {
      segments?: DeepgramSentimentSegment[];
      average?: {
        sentiment: string;
        sentiment_score: number;
      };
    };
    topics?: {
      segments?: DeepgramTopicSegment[];
    };
  };
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
