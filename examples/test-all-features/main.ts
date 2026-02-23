/**
 * Test all new features: audio levels, batch mode, mic selection
 *
 * Usage:
 *   DEEPGRAM_API_KEY=your-key npx tsx examples/test-all-features/main.ts
 *
 * Tests run in sequence:
 *   1. List input devices
 *   2. Audio levels (spectrogram preset) — 5 seconds
 *   3. Streaming transcription with VU meter — 10 seconds
 *   4. Batch transcription — record 5 seconds, then transcribe
 *   5. Mic selection — use a specific device (if >1 available)
 */

import { DeepgramElectron } from "../../src/index.js";
import type { AudioLevelEvent, InputDevice } from "../../src/index.js";

const apiKey = process.env.DEEPGRAM_API_KEY;
if (!apiKey) {
  console.error("Error: Set DEEPGRAM_API_KEY environment variable");
  console.error("  DEEPGRAM_API_KEY=your-key npx tsx examples/test-all-features/main.ts");
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function bar(value: number, width = 30): string {
  const filled = Math.round(value * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function spectrum(fft: { freq: number; magnitude: number }[], cols = 64): string {
  if (fft.length === 0) return " ".repeat(cols);
  const chars = " ▁▂▃▄▅▆▇█";
  const FLOOR_DB = -60;
  const bucketSize = fft.length / cols;
  let result = "";
  for (let i = 0; i < cols; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    let max = 0;
    for (let j = start; j < end; j++) {
      if (fft[j].magnitude > max) max = fft[j].magnitude;
    }
    const db = max > 0 ? 20 * Math.log10(max) : FLOOR_DB;
    const normalized = Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));
    result += chars[Math.min(8, Math.floor(normalized * 9))];
  }
  return result;
}

// ─────────────────────────────────────────────
// TEST 1: List input devices
// ─────────────────────────────────────────────
async function testListDevices(): Promise<InputDevice[]> {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  TEST 1: List Input Devices              ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const devices = await DeepgramElectron.listInputDevices();
  console.log(`Found ${devices.length} input device(s):\n`);
  for (const d of devices) {
    const tag = d.isDefault ? " (DEFAULT)" : "";
    console.log(`  ${d.name}${tag}`);
    console.log(`    ID: ${d.id}\n`);
  }

  if (devices.length === 0) {
    console.error("No input devices found!");
    process.exit(1);
  }

  console.log("PASS: Device enumeration works.\n");
  return devices;
}

// ─────────────────────────────────────────────
// TEST 2: Audio levels (spectrogram preset)
// ─────────────────────────────────────────────
async function testAudioLevels(): Promise<void> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TEST 2: Audio Levels (spectrogram)      ║");
  console.log("╚══════════════════════════════════════════╝\n");
  console.log("Listening for 5 seconds... make some noise!\n");

  const dg = new DeepgramElectron({
    deepgram: { apiKey: apiKey! },
    systemAudio: { enabled: false },
    mic: { enabled: true },
    audioLevels: { preset: "spectrogram" },
    logLevel: "silent",
  });

  let levelCount = 0;
  let hadFFT = false;

  dg.on("audio_level", (event: AudioLevelEvent) => {
    levelCount++;
    if (event.fft.length > 0) hadFFT = true;

    // Print every 5th frame (~250ms) so the waterfall is readable
    if (levelCount % 5 === 0) {
      const spec = spectrum(event.fft);
      console.log(`  ${spec}  ${(event.rms * 100).toFixed(1)}%`);
    }
  });

  dg.on("error", (err) => console.error("  Error:", err.message));

  await dg.start();
  await sleep(5000);
  await dg.stop();

  console.log(`  Total audio_level events received: ${levelCount}`);
  console.log(`  Had FFT data: ${hadFFT}`);
  console.log(`  Expected: ~100 events (50ms interval x 5s), FFT = true`);

  if (levelCount > 0 && hadFFT) {
    console.log("\nPASS: Audio levels with spectrogram preset work.\n");
  } else {
    console.log("\nFAIL: Expected audio_level events with FFT data.\n");
  }
}

// ─────────────────────────────────────────────
// TEST 3: Streaming transcription + VU meter
// ─────────────────────────────────────────────
async function testStreamingWithLevels(): Promise<void> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TEST 3: Streaming + VU Meter (10s)      ║");
  console.log("╚══════════════════════════════════════════╝\n");
  console.log("Speak into your mic for 10 seconds...\n");

  const dg = new DeepgramElectron({
    deepgram: {
      apiKey: apiKey!,
      model: "nova-3",
      interim_results: true,
    },
    systemAudio: { enabled: false },
    mic: { enabled: true },
    audioLevels: { preset: "vu-meter" },
    logLevel: "silent",
  });

  let transcriptCount = 0;

  dg.on("audio_level", (event) => {
    // Show a simple VU bar on every event
    process.stdout.write(`\r  VU: ${bar(event.rms, 40)} ${(event.rms * 100).toFixed(0)}%  `);
  });

  dg.on("transcript", (event) => {
    transcriptCount++;
    if (event.transcript.trim()) {
      console.log(`\n  [${event.is_final ? "FINAL" : "interim"}] ${event.transcript}`);
    }
  });

  dg.on("error", (err) => console.error("\n  Error:", err.message));

  await dg.start();
  await sleep(10000);
  await dg.stop();

  console.log(`\n\n  Transcript events received: ${transcriptCount}`);

  if (transcriptCount > 0) {
    console.log("\nPASS: Streaming transcription with VU meter works.\n");
  } else {
    console.log("\nWARN: No transcripts received. Did you speak?\n");
  }
}

