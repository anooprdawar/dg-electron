---
description: Record your voice and execute what you say as a Claude command
argument-hint: [duration_seconds]
---

Start a voice recording session. Record for $ARGUMENTS seconds (default: 10).

1. Check microphone permissions with `check_audio_permissions`. If denied, show the fix and stop.
2. Tell the user: "🎙️ Ready — I'll record for **$ARGUMENTS seconds** (or 10s if not specified). Start speaking after this message."
3. Call `record_and_transcribe` with:
   - `duration_seconds`: $ARGUMENTS if provided and is a number, otherwise 10
   - `mode`: "batch"
   - `intent`: "command"
4. Show what you heard: "I heard: **\"[transcript]\"**"
5. Execute the transcript as if the user had typed it.
