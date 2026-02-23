import { request } from "node:https";
import { createReadStream } from "node:fs";
import { URL } from "node:url";
import type { DeepgramResponse } from "./audioHelpers.js";

const DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen";
const DEEPGRAM_TTS_URL = "https://api.deepgram.com/v1/speak";

export interface TranscribeFileOptions {
  apiKey: string;
  model?: string;
  language?: string;
  punctuate?: boolean;
  smart_format?: boolean;
  utterances?: boolean;
  diarize?: boolean;
  summarize?: boolean;
  sentiment?: boolean;
  topics?: boolean;
  contentType: string;
}

export function transcribeFile(
  filePath: string,
  opts: TranscribeFileOptions
): Promise<DeepgramResponse> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams();
    params.set("model", opts.model ?? "nova-3");
    params.set("language", opts.language ?? "en");
    if (opts.punctuate !== false) params.set("punctuate", "true");
    if (opts.smart_format !== false) params.set("smart_format", "true");
    if (opts.utterances) params.set("utterances", "true");
    if (opts.diarize) params.set("diarize", "true");
    if (opts.summarize) params.set("summarize", "true");
    if (opts.sentiment) params.set("sentiment", "true");
    if (opts.topics) params.set("topics", "true");

    const url = new URL(`${DEEPGRAM_API_URL}?${params}`);
    const fileStream = createReadStream(filePath);

    const req = request(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          Authorization: `Token ${opts.apiKey}`,
          "Content-Type": opts.contentType,
          "Transfer-Encoding": "chunked",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body) as DeepgramResponse);
            } catch {
              reject(new Error("Invalid JSON response from Deepgram"));
            }
          } else {
            reject(
              new Error(`Deepgram API error (${res.statusCode}): ${body}`)
            );
          }
        });
      }
    );

    req.on("error", (err: Error) =>
      reject(new Error(`Request failed: ${err.message}`))
    );
    fileStream.on("error", (err: Error) =>
      reject(new Error(`File read failed: ${err.message}`))
    );
    fileStream.pipe(req);
  });
}

export interface TTSOptions {
  apiKey: string;
  voice?: string;
  text: string;
}

export function textToSpeechStream(opts: TTSOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const voice = opts.voice ?? "aura-2-thalia-en";
    const url = new URL(`${DEEPGRAM_TTS_URL}?model=${encodeURIComponent(voice)}`);
    const body = JSON.stringify({ text: opts.text });

    const req = request(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          Authorization: `Token ${opts.apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          let errBody = "";
          res.on("data", (c: Buffer) => (errBody += c.toString()));
          res.on("end", () =>
            reject(new Error(`Deepgram TTS error (${res.statusCode}): ${errBody}`))
          );
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );

    req.on("error", (err: Error) =>
      reject(new Error(`TTS request failed: ${err.message}`))
    );
    req.write(body);
    req.end();
  });
}