// ─────────────────────────────────────────────
// TEST 4: Batch transcription
// ─────────────────────────────────────────────
async function testBatchMode(): Promise<void> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TEST 4: Batch Mode (5s record + upload) ║");
  console.log("╚══════════════════════════════════════════╝\n");
  console.log("Recording for 5 seconds... speak clearly!\n");

  const dg = new DeepgramElectron({
    deepgram: {
      apiKey: apiKey!,
      model: "nova-3",
    },
    mode: "batch",
    systemAudio: { enabled: false },
    mic: { enabled: true },
    audioLevels: { preset: "vu-meter" },
    logLevel: "silent",
  });

  dg.on("audio_level", (event) => {
    process.stdout.write(`\r  Recording: ${bar(event.rms, 40)} ${(event.rms * 100).toFixed(0)}%  `);
  });

  dg.on("batch_progress", (event) => {
    const bytes = event.bytesRecorded ?? 0;
    const kb = (bytes / 1024).toFixed(0);
    console.log(`\n  Batch progress: ${event.phase} (${kb} KB recorded)`);
  });

  let batchTranscript = "";
  dg.on("transcript", (event) => {
    batchTranscript = event.transcript;
    console.log(`\n  Batch transcript: "${event.transcript}"`);
    console.log(`  Confidence: ${(event.confidence * 100).toFixed(1)}%`);
    console.log(`  Words: ${event.words.length}`);
  });

  dg.on("error", (err) => console.error("\n  Error:", err.message));

  await dg.start();
  await sleep(5000);

  console.log("\n\n  Stopping and uploading to Deepgram...\n");
  await dg.stop();

  if (batchTranscript) {
    console.log("\nPASS: Batch transcription works.\n");
  } else {
    console.log("\nWARN: No batch transcript. Did you speak during recording?\n");
  }
}

// ─────────────────────────────────────────────
// TEST 5: Mic selection
// ─────────────────────────────────────────────
async function testMicSelection(devices: InputDevice[]): Promise<void> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TEST 5: Mic Selection (3s)              ║");
  console.log("╚══════════════════════════════════════════╝\n");

  if (devices.length < 2) {
    console.log("  Only 1 input device available — selecting it explicitly by ID.\n");
  }

  // Pick the default device explicitly by ID
  const target = devices.find((d) => d.isDefault) ?? devices[0];
  console.log(`  Selecting device: "${target.name}" (${target.id})\n`);
  console.log("  Listening for 3 seconds...\n");

  const dg = new DeepgramElectron({
    deepgram: { apiKey: apiKey! },
    systemAudio: { enabled: false },
    mic: { enabled: true, deviceId: target.id },
    audioLevels: { preset: "vu-meter" },
    logLevel: "silent",
  });

  let levelCount = 0;
  dg.on("audio_level", (event) => {
    levelCount++;
    if (levelCount % 3 === 0) {
      process.stdout.write(`\r  ${target.name}: ${bar(event.rms, 40)} ${(event.rms * 100).toFixed(0)}%  `);
    }
  });

  dg.on("error", (err) => console.error("\n  Error:", err.message));

  await dg.start();
  await sleep(3000);
  await dg.stop();

  console.log(`\n\n  Audio level events from selected device: ${levelCount}`);

  if (levelCount > 0) {
    console.log("\nPASS: Mic selection works.\n");
  } else {
    console.log("\nFAIL: No audio levels from selected device.\n");
  }
}

// ─────────────────────────────────────────────
// RUN ALL TESTS
// ─────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  dg-electron Feature Test Suite          ║");
  console.log("║  Testing: Audio Levels, Batch, Mic Sel.  ║");
  console.log("╚══════════════════════════════════════════╝");

  // Check permissions first
  const perms = await DeepgramElectron.checkPermissions();
  console.log("\nPermissions:", perms);

  if (perms.microphone === "denied") {
    console.error("\nMicrophone permission denied. Grant access in System Settings > Privacy & Security.");
    process.exit(1);
  }

  const devices = await testListDevices();
  await testAudioLevels();
  await testStreamingWithLevels();
  await testBatchMode();
  await testMicSelection(devices);

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  ALL TESTS COMPLETE                      ║");
  console.log("╚══════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
