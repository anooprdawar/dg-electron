import { stat } from "node:fs/promises";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { transcribeFile } from "../lib/deepgramHttp.js";
import { getMimeType, formatDuration } from "../lib/audioHelpers.js";
import type { DeepgramResponse } from "../lib/audioHelpers.js";

const schema = {
  path: z.string().describe("Absolute path to the audio file to summarize."),
  model: z.string().default("nova-3"),
  also_return_transcript: z
    .boolean()
    .default(false)
    .describe("Also return the full transcript alongside the summary."),
};

export function registerSummarizeAudio(server: McpServer): void {
  server.tool(
    "summarize_audio",
    "Summarize an audio file into a concise summary using Deepgram. " +
      "Use when the user wants a TL;DR of a recording, meeting, lecture, or podcast. " +
      "English audio recommended for best summarization quality.",
    schema,
    async (args) => {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        return {
          content: [{ type: "text", text: "Error: `DEEPGRAM_API_KEY` not set." }],
        };
      }

      try {
        await stat(args.path);
      } catch {
        return {
          content: [{ type: "text", text: `Error: File not found: \`${args.path}\`` }],
        };
      }

      process.stderr.write(`[deepgram-mcp] summarizing: ${args.path}\n`);

      let response: DeepgramResponse;
      try {
        response = await transcribeFile(args.path, {
          apiKey,
          model: args.model,
          language: "en",
          punctuate: true,
          smart_format: true,
          summarize: true,
          contentType: getMimeType(args.path),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Summarization failed: ${msg}` }] };
      }

      const summary = response.results?.summary?.short;
      const transcript =
        response.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      const duration = response.metadata?.duration;
      const wordCount = response.results?.channels?.[0]?.alternatives?.[0]?.words?.length ?? 0;

      if (!summary && !transcript) {
        return {
          content: [
            {
              type: "text",
              text: "No speech detected. The file may be silent or in an unsupported format.",
            },
          ],
        };
      }

      let out = "";

      if (summary) {
        out += `## Summary\n\n${summary}`;
      } else {
        out += "## Summary\n\n*Deepgram could not generate a summary for this audio.*";
      }

      if (duration) {
        out += `\n\n*Audio duration: ${formatDuration(duration)} | Words spoken: ${wordCount}*`;
      }

      if (args.also_return_transcript && transcript) {
        out += `\n\n---\n\n## Full Transcript\n\n${transcript}`;
      } else if (!args.also_return_transcript && transcript) {
        out += `\n\n*Use \`transcribe_audio\` or set \`also_return_transcript: true\` to see the full transcript.*`;
      }

      return { content: [{ type: "text", text: out }] };
    }
  );
}
