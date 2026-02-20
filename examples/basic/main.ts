/**
 * Basic example: transcribe system audio + microphone
 *
 * Usage:
 *   DEEPGRAM_API_KEY=your-key npx tsx examples/basic/main.ts
 */

import { DeepgramElectron } from "../../src/index.js";

async function main() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error("Error: Set DEEPGRAM_API_KEY environment variable");
    process.exit(1);
  }

  // Check permissions first
  const perms = await DeepgramElectron.checkPermissions();
  console.log("Permissions:", perms);

  if (perms.systemAudio === "denied") {
    console.error(
      "System audio permission denied. Grant access in System Settings > Privacy & Security."
    );
  }
  if (perms.microphone === "denied") {
    console.error(
      "Microphone permission denied. Grant access in System Settings > Privacy & Security."
    );
  }

  const dg = new DeepgramElectron({
    deepgram: {
      apiKey,
      model: "nova-3",
      language: "en",
      utterances: true,
      utterance_end_ms: 1000,
    },
    systemAudio: {
      enabled: perms.systemAudio !== "denied",
    },
    mic: {
      enabled: perms.microphone !== "denied",
    },
    logLevel: "info",
  });

  dg.on("transcript", (event) => {
    const prefix = event.source === "system" ? "[System]" : "   [Mic]";
    const marker = event.is_final ? "FINAL" : "interim";
    console.log(
      `${prefix} (${marker}, ${(event.confidence * 100).toFixed(0)}%) ${event.transcript}`
    );
  });

  dg.on("utterance_end", (event) => {
    console.log(`--- ${event.source} utterance end ---`);
  });

  dg.on("started", () => {
    console.log("\nTranscription started. Speak or play audio...\n");
  });

  dg.on("stopped", () => {
    console.log("\nTranscription stopped.");
  });

  dg.on("error", (err) => {
    console.error("Error:", err.message);
  });

  await dg.start();

  // Stop on Ctrl+C
  process.on("SIGINT", async () => {
    console.log("\nStopping...");
    await dg.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
