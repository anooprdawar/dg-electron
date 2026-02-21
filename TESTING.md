# Testing Guide — dg-electron Features

## Before you start

You need a Deepgram API key:
1. Open https://console.deepgram.com
2. Sign up (free, gives $200 credits)
3. Click "API Keys" in the left sidebar
4. Click "Create a New API Key"
5. Copy the key

Open your terminal and go to the project:

```
cd /Users/anoopdawar/dg-electron
```

---

## TEST 1: List your microphones

**What this tests:** Can we see what mics are plugged in?

**Run this:**
```
./bin/dg-mic-audio --list-devices
```

**What you should see:** A list of your microphones as JSON. Something like:
```
[{"id":"BuiltInMicrophoneDevice","name":"MacBook Pro Microphone","isDefault":true}, ...]
```

**PASS if:** You see at least one device. Write down the `id` of one — you'll need it for Test 5.

---

## TEST 2: Audio levels (VU meter style)

**What this tests:** Can we get volume levels from the mic?

**Run this (two steps):**

Step 1 — Record 3 seconds of audio levels to a file:
```
timeout 3 ./bin/dg-mic-audio --sample-rate 16000 --chunk-duration 200 --enable-levels --level-interval-ms 100 --fft-bins 0 1>/dev/null 2>/tmp/dg-levels.txt
```

Step 2 — Look at the results:
```
grep audio_level /tmp/dg-levels.txt | head -10
```

**What to do during Step 1:** Talk, clap, or tap your desk while it records.

**What you should see in Step 2:** Lines of JSON like:
```json
{"type":"audio_level","rms":0.342,"peak":0.871,"fft":[],"timestamp":12345.67}
```

**PASS if:** You see `audio_level` lines where `rms` and `peak` change. Louder noise = higher numbers (closer to 1.0).

---

## TEST 3: Audio levels with FFT (spectrogram data)

**What this tests:** Can we get frequency data for spectrograms?

**Run this (two steps):**

Step 1 — Record 3 seconds with FFT enabled:
```
timeout 3 ./bin/dg-mic-audio --sample-rate 16000 --chunk-duration 200 --enable-levels --level-interval-ms 100 --fft-bins 64 1>/dev/null 2>/tmp/dg-fft.txt
```

Step 2 — Look at the results:
```
grep audio_level /tmp/dg-fft.txt | head -3
```

**What to do during Step 1:** Make some noise.

**What you should see in Step 2:** Same `audio_level` JSON but now `fft` has data:
```json
{"type":"audio_level","rms":0.15,"peak":0.4,"fft":[{"freq":0.0,"magnitude":0.02},{"freq":125.0,"magnitude":0.08},...]}
```

**PASS if:** The `fft` array has 64 entries (not empty `[]`). Each entry has a `freq` and `magnitude`.

---

## TEST 4: Mic selection

**What this tests:** Can we pick a specific microphone?

**Step 1 — Get your device ID:**
```
./bin/dg-mic-audio --list-devices
```

Copy the `id` value of any device. For example: `BuiltInMicrophoneDevice`

**Step 2 — Run with that device (two parts):**

Part A — Record 3 seconds using the selected device:
```
timeout 3 ./bin/dg-mic-audio --sample-rate 16000 --chunk-duration 200 --device-id BuiltInMicrophoneDevice --enable-levels --level-interval-ms 200 --fft-bins 0 1>/dev/null 2>/tmp/dg-mic-sel.txt
```

(Replace `BuiltInMicrophoneDevice` with whatever ID you copied.)

Part B — Check the results:
```
grep audio_level /tmp/dg-mic-sel.txt | head -5
```

**What to do during Part A:** Make noise.

**What you should see in Part B:** `audio_level` lines, same as Test 2.

**PASS if:** You see audio_level lines. That means it successfully selected the device.

**Step 3 — Try a bad device ID (should fail):**
```
./bin/dg-mic-audio --sample-rate 16000 --chunk-duration 200 --device-id FAKE_DEVICE_123 2>&1
```

**PASS if:** You see an error message mentioning "Device not found" — that's the correct behavior.

---

## TEST 5: Streaming transcription (live speech-to-text)

**What this tests:** Real-time transcription via Deepgram.

**Run this** (paste your Deepgram key where it says `YOUR_KEY`):
```
DEEPGRAM_API_KEY=YOUR_KEY npx tsx examples/basic/main.ts
```

**What to do:** Wait for "Transcription started", then talk normally into your mic for 10-15 seconds.

**What you should see:**
```
Transcription started. Speak or play audio...

   [Mic] (interim, 85%) hello
   [Mic] (FINAL, 92%) Hello, how are you doing today?
```

**PASS if:** You see your words appearing. `interim` = partial guess, `FINAL` = confirmed text.

**Stop it:** Press `Ctrl+C`.

---

## TEST 6: Batch transcription (record then transcribe)

**What this tests:** Record audio, then send it all at once to Deepgram.

**Run this** (paste your Deepgram key):

First, install tsx if you haven't:
```
npm install -D tsx
```

Then run:
```
DEEPGRAM_API_KEY=YOUR_KEY npx tsx examples/test-all-features/main.ts
```

**What to do:** The test suite runs 5 tests automatically. For each one:
- **Test 1 (devices):** Just watch — it lists your mics
- **Test 2 (audio levels, 5s):** Make noise — watch the VU bars
- **Test 3 (streaming, 10s):** Talk clearly — watch text appear
- **Test 4 (batch, 5s):** Talk clearly — after 5s it uploads and shows transcript
- **Test 5 (mic selection, 3s):** Make noise — confirms device selection

**PASS if:** You see `PASS` printed after each test. The key one for batch is Test 4 — after "Stopping and uploading..." you should see:
```
Batch transcript: "whatever you said"
Confidence: 95.2%
Words: 5

PASS: Batch transcription works.
```

---

## Quick summary checklist

| # | Feature | What = PASS |
|---|---------|------------|
| 1 | List mics | See JSON with device names |
| 2 | VU meter | `rms`/`peak` change with noise |
| 3 | FFT data | `fft` array has 64 entries |
| 4 | Mic select | Works with real ID, errors on fake ID |
| 5 | Streaming | See live text as you speak |
| 6 | Batch | See transcript after upload completes |

---

## Troubleshooting

- **"Microphone permission denied"** — System Settings > Privacy & Security > Microphone > enable your terminal app
- **"No transcripts received"** — check your Deepgram API key is valid
- **"Batch upload failed"** — network issue or bad API key
- **No audio_level events** — try running `./bin/dg-mic-audio --sample-rate 16000 --chunk-duration 200 --enable-levels --level-interval-ms 50 --fft-bins 0` directly and check stderr for output
