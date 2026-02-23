import { stat } from "node:fs/promises";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { transcribeFile } from "../lib/deepgramHttp.js";
import { getMimeType, formatDuration } from "../lib/audioHelpers.js";
import type { DeepgramResponse } from "../lib/audioHelpers.js";

const schema = {
  path: z
    .string()
    .describe(
      "Absolute path to the audio or video file to transcribe. " +
        "Supported: mp3, mp4, m4a, wav, flac, ogg, webm, opus, aac, aiff."
    ),
  model: z
    .string()
    .default("nova-3")
    .describe("Deepgram model. nova-3 is best for general use."),
  language: z.string().default("en").describe("BCP-47 language code, e.g. 'en', 'es', 'fr'."),
  summarize: z.boolean().default(false).describe("Return a concise summary of the audio."),
  sentiment: z
    .boolean()
    .default(false)
    .describe("Detect sentiment (positive/neutral/negative) per segment. English only."),
  topics: z
    .boolean()
    .default(false)
    .describe("Detect key topics discussed in the audio. English only."),
  diarize: z
    .boolean()
    .default(false)
    .describe("Identify individual speakers (diarization)."),
  utterances: z
    .boolean()
    .default(false)
    .describe("Return utterance-level segments with start/end timing."),
  smart_format: z
    .boolean()
    .default(true)
    .describe("Apply smart formatting (numbers, dates, punctuation)."),
  punctuate: z.boolean().default(true).describe("Add punctuation to the transcript."),
};

export function registerTranscribeFile(server: McpServer): void {
  server.tool(
    "transcribe_audio",
    "Transcribe an audio or video file to text using Deepgram. " +
      "Accepts local file paths (mp3, mp4, m4a, wav, flac, ogg, webm). " +
      "Can also extract a summary, sentiment analysis, and topic detection. " +
      "Use when the user wants to transcribe, caption, or get text from an audio or video file.",
    schema,
    async (args) => {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "Error: `DEEPGRAM_API_KEY` environment variable is not set. Add it to your shell profile and restart Claude Code.",
            },
          ],
        };
      }

      try {
        await stat(args.path);
      } catch {
        return {
          content: [
            { type: "text", text: `Error: File not found at path: \`${args.path}\`` },
          ],
        };
      }

      process.stderr.write(`[deepgram-mcp] transcribing: ${args.path}\n`);

      let response: DeepgramResponse;
      try {
        response = await transcribeFile(args.path, {
          apiKey,
          model: args.model,
          language: args.language,
          punctuate: args.punctuate,
          smart_format: args.smart_format,
          utterances: args.utterances,
          diarize: args.diarize,
          summarize: args.summarize,
          sentiment: args.sentiment,
          topics: args.topics,
          contentType: getMimeType(args.path),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Transcription failed: ${msg}` }] };
      }

      const channel = response.results?.channels?.[0];
      const alt = channel?.alternatives?.[0];
      const transcript = alt?.transcript ?? "";

      if (!transcript.trim()) {
        return {
          content: [
            {
              type: "text",
              text: "No speech detected in the audio. The file may be silent or in an unsupported format.",
            },
          ],
        };
      }

      const duration = response.metadata?.duration;
      const wordCount = alt?.words?.length ?? 0;
      const confidence = alt?.confidence ?? 0;

      let out = `## Transcript\n\n${transcript}`;

      if (duration) {
        out += `\n\n*Duration: ${formatDuration(duration)} | Words: ${wordCount} | Confidence: ${(confidence * 100).toFixed(0)}%*`;
      }

      const summary = response.results?.summary?.short;
      if (summary) {
        out = `## Summary\n\n${summary}\n\n---\n\n` + out;
      }

      const sentiments = response.results?.sentiments;
      if (sentiments?.average) {
        const avg = sentiments.average;
        out += `\n\n## Sentiment\n\nOverall: **${avg.sentiment}** (score: ${avg.sentiment_score.toFixed(2)})`;
        if (sentiments.segments?.length) {
          out += "\n\n| Segment | Sentiment | Score |\n|---------|-----------|-------|\n";
          for (const seg of sentiments.segments.slice(0, 10)) {
            const snippet = seg.text.length > 50 ? seg.text.slice(0, 47) + "…" : seg.text;
            out += `| "${snippet}" | ${seg.sentiment} | ${seg.sentiment_score.toFixed(2)} |\n`;
          }
        }
      }

      const topicSegments = response.results?.topics?.segments;
      if (topicSegments?.length) {
        const allTopics = topicSegments
          .flatMap((s) => s.topics.map((t) => t.topic))
          .filter((t, i, a) => a.indexOf(t) === i);
        out += `\n\n## Topics\n\n${allTopics.map((t) => `- ${t}`).join("\n")}`;
      }

      if (args.utterances && alt?.words?.length) {
        out += "\n\n## Utterances\n\n";
        let current = "";
        let startTime = 0;
        let endTime = 0;
        for (const word of alt.words) {
          if (!current) startTime = word.start;
          current += (word.punctuated_word ?? word.word) + " ";
          endTime = word.end;
          if (word.word.endsWith(".") || word.word.endsWith("?") || word.word.endsWith("!")) {
            out += `**[${formatDuration(startTime)} → ${formatDuration(endTime)}]** ${current.trim()}\n\n`;
            current = "";
          }
        }
        if (current.trim()) {
          out += `**[${formatDuration(startTime)} → ${formatDuration(endTime)}]** ${current.trim()}\n`;
        }
      }

      return { content: [{ type: "text", text: out }] };
    }
  );
}
