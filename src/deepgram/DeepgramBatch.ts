import { request } from "node:https";
import { request as httpRequest } from "node:http";
import { URL } from "node:url";
import type { DeepgramOptions, TranscriptEvent, TranscriptWord } from "../types.js";
import { ConnectionError } from "../errors.js";
import { Logger } from "../util/logger.js";

const DEFAULT_API_URL = "https://api.deepgram.com/v1/listen";

export class DeepgramBatch {
  private readonly options: DeepgramOptions;
  private readonly sampleRate: number;
  private readonly logger: Logger;
  private chunks: Buffer[] = [];
  private totalBytes = 0;

  constructor(
    options: DeepgramOptions,
    sampleRate: number,
    logLevel?: "debug" | "info" | "warn" | "error" | "silent"
  ) {
    this.options = options;
    this.sampleRate = sampleRate;
    this.logger = new Logger("deepgram-batch", logLevel);
  }

  get bytesRecorded(): number {
    return this.totalBytes;
  }

  addChunk(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.totalBytes += chunk.length;
  }

  clear(): void {
    this.chunks = [];
    this.totalBytes = 0;
  }

  async transcribe(): Promise<TranscriptEvent[]> {
    if (this.totalBytes === 0) {
      throw new Error("No audio data recorded");
    }

    const audioBuffer = Buffer.concat(this.chunks);
    const url = this.buildUrl();
    this.logger.info(`Uploading ${audioBuffer.length} bytes to ${url}`);

    const response = await this.postAudio(url, audioBuffer);
    return this.parseResponse(response);
  }

  private buildUrl(): string {
    const base = this.options.apiUrl
      ? this.options.apiUrl.replace("wss://", "https://").replace("ws://", "http://")
      : DEFAULT_API_URL;
    const params = new URLSearchParams();

    params.set("encoding", this.options.encoding ?? "linear16");
    params.set("sample_rate", String(this.sampleRate));
    params.set("channels", "1");
    params.set("model", this.options.model ?? "nova-3");
    params.set("language", this.options.language ?? "en");

    if (this.options.punctuate !== false) {
      params.set("punctuate", "true");
    }
    if (this.options.smart_format !== false) {
      params.set("smart_format", "true");
    }
    if (this.options.utterances) {
      params.set("utterances", "true");
    }

    return `${base}?${params.toString()}`;
  }

  private postAudio(urlStr: string, audio: Buffer): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const isHttps = url.protocol === "https:";
      const reqFn = isHttps ? request : httpRequest;

      const req = reqFn(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: "POST",
          headers: {
            Authorization: `Token ${this.options.apiKey}`,
            "Content-Type": "audio/raw",
            "Content-Length": audio.length,
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk: any) => (body += chunk));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(body));
              } catch {
                reject(new ConnectionError("Invalid JSON response from Deepgram"));
              }
            } else {
              reject(
                new ConnectionError(
                  `Deepgram batch API error (${res.statusCode}): ${body}`,
                  res.statusCode
                )
              );
            }
          });
        }
      );

      req.on("error", (err: Error) => {
        reject(new ConnectionError(`Batch upload failed: ${err.message}`));
      });

      req.write(audio);
      req.end();
    });
  }

  private parseResponse(response: any): TranscriptEvent[] {
    const events: TranscriptEvent[] = [];
    const channels = response.results?.channels ?? [];

    for (const channel of channels) {
      for (const alt of channel.alternatives ?? []) {
        if (!alt.transcript) continue;

        const words: TranscriptWord[] = (alt.words ?? []).map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
          punctuated_word: w.punctuated_word,
        }));

        events.push({
          source: "system", // source is set by the caller
          transcript: alt.transcript,
          is_final: true,
          confidence: alt.confidence ?? 0,
          words,
          duration: response.metadata?.duration,
        });
      }
    }

    return events;
  }
}
