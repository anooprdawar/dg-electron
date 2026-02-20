/** Raw Deepgram WebSocket response */
export interface DeepgramResponse {
  type: "Results" | "Metadata" | "UtteranceEnd" | "SpeechStarted" | "Error";
  channel_index?: number[];
  duration?: number;
  start?: number;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives: DeepgramAlternative[];
  };
  metadata?: {
    request_id: string;
    model_info?: {
      name: string;
      version: string;
    };
  };
  last_word_end?: number;
  error?: string;
}

export interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
}
