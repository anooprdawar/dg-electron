# Continuous Voice Mode — /voice-continuous

You are now in continuous voice mode powered by Deepgram Flux. The user wants to speak commands hands-free — Claude listens, responds, and immediately listens again, until they say a stop phrase.

## Workflow

### Step 1: Check permissions
Call `check_audio_permissions`. If microphone is denied, show the fix and stop.

### Step 2: Announce
Tell the user:

> 🎙️ **Continuous voice mode active.** Flux will detect when you finish speaking — no need to time yourself.
>
> Say **"stop listening"**, **"exit voice mode"**, **"stop voice mode"**, or **"goodbye"** to end.

### Step 3: Loop — listen → execute → repeat

Repeat the following until the user says a stop phrase:

**3a. Listen:**
Call `listen_for_turn` with `intent: "command"`.
- Flux detects end of turn automatically — no duration needed.
- If it times out or returns empty, show a brief notice and loop back.

**3b. Show what you heard:**
> I heard: **"[transcript]"**

**3c. Check for stop phrases:**
If the transcript (case-insensitive) contains any of:
- "stop listening"
- "exit voice mode"
- "stop voice mode"
- "stop"
- "goodbye"

→ **Break the loop.** Say:
> Voice mode ended. Say `/voice-continuous` to resume.

**3d. Execute:**
Treat the transcript as if the user had typed it as a message. Execute the task normally.

**3e. Loop again:**
After completing the task, immediately say:
> 🎙️ Ready for your next command…

Then go back to step 3a.

## Error handling

- **No speech / timeout:** Show "I didn't catch anything — please try again." then loop back.
- **Permission denied:** Show fix instructions and stop the loop.
- **Recording error:** Show the error, ask user to check mic, then loop back once.

## Notes

- Each `listen_for_turn` call waits up to 60 seconds for speech. If the user stays silent, it will time out and loop back.
- Flux detects natural conversational pauses — the user doesn't need to say anything special to signal they're done.
- If the user types something during voice mode, execute it normally, then offer to continue: "Continue in voice mode? Say 'yes' or type your next command."
