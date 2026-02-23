# Quickstart — Deepgram for Claude Code

Follow these steps exactly, in order. Each step tells you what you should see so you know it worked.

---

## Step 1 — Get a Deepgram API key

1. Go to **https://console.deepgram.com**
2. Sign up (it's free, you get $200 of credits automatically)
3. Once you're logged in, click **"API Keys"** in the left sidebar
4. Click **"Create a New API Key"**
5. Give it any name (e.g. "claude-test") and click Create
6. **Copy the key** — it starts with something like `a1b2c3d4...`

Keep this somewhere safe. You'll need it in Step 3.

---

## Step 2 — Build the project

Open your terminal and run these commands one at a time:

```bash
cd /path/to/dg-electron
```
*(Replace `/path/to/dg-electron` with wherever you cloned this repo)*

```bash
npm install
```
```bash
npm run build
```
```bash
npm run build:mcp
```

You should see output ending in something like `DTS ⚡️ Build success` for the first build and no errors for the second.

**If you see errors:** Check that you have Node.js 18 or newer installed. Run `node --version` — it should say `v18` or higher.

---

## Step 3 — Set your API key

In the same terminal window, run this (paste your key from Step 1):

```bash
export DEEPGRAM_API_KEY="paste-your-key-here"
```

To verify it worked:
```bash
echo $DEEPGRAM_API_KEY
```

You should see your key printed back. If you see nothing, re-run the export line.

> **Tip:** To avoid doing this every time, add the export line to your `~/.zshrc` file.

---

## Step 4 — Open Claude Code in this project

In the same terminal window (same directory, same session):

```bash
claude
```

Claude Code will open. The first time it opens in this directory, it may ask:
> *"Allow MCP server 'deepgram' to run?"*

**Click "Allow"** (or press Enter to confirm).

---

## Step 5 — Check the MCP server connected

Once Claude Code is open, type this and press Enter:

```
/mcp
```

You should see something like:

```
● deepgram (connected)
  transcribe_audio, record_and_transcribe, analyze_audio,
  summarize_audio, text_to_speech, check_audio_permissions,
  list_mic_devices, listen_for_turn
```

**If it says "disconnected":** Your API key probably didn't make it through. Quit Claude Code (`/exit`), make sure `echo $DEEPGRAM_API_KEY` prints your key, then run `claude` again from the same terminal window.

---

## Step 6 — Check your microphone permissions

Type this into Claude Code:

```
Check my audio permissions
```

You should see a table like:

```
| Permission   | Status  |
|--------------|---------|
| ✅ Microphone  | granted |
| ✅ System Audio | granted |
```

**If Microphone says "denied":**
1. Open **System Settings** on your Mac
2. Go to **Privacy & Security → Microphone**
3. Find your terminal app (Terminal, iTerm2, Warp, etc.) and turn it on
4. **Quit your terminal completely and reopen it**
5. Re-run `export DEEPGRAM_API_KEY="your-key"` and `claude` again

Don't move on until Microphone shows `granted`.

---

## Step 7 — See your microphones

Type this into Claude Code:

```
List my microphones
```

You should see your microphone(s) listed with their names, like:

```
| Name                     | Device ID                  | Default   |
|--------------------------|----------------------------|-----------|
| MacBook Pro Microphone   | BuiltInMicrophoneDevice    | ✓ default |
```

This confirms the Deepgram library can talk to macOS audio. ✅

---

## Step 8 — Transcribe an audio file

For this test you need any audio or video file. It can be a voice memo, a podcast clip, a meeting recording, a YouTube video you downloaded — anything with speech in it.

Type this into Claude Code (replace the path with your actual file):

```
Transcribe this file: /path/to/your/audio.mp3
```

You should see the words from your audio file appear as text.

**Don't have an audio file handy?** Skip to Step 9 and come back to this one later.

---

## Step 9 — Record your voice and transcribe it

This is the fun one. Type this into Claude Code:

```
Record my voice for 10 seconds
```

Claude will say something like:
> *"Ready to listen! I'll record for 10 seconds — start speaking after this message appears."*

**Immediately start talking.** Say something like:
> *"Hello, this is a test of the Deepgram recording feature. One, two, three, four, five."*

After 10 seconds, Claude will show you what it heard. It should look like:

```
## Voice Recording Transcript

> "Hello, this is a test of the Deepgram recording feature. One two three four five."

Duration: 10s | Words: 18 | Confidence: 97%
```

**If you see "No speech detected":**
- Make sure you started talking right after Claude's message appeared
- Check that your mic is working (try a FaceTime call or voice memo to confirm)
- Re-run Step 6 and make sure Microphone shows `granted`

---

## Step 10 — Hear Claude speak back to you

Type this into Claude Code:

```
/speak Hello! The Deepgram text to speech is working.
```

You should **hear that sentence spoken out loud** through your Mac's speakers within a few seconds.

If you don't hear anything:
- Check your Mac's volume isn't muted
- Try running this in your terminal to play the file manually:
  ```bash
  afplay /tmp/deepgram-tts-*.mp3
  ```

---

## Step 11 — Give Claude a voice command

This is the full voice-to-code loop. Type:

```
/listen 8
```

When Claude says it's recording, **speak a real command**, like:
> *"What files are in the mcp directory?"*

Claude will:
1. Show you what it heard: *"I heard: 'What files are in the mcp directory?'"*
2. Then actually execute it and list the files

You just told Claude what to do without typing. 🎙️

---

## Step 12 — Try voice mode (the natural way)

Instead of a slash command, just say it naturally:

```
I want to use voice mode
```

Claude will activate the `voice-to-claude` skill automatically, check your permissions, tell you it's about to record, and wait for your command.

Try saying:
> *"Explain what the server.ts file does"*

Claude should read `mcp/server.ts` and explain it to you — all triggered by your voice.

---

## Step 13 — Try continuous voice mode

This is the most natural way to work with Claude. Type:

```
/voice-continuous
```

Claude will announce that continuous voice mode is active. Then just **speak naturally** — unlike `/listen`, you don't need to specify a duration. Deepgram Flux detects when you've finished your thought and responds automatically.

Try saying:
> *"What are the source files in the mcp tools directory?"*

Claude will answer, then immediately say **"Ready for your next command…"** and start listening again — without you typing anything.

To stop, just say:
> *"Stop listening"* or *"Exit voice mode"*

---

## You're done! 🎉

Here's what you just tested:

| ✅ | What you tested |
|----|----------------|
| ✅ | MCP server connects to Claude Code |
| ✅ | Audio permissions check |
| ✅ | Microphone device listing |
| ✅ | Audio file transcription |
| ✅ | Live voice recording + transcription |
| ✅ | Text-to-speech playback |
| ✅ | `/listen` slash command |
| ✅ | Voice-to-code via natural language |
| ✅ | Continuous voice mode with Flux end-of-turn detection |

---

## What to try next

**Use continuous voice mode for hands-free coding:**
```
/voice-continuous
```
Speak commands naturally — Flux detects when you're done, responds, and listens again. Say "stop listening" to end.

**Transcribe a meeting recording:**
```
Transcribe this and give me a summary and action items: /path/to/meeting.mp4
```

**Record a longer thought:**
```
Record my voice for 30 seconds
```

**Take live meeting notes:**
```
Take meeting notes — this standup will be about 10 minutes
```

**Analyze a podcast or interview:**
```
What are the main topics and overall sentiment in /path/to/podcast.mp3
```

---

## Quick troubleshooting

| Problem | Fix |
|---------|-----|
| `/mcp` shows deepgram as disconnected | Quit Claude, run `export DEEPGRAM_API_KEY="..."` again, relaunch `claude` from the project directory |
| "DEEPGRAM_API_KEY not set" error | Same as above — the key must be in the same terminal session that runs `claude` |
| Microphone shows "denied" | System Settings → Privacy & Security → Microphone → enable your terminal app → **restart terminal** |
| "No speech detected" | Speak immediately after Claude's "I'm recording" message; speak loudly and clearly |
| No sound from `/speak` | Check Mac volume; try `afplay /tmp/deepgram-tts-*.mp3` in terminal |
| "Binary not found" error | Run `ls bin/dg-mic-audio` — if missing, you need to rebuild: `npm run build:native` |
| `listen_for_turn` times out immediately | Flux requires a valid API key with Flux access — verify with `echo $DEEPGRAM_API_KEY` |
| Continuous mode stops after one turn | Say `/voice-continuous` again; check that your Deepgram plan includes Flux (`flux-general-en`) |
