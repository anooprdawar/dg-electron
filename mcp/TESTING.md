# Testing Guide — Deepgram Claude Code Skill

Work through these tests in order. Each one builds on the last.

---

## Before you start

### What you need

- macOS 14.2+ (Sonoma)
- Node.js 18+
- A Deepgram API key → [console.deepgram.com](https://console.deepgram.com) (free, $200 credits)
- A working microphone
- Claude Code installed (`npm install -g @anthropic-ai/claude-code` or however you have it)

### One-time setup

**Step 1 — Set your API key:**
```bash
export DEEPGRAM_API_KEY="your-key-here"
```
Add this to your `~/.zshrc` or `~/.bashrc` to persist it across sessions.

**Step 2 — Build everything (if you haven't already):**
```bash
cd /path/to/dg-electron
npm install && npm run build      # builds the main library
npm run build:mcp                 # installs mcp/ deps and compiles it
```

**Step 3 — Create a test audio file** (you'll need this for tests 4–6):
```bash
# Record 10 seconds of yourself speaking into this file
# Say something like "Hello, this is a test of the Deepgram transcription system."
./bin/dg-mic-audio --sample-rate 16000 --chunk-duration 200 > /tmp/test-recording.raw
# Wait 10 seconds, then Ctrl+C

# Convert to WAV so Deepgram can identify the format
# (If you don't have ffmpeg, just use a pre-existing mp3/mp4/wav file you have)
ffmpeg -f s16le -ar 16000 -ac 1 -i /tmp/test-recording.raw /tmp/test-recording.wav -y 2>/dev/null
```

Alternatively, any `.mp3`, `.mp4`, `.m4a`, or `.wav` file on your machine works for tests 4–6.

---

## TEST 1: MCP server builds and starts

**What this tests:** The compiled server launches and speaks valid JSON-RPC.

```bash
cd /path/to/dg-electron
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | DEEPGRAM_API_KEY=test_key DG_ELECTRON_BINARY_DIR="$(pwd)/bin" node mcp/dist/server.js 2>/dev/null
```

**PASS if:** You see a JSON response containing `"serverInfo":{"name":"deepgram","version":"0.1.0"}`.

---

## TEST 2: All 7 tools are registered

**What this tests:** Every tool was compiled and wired up in `server.ts`.

```bash
cd /path/to/dg-electron
(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'; \
 echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}') \
  | DEEPGRAM_API_KEY=test_key DG_ELECTRON_BINARY_DIR="$(pwd)/bin" node mcp/dist/server.js 2>/dev/null \
  | grep -o '"name":"[^"]*"' | grep -v '"name":"deepgram"' | sort
```

**PASS if:** You see all 7 of these (order doesn't matter):
```
"name":"analyze_audio"
"name":"check_audio_permissions"
"name":"list_mic_devices"
"name":"record_and_transcribe"
"name":"summarize_audio"
"name":"text_to_speech"
"name":"transcribe_audio"
```

---

## TEST 3: MCP server connects to Claude Code

**What this tests:** Claude Code finds and connects to the Deepgram MCP server via `.mcp.json`.

```bash
cd /path/to/dg-electron
export DEEPGRAM_API_KEY="your-real-key"
claude
```

Once inside Claude Code, run:
```
/mcp
```

**PASS if:** You see `deepgram` listed with status `connected` (green).

> **If it shows disconnected:** Run `claude --debug` to see the startup error, then check the Troubleshooting section at the bottom.

---

## TEST 4: `check_audio_permissions`

**What this tests:** The server can call into the `@deepgram/electron` library and check macOS permissions.

In Claude Code, say:
```
Can you check my audio permissions?
```

**PASS if:** Claude returns a table showing the status of **Microphone** and **System Audio** (granted / denied / unknown), and gives fix instructions for anything that isn't granted.

> **Note:** Both should be `granted` before proceeding to recording tests.

---

## TEST 5: `list_mic_devices`

**What this tests:** The Swift binary runs successfully and returns your connected microphones.

In Claude Code, say:
```
List my available microphones
```

**PASS if:** Claude returns a table of at least one device with a name and device ID. Example:

```
| Name | Device ID | Default |
|------|-----------|---------|
| MacBook Pro Microphone | BuiltInMicrophoneDevice | ✓ default |
```

Write down one of the device IDs — you'll use it in Test 10.

---

## TEST 6: `transcribe_audio` — basic transcript

**What this tests:** Deepgram API key works, file upload streams correctly, transcript comes back.

In Claude Code, say (substitute your actual file path):
```
Transcribe /tmp/test-recording.wav
```

Or if you have any audio/video file handy:
```
Transcribe /path/to/any-audio-or-video.mp3
```

**PASS if:** Claude returns a `## Transcript` section with readable text from the file.

**What failure looks like:**
- `DEEPGRAM_API_KEY not set` → your env var isn't reaching the MCP server (see Troubleshooting)
- `File not found` → double-check the path
- `Deepgram API error (401)` → invalid API key
- Empty transcript → the file was silent or the format wasn't recognized

---

## TEST 7: `transcribe_audio` — with intelligence features

**What this tests:** Summarization, sentiment, and topic detection flags work.

In Claude Code, say:
```
Transcribe /tmp/test-recording.wav and give me a summary, sentiment, and topics
```

**PASS if:** Claude returns sections for:
- `## Summary` — a few sentences summarizing what was said
- `## Sentiment` — overall sentiment (positive/neutral/negative) with a score
- `## Topics` — bullet list of detected topics

> **Note:** These features are English-only and work best on longer recordings (30+ seconds). Short test clips may show minimal results — that's normal.

---

## TEST 8: `summarize_audio`

**What this tests:** The dedicated summarize tool works as a standalone call.

In Claude Code, say:
```
Give me a TL;DR summary of /tmp/test-recording.wav
```

**PASS if:** Claude returns a `## Summary` section. If summarization doesn't produce meaningful output on a short clip, verify you see the summary section heading — the API called successfully.

---

## TEST 9: `analyze_audio`

**What this tests:** The analysis tool returns a structured intelligence report.

In Claude Code, say:
```
Analyze the sentiment and topics in /tmp/test-recording.wav
```

**PASS if:** Claude returns an `## Audio Analysis Report` with sentiment and/or topics sections.

---

## TEST 10: `text_to_speech` — generate and play

**What this tests:** Deepgram Aura TTS generates an MP3 and `afplay` plays it.

In Claude Code, say:
```
Say "Hello, Deepgram text to speech is working perfectly." out loud
```

**PASS if:**
1. You **hear audio** play through your speakers within a few seconds
2. Claude reports the output file path (e.g. `/tmp/deepgram-tts-<timestamp>.mp3`)

**What failure looks like:**
- `TTS generation failed: Deepgram TTS error (404)` → voice model name is wrong or not available on your plan
- File generated but no sound → `afplay` failed; try running `afplay /tmp/deepgram-tts-*.mp3` manually

**Bonus — test a different voice:**

In Claude Code, say:
```
Use text_to_speech with voice aura-2-orion-en to say "This is the Orion voice from Deepgram Aura."
```

**PASS if:** You hear a different voice than the first test.

---

## TEST 11: `record_and_transcribe` — batch mode

**What this tests:** The Swift mic binary starts, records for N seconds, and the transcript comes back.

> Make sure microphone permission is `granted` (Test 4) before running this.

In Claude Code, say:
```
Record my voice for 8 seconds and transcribe what I say
```

When Claude says it's ready to record, **speak clearly** for ~6 seconds. Say something like:
> "This is a test of the Deepgram live recording feature. One two three four five."

**PASS if:** Claude returns a `## Voice Recording Transcript` section with your words (or close to them) and a confidence percentage.

**What failure looks like:**
- `Microphone permission denied` → grant permission in System Settings → Privacy & Security → Microphone, then restart terminal
- `Failed to start recording: Native binary "dg-mic-audio" not found` → `DG_ELECTRON_BINARY_DIR` isn't set correctly in `.mcp.json`; verify `bin/dg-mic-audio` exists in your project root
- `No speech detected` → you didn't speak during the recording window, or the mic isn't picking up audio

---

## TEST 12: `record_and_transcribe` — streaming mode

**What this tests:** Real-time transcription works (words come back as you speak, not just at the end).

In Claude Code, say:
```
Record me for 10 seconds in streaming mode
```

Speak for the full 10 seconds.

**PASS if:** The transcript reflects natural speech and is returned after the recording ends.

> Streaming mode collects only `is_final: true` events, so the result is similar to batch — the difference is latency during longer recordings, not the final output format.

---

## TEST 13: `record_and_transcribe` — specific microphone

**What this tests:** The `device_id` parameter is passed to the Swift binary correctly.

Use a device ID from Test 5. In Claude Code, say:
```
Record 5 seconds using device ID BuiltInMicrophoneDevice
```
(Replace `BuiltInMicrophoneDevice` with the ID you noted earlier.)

**PASS if:** Recording completes and a transcript is returned (or "no speech detected" if you stayed silent — both mean the device was selected successfully).

---

## TEST 14: `/listen` command

**What this tests:** The `/listen` slash command invokes recording and executes the result as a command.

In Claude Code, run:
```
/listen 8
```

When prompted, say something actionable like:
> "What files are in the current directory?"

**PASS if:**
1. Claude shows what it heard in quotes
2. Claude then **executes** that question — e.g. lists the directory contents

This is the core voice-to-code loop working end-to-end.

---

## TEST 15: `/speak` command

**What this tests:** The `/speak` slash command generates TTS from inline text.

In Claude Code, run:
```
/speak The Deepgram Claude Code skill is working perfectly.
```

**PASS if:** You hear the sentence spoken through your speakers within a few seconds.

---

## TEST 16: `voice-to-claude` skill — natural trigger

**What this tests:** Claude recognizes the voice-to-claude skill by description and activates it without a slash command.

In Claude Code, say:
```
I want to use voice mode
```

**PASS if:**
1. Claude checks your microphone permissions automatically
2. Claude tells you it's about to record and for how long
3. Recording starts, you speak a command (try "list the files in the mcp directory")
4. Claude shows what it heard and executes it

---

## TEST 17: `transcribe-and-analyze` skill — natural trigger

**What this tests:** Claude activates the transcription skill when you describe a file to transcribe.

In Claude Code, say:
```
What does this recording say? /tmp/test-recording.wav
```

**PASS if:** Claude calls `transcribe_audio` automatically without you specifying which tool to use, and returns the transcript.

---

## TEST 18: End-to-end voice coding workflow

**What this tests:** The full voice-to-code loop with a real coding task.

In Claude Code:

1. Say: `"I want to give you a voice command"`
2. When Claude says it's recording, speak: `"Show me the contents of the server.ts file in the mcp directory"`
3. Confirm the transcript looks right when Claude echoes it back
4. Claude should then read and display `mcp/server.ts`

**PASS if:** Without typing the file request, Claude opens and displays the correct file based entirely on your spoken words.

---

## Quick reference checklist

| # | Test | Tool / Feature | Pass Condition |
|---|------|---------------|----------------|
| 1 | Server starts | Server binary | Valid JSON-RPC initialize response |
| 2 | All tools registered | server.ts | 7 tool names in `tools/list` |
| 3 | MCP connects to Claude | `.mcp.json` | `deepgram` shows connected in `/mcp` |
| 4 | Permissions check | `check_audio_permissions` | Table with mic + system audio status |
| 5 | List mics | `list_mic_devices` | At least one device with ID shown |
| 6 | Transcribe file | `transcribe_audio` | Readable transcript returned |
| 7 | Transcribe + intelligence | `transcribe_audio` | Summary, sentiment, topics sections |
| 8 | Summarize | `summarize_audio` | Summary section returned |
| 9 | Analyze | `analyze_audio` | Analysis report with sentiment/topics |
| 10 | Text to speech | `text_to_speech` | Audio plays through speakers |
| 11 | Live recording (batch) | `record_and_transcribe` | Your words transcribed correctly |
| 12 | Live recording (streaming) | `record_and_transcribe` | Transcript returned after recording |
| 13 | Mic device selection | `record_and_transcribe` | Recording works with specific device ID |
| 14 | /listen command | `/listen` | Spoken words executed as a command |
| 15 | /speak command | `/speak` | Text played through speakers |
| 16 | Voice mode skill | `voice-to-claude` | Activates from "I want voice mode" |
| 17 | Transcribe skill | `transcribe-and-analyze` | Activates from natural file description |
| 18 | End-to-end voice coding | All of the above | File opened based on spoken instruction |

---

## Troubleshooting

### `deepgram` shows disconnected in `/mcp`

Run `claude --debug` and look for startup errors. Common causes:

- **`mcp/dist/server.js` not found** — run `npm run build:mcp` from the project root
- **`DEEPGRAM_API_KEY` not in environment** — the `.mcp.json` uses `${DEEPGRAM_API_KEY}`; make sure it's exported in the shell that launches Claude Code (`echo $DEEPGRAM_API_KEY` should print your key)
- **Node.js version too old** — requires Node.js 18+; check with `node --version`

### `DEEPGRAM_API_KEY not set` inside Claude

The MCP server inherits environment variables from the shell that launched Claude Code. If you set the key after launching, restart Claude Code.

### `Native binary "dg-mic-audio" not found`

The `.mcp.json` sets `DG_ELECTRON_BINARY_DIR` to `${PWD}/bin`. This only works if Claude Code is launched from the project root directory. Verify:

```bash
ls bin/dg-mic-audio    # should exist
```

If you launch Claude Code from a different directory, use an absolute path in `.mcp.json`:
```json
"DG_ELECTRON_BINARY_DIR": "/absolute/path/to/dg-electron/bin"
```

### Microphone permission denied

```
System Settings → Privacy & Security → Microphone
```
Enable your terminal application (Terminal, iTerm2, Warp, etc.). **Restart the terminal** after granting — macOS requires it.

### No speech detected in recording

- Speak louder and closer to the mic
- Run Test 4 (`check_audio_permissions`) — microphone must show `granted`
- Test your mic works independently: `./bin/dg-mic-audio --sample-rate 16000 --chunk-duration 200 --enable-levels --level-interval-ms 200 --fft-bins 0 1>/dev/null` — you should see `audio_level` JSON on stderr when you make noise

### TTS fails with 400 or 404

The voice model name may not be available on your Deepgram plan. Try the legacy voice:
```
Use text_to_speech with voice aura-asteria-en to say "hello"
```

### Transcript quality is poor

- Use `nova-3` model (the default — it's the best)
- Speak in English for best results
- Reduce background noise
- For batch mode, 8–15 seconds of clear speech works best
