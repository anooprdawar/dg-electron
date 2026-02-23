import { stat } from "node:fs/promises";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { transcribeFile } from "../lib/deepgramHttp.js";
import { getMimeType, formatDuration } from "../lib/audioHelpers.js";
import type { DeepgramResponse } from "../lib/audioHelpers.js";

const schema = {
  path: z.string().describe("Absolute path to the audio file to analyze."),
  model: z.string().default("nova-3"),
  sentiment: z.boolean().default(true).describe("Detect sentiment per segment. English only."),
  topics: z.boolean().default(true).describe("Detect key topics. English only."),
  diarize: z.boolean().default(false).describe("Identify individual speakers."),
};

export function registerAnalyzeAudio(server: McpServer): void {
  server.tool(
    "analyze_audio",
    "Analyze an audio file for sentiment, topics, and speaker information using Deepgram Intelligence. " +
      "Returns a structured report with insights about the content. " +
      "Use when the user wants insights about a recorded conversation, meeting, or interview. " +
      "English audio only for sentiment and topic analysis.",
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

      process.stderr.write(`[deepgram-mcp] analyzing: ${args.path}\n`);

      let response: DeepgramResponse;
      try {
        response = await transcribeFile(args.path, {
          apiKey,
          model: args.model,
          language: "en",
          punctuate: true,
          smart_format: true,
          diarize: args.diarize,
          sentiment: args.sentiment,
          topics: args.topics,
          contentType: getMimeType(args.path),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Analysis failed: ${msg}` }] };
      }

      const transcript =
        response.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      const duration = response.metadata?.duration;

      let out = `## Audio Analysis Report\n`;
      if (duration) out += `\n*Duration: ${formatDuration(duration)}*\n`;

      // Sentiment
      const sentiments = response.results?.sentiments;
      if (args.sentiment && sentiments) {
        const avg = sentiments.average;
        const emoji =
          avg?.sentiment === "positive" ? "😊" : avg?.sentiment === "negative" ? "😟" : "😐";
        out += `\n### Sentiment ${emoji}\n`;
        out += `Overall: **${avg?.sentiment ?? "unknown"}** (score: ${(avg?.sentiment_score ?? 0).toFixed(2)})\n`;

        const segments = sentiments.segments ?? [];
        if (segments.length > 0) {
          out += "\n| Excerpt | Sentiment | Score |\n|---------|-----------|-------|\n";
          for (const seg of segments.slice(0, 8)) {
            const snippet = seg.text.length > 60 ? seg.text.slice(0, 57) + "…" : seg.text;
            out += `| "${snippet}" | ${seg.sentiment} | ${seg.sentiment_score.toFixed(2)} |\n`;
          }
        }
      }

      // Topics
      const topicData = response.results?.topics;
      if (args.topics && topicData?.segments?.length) {
        const allTopics = topicData.segments
          .flatMap((s) => s.topics)
          .sort((a, b) => b.confidence_score - a.confidence_score)
          .filter((t, i, a) => a.findIndex((x) => x.topic === t.topic) === i)
          .slice(0, 10);

        out += `\n### Topics Detected\n\n`;
        for (const t of allTopics) {
          out += `- **${t.topic}** (confidence: ${(t.confidence_score * 100).toFixed(0)}%)\n`;
        }
      }

      // Transcript (abridged)
      if (transcript) {
        const preview =
          transcript.length > 500 ? transcript.slice(0, 497) + "…" : transcript;
        out += `\n### Transcript Preview\n\n${preview}`;
        if (transcript.length > 500) {
          out += `\n\n*Use \`transcribe_audio\` to get the full transcript.*`;
        }
      }

      return { content: [{ type: "text", text: out }] };
    }
  );
}
