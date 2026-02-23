---
name: meeting-notes
description: >
  Records a live meeting from the microphone, transcribes it, extracts action items
  and decisions, and saves structured meeting notes to a markdown file.
  Activate when the user says "take meeting notes", "record this meeting",
  "start recording the standup", "create notes from this call",
  "I have a meeting starting", or "record and summarize this discussion".
  Requires macOS 14.2+ and microphone permission.
---

# Meeting Notes Skill

## Workflow

### Step 1: Setup
1. Call `check_audio_permissions` to verify microphone access.
2. Ask the user (await their response before recording):
   - "What is the **meeting title or topic**?"
   - "How long is the meeting? *(default: 30 minutes)*"

### Step 2: Record in chunks
Record in 5-minute (300-second) chunks to avoid timeouts and to show progress:

```
For each chunk until total duration reached:
  1. Tell user: "🎙️ Recording chunk N/M (minutes X-Y of the meeting)..."
  2. Call record_and_transcribe:
     - duration_seconds: min(300, remaining_seconds)
     - mode: "batch"
     - intent: "dictation"
  3. Append the transcript chunk to accumulated text
  4. Tell user: "✅ Chunk N captured. [N] minutes remaining."
```

### Step 3: Process
After all chunks are recorded:
1. Combine all transcript chunks into one document
2. Extract **action items** — look for patterns:
   - "will [do something]"
   - "need to [do something]"
   - "should [do something]"
   - "action:", "TODO:", "follow up on"
   - Explicit assignments: "John will...", "the team needs to..."
3. Extract **decisions** — "we decided", "agreed to", "going with", "approved"
4. Create a brief **summary** (3-5 sentences)

### Step 4: Save to file
Create a file at `./meeting-notes/YYYY-MM-DD-<slug>.md` where slug is derived from the title.

Use this structure:
```markdown
# [Meeting Title]
**Date:** YYYY-MM-DD
**Duration:** X minutes

## Summary
[3-5 sentence summary of what was discussed]

## Action Items
- [ ] [Action] — @[person if mentioned] by [date if mentioned]

## Decisions
- [Decision made]

## Full Transcript
[complete transcript]
```

### Step 5: Confirm
- Tell the user where the notes were saved
- Offer: "Want me to create GitHub issues from the action items?"

## Notes
- If the user wants to stop early, they can say "stop recording" between chunks
- Keep each transcript chunk separate until all are collected, then combine
- The `./meeting-notes/` directory will be created if it doesn't exist
