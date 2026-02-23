import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DeepgramFlux } from "@deepgram/electron";
import type { FluxTurnEvent } from "@deepgram/electron";

const schema = {
  max_duration_seconds: z
    .number()
    .min(5)
    .max(300)
    .default(60)
    .describe(
      "Maximum seconds to wait for the speaker to finish before giving up. " +
        "Flux will return earlier once it detects end of turn — no need to set this precisely."
    ),
  device_id: z
    .string()
    .optional()
    .describe("Microphone device ID. Omit to use the default mic. Use list_mic_devices to find IDs."),
  eot_threshold: z
    .number()
    .min(0.1)
    .max(0.99)
    .optional()
    .describe(
      "End-of-turn confidence threshold (0.1–0.99). " +
        "Lower = more responsive (fires sooner). Higher = more deliberate (waits for stronger confidence). " +
        "Omit to use the Flux model default."
    ),
  intent: z
    .enum(["command", "dictation", "question"])
    .default("command")
    .describe(
      "command: user is speaking an instruction for Claude to execute. " +
        "dictation: user is dictating text to insert. " +
        "question: user is asking a question about the codebase."
    ),
};

export function registerListenForTurn(server: McpServer): void {
  server.tool(
    "listen_for_turn",
    "Record from the microphone using Deepgram Flux and return the transcript when the speaker finishes talking. " +
      "Unlike record_and_transcribe (which uses a fixed timer), this returns as soon as Flux detects natural end of turn — " +
      "no duration needed. Ideal for continuous voice mode. " +
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

      let turnResult: FluxTurnEvent | null = null;
      let recordingError: string | null = null;
      let timedOut = false;

      const dg = new DeepgramFlux({
        apiKey,
        deviceId: args.device_id,
        eotThreshold: args.eot_threshold,
        logLevel: "silent",
      });

      const turnPromise = new Promise<FluxTurnEvent>((resolve) => {
        dg.once("turn_complete", resolve);
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          timedOut = true;
          reject(new Error(`No end of turn within ${args.max_duration_seconds}s`));
        }, args.max_duration_seconds * 1000)
      );

      let rejectOnError!: (err: Error) => void;
      const errorPromise = new Promise<never>((_, reject) => {
        rejectOnError = reject;
      });

      dg.on("error", (err: Error) => {
        recordingError = err.message;
        process.stderr.write(`[deepgram-mcp] flux error: ${err.message}\n`);
        rejectOnError(err);
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
        `[deepgram-mcp] flux listening (max ${args.max_duration_seconds}s, waiting for end of turn)...\n`
      );

      try {
        turnResult = await Promise.race([turnPromise, timeoutPromise, errorPromise]);
      } catch {
        // timeout or error — timedOut / recordingError already set
      } finally {
        try {
          await dg.stop();
        } catch {
          // ignore stop errors
        }
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

      if (timedOut || !turnResult) {
        return {
          content: [
            {
              type: "text",
              text:
                `No speech detected within ${args.max_duration_seconds}s.\n\n` +
                "- Check that your microphone is working\n" +
                "- Ensure microphone permission is granted in **System Settings → Privacy & Security → Microphone**\n" +
                "- Try speaking louder or closer to the mic",
            },
          ],
        };
      }

      const { transcript, words, end_of_turn_confidence } = turnResult;

      const avgWordConfidence =
        words.length > 0
          ? words.reduce((s, w) => s + w.confidence, 0) / words.length
          : end_of_turn_confidence;

      let out =
        `## Voice Recording Transcript\n\n` +
        `> **"${transcript}"**\n\n` +
        `*Words: ${words.length} | Confidence: ${(avgWordConfidence * 100).toFixed(0)}% | End-of-turn confidence: ${(end_of_turn_confidence * 100).toFixed(0)}%*`;

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
