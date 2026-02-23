import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DeepgramElectron } from "@deepgram/electron";
import type { TranscriptEvent } from "@deepgram/electron";

const schema = {
  duration_seconds: z
    .number()
    .min(1)
    .max(300)
    .default(10)
    .describe(
      "How many seconds to record from the microphone. " +
        "Use 5-10s for short commands, 30-60s for dictation."
    ),
  mode: z
    .enum(["streaming", "batch"])
    .default("batch")
    .describe(
      "batch: record then transcribe (more accurate for short clips). " +
        "streaming: transcribe in real-time."
    ),
  model: z.string().default("nova-3").describe("Deepgram transcription model."),
  language: z.string().default("en").describe("BCP-47 language code."),
  device_id: z
    .string()
    .optional()
    .describe("Microphone device ID. Omit to use the default mic. Use list_mic_devices to find IDs."),
  intent: z
    .enum(["command", "dictation", "question"])
    .default("command")
    .describe(
      "command: user is speaking an instruction for Claude to execute. " +
        "dictation: user is dictating text to insert. " +
        "question: user is asking a question about the codebase."
    ),
};

export function registerRecordAndTranscribe(server: McpServer): void {
  server.tool(
    "record_and_transcribe",
    "Record audio from the microphone for a specified duration and return the transcript. " +
      "Use this to let the user speak instructions, dictate code, or ask questions verbally. " +
      "The 'intent' field tells Claude how to treat the result. " +
      "Requires macOS 14.2+ and microphone permission.",
    schema,
    async (args) => {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "Error: `DEEPGRAM_API_KEY` environment variable is not set.",
            },
          ],
        };
      }

      const finalTranscripts: string[] = [];
      const allWords: Array<{ word: string; confidence: number }> = [];
      let recordingError: string | null = null;

      const dg = new DeepgramElectron({
        deepgram: {
          apiKey,
          model: args.model,
          language: args.language,
          punctuate: true,
          smart_format: true,
          interim_results: args.mode === "streaming",
        },
        systemAudio: { enabled: false },
        mic: {
          enabled: true,
          deviceId: args.device_id,
        },
        mode: args.mode,
        logLevel: "silent",
      });

      dg.on("transcript", (event: TranscriptEvent) => {
        if (event.is_final && event.transcript.trim()) {
          finalTranscripts.push(event.transcript);
          allWords.push(...event.words.map((w) => ({ word: w.word, confidence: w.confidence })));
        }
      });

      dg.on("error", (err: Error) => {
        recordingError = err.message;
        process.stderr.write(`[deepgram-mcp] recording error: ${err.message}\n`);
      });

      try {
        await dg.start();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("permission") || msg.includes("Permission")) {
          return {
            content: [
              {
                type: "text",
                text:
                  "Microphone permission denied. Please enable it:\n\n" +
                  "**System Settings → Privacy & Security → Microphone**\n\n" +
                  "Add your terminal application (Terminal or iTerm2), then try again.",
              },
            ],
          };
        }
        return { content: [{ type: "text", text: `Failed to start recording: ${msg}` }] };
      }

      process.stderr.write(
        `[deepgram-mcp] recording ${args.duration_seconds}s (${args.mode} mode)...\n`
      );

      await new Promise<void>((resolve) => setTimeout(resolve, args.duration_seconds * 1000));

      try {
        await dg.stop();
      } catch (err) {
        process.stderr.write(`[deepgram-mcp] stop error: ${err}\n`);
      }

      if (recordingError) {
        return {
          content: [
            {
              type: "text",
              text: `Recording error: ${recordingError}\n\nCheck microphone permissions in System Settings.`,
            },
          ],
        };
      }

      const fullTranscript = finalTranscripts.join(" ").trim();

      if (!fullTranscript) {
        return {
          content: [
            {
              type: "text",
              text:
                "No speech detected during the recording.\n\n" +
                "- Check that your microphone is working\n" +
                "- Ensure microphone permission is granted in **System Settings → Privacy & Security → Microphone**\n" +
                "- Try speaking louder or closer to the mic",
            },
          ],
        };
      }

      const avgConfidence =
        allWords.length > 0
          ? allWords.reduce((s, w) => s + w.confidence, 0) / allWords.length
          : 0;

      let out =
        `## Voice Recording Transcript\n\n` +
        `> **"${fullTranscript}"**\n\n` +
        `*Duration: ${args.duration_seconds}s | Words: ${allWords.length} | Confidence: ${(avgConfidence * 100).toFixed(0)}%*`;

      if (args.intent === "command") {
        out +=
          "\n\n---\n\n*The user spoke this as a command. Please execute it as if they had typed it.*";
      } else if (args.intent === "dictation") {
        out +=
          "\n\n---\n\n*The user dictated this text. Please insert it at the appropriate location.*";
      } else if (args.intent === "question") {
        out += "\n\n---\n\n*The user asked this question verbally. Please answer it.*";
      }

      return { content: [{ type: "text", text: out }] };
    }
  );
}
