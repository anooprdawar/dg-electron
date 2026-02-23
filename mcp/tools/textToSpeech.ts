import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { textToSpeechStream } from "../lib/deepgramHttp.js";

const VOICES = [
  "aura-2-thalia-en",
  "aura-2-orion-en",
  "aura-2-luna-en",
  "aura-2-stella-en",
  "aura-2-aries-en",
  "aura-asteria-en",
] as const;

const schema = {
  text: z
    .string()
    .max(2000)
    .describe("The text to convert to speech. Maximum 2000 characters."),
  voice: z
    .string()
    .default("aura-2-thalia-en")
    .describe(
      "Deepgram Aura voice. Options: " +
        "aura-2-thalia-en (professional female, default), " +
        "aura-2-orion-en (professional male), " +
        "aura-2-luna-en (warm female), " +
        "aura-2-stella-en (expressive female), " +
        "aura-2-aries-en (confident male), " +
        "aura-asteria-en (legacy female)."
    ),
  output_path: z
    .string()
    .optional()
    .describe("Where to save the MP3 file. Defaults to /tmp/deepgram-tts-<timestamp>.mp3"),
  play: z
    .boolean()
    .default(true)
    .describe("Automatically play the audio through speakers after generating (macOS only)."),
};

export function registerTextToSpeech(server: McpServer): void {
  server.tool(
    "text_to_speech",
    "Convert text to speech using Deepgram Aura voices and optionally play it aloud. " +
      "Use when the user wants to hear something read aloud, generate an audio file, " +
      "or have Claude 'speak' a response. Saves to an MP3 file. " +
      "Supported voices: aura-2-thalia-en (default), aura-2-orion-en, aura-2-luna-en, and more.",
    schema,
    async (args) => {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        return {
          content: [{ type: "text", text: "Error: `DEEPGRAM_API_KEY` not set." }],
        };
      }

      if (!VOICES.includes(args.voice as (typeof VOICES)[number])) {
        process.stderr.write(`[deepgram-mcp] using custom voice: ${args.voice}\n`);
      }

      const outputPath =
        args.output_path ?? `/tmp/deepgram-tts-${Date.now()}.mp3`;

      process.stderr.write(
        `[deepgram-mcp] TTS: "${args.text.slice(0, 50)}..." → ${outputPath}\n`
      );

      let audioBuffer: Buffer;
      try {
        audioBuffer = await textToSpeechStream({
          apiKey,
          voice: args.voice,
          text: args.text,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `TTS generation failed: ${msg}` }] };
      }

      try {
        await writeFile(outputPath, audioBuffer);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Failed to save audio file: ${msg}` }],
        };
      }

      let playedSuccessfully = false;
      if (args.play) {
        try {
          await new Promise<void>((resolve, reject) => {
            const player = spawn("afplay", [outputPath], { stdio: "ignore" });
            player.on("close", (code) => {
              if (code === 0) resolve();
              else reject(new Error(`afplay exited with code ${code}`));
            });
            player.on("error", reject);
          });
          playedSuccessfully = true;
        } catch (err) {
          process.stderr.write(`[deepgram-mcp] afplay error: ${err}\n`);
        }
      }

      const charCount = args.text.length;
      let out =
        `## Text-to-Speech Complete\n\n` +
        `- **Voice:** ${args.voice}\n` +
        `- **Characters:** ${charCount}\n` +
        `- **Output:** \`${outputPath}\`\n`;

      if (args.play) {
        out += playedSuccessfully
          ? `- **Played:** ✓ Audio played through speakers\n`
          : `- **Played:** Failed to play (run \`afplay "${outputPath}"\` manually)\n`;
      } else {
        out += `- **Played:** No (set \`play: true\` to auto-play)\n`;
      }

      out += `\nTo replay: \`afplay "${outputPath}"\``;

      return { content: [{ type: "text", text: out }] };
    }
  );
}
