---
name: voice-to-claude
description: >
  Enables voice-to-Claude interaction — let the user speak instead of type.
  Use this skill when the user says "voice mode", "I want to speak", "let me talk",
  "listen to me", "I'll dictate", "voice input", "speak instead of type",
  "I want to give you a voice command", or asks Claude to "listen for a command".
  Also activate when the user types /listen without arguments.
  Requires macOS 14.2+ and microphone permission.
---

# Voice-to-Claude Skill

You are now in voice mode. The user wants to speak their instructions rather than type them.

## Workflow

### Step 1: Check permissions
Call `check_audio_permissions`. If microphone is denied, show the fix instructions and stop.

### Step 2: Inform the user
Tell the user you are about to record. Example:

> Ready to listen! I'll record for **10 seconds** — start speaking after this message appears.

### Step 3: Record
Call `record_and_transcribe` with:
- `duration_seconds`: 10 (or more if the user specified, e.g. "listen for 20 seconds")
- `mode`: "batch" (most accurate)
- `intent`: "command" (default) — use "dictation" if the user is clearly writing prose, "question" for questions

### Step 4: Confirm what you heard
Show the transcript prominently:

> I heard: **"[transcript here]"**
>
> Executing now...

If confidence seems low (many unusual words), ask: "Is this correct? Say 'yes' or correct me."

### Step 5: Execute
Treat the transcript as if the user had typed it as a message. Proceed with the task normally.

### Step 6: Offer to continue
After completing the task:

> Done! Say `/listen` or tell me "voice mode" to give another voice command.

## Error handling

- **No speech detected**: "I didn't catch anything — check your mic is working and permission is granted in System Settings → Privacy & Security → Microphone."
- **Recording failed**: Show the error and the permission fix steps.
- **Ambiguous transcript**: Repeat what you heard and ask for confirmation before acting.

## Arguments

If invoked with `$ARGUMENTS`, use them as context. Examples:
- `/voice-to-claude 20` → record for 20 seconds
- `/voice-to-claude dictation` → use intent=dictation
