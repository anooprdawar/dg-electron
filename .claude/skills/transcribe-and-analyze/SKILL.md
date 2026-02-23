---
name: transcribe-and-analyze
description: >
  Transcribes an audio or video file and optionally runs intelligence analysis
  (summary, sentiment, topics, speaker identification) on it.
  Activate when the user provides an audio/video file path and wants the text content,
  a summary, or insights from it. Trigger phrases include:
  "transcribe this file", "what does this recording say", "summarize this audio",
  "get the transcript of", "what's in this mp3/mp4/wav", "analyze this meeting recording",
  "get topics from this podcast", "who said what in this recording".
---

# Transcribe and Analyze Skill

## Determine what the user wants

Read the user's request and select the appropriate tool and flags:

| User Request | Tool | Key Flags |
|---|---|---|
| Just transcript | `transcribe_audio` | defaults |
| Summary / TL;DR | `transcribe_audio` | `summarize: true` |
| Sentiment analysis | `transcribe_audio` | `sentiment: true` |
| Topic detection | `transcribe_audio` | `topics: true` |
| Speaker identification | `transcribe_audio` | `diarize: true` |
| Full analysis (meeting) | `transcribe_audio` | `summarize: true, sentiment: true, topics: true, diarize: true` |
| Quick summary only | `summarize_audio` | `also_return_transcript: false` |
| Audio insights | `analyze_audio` | `sentiment: true, topics: true` |

## After transcription

1. Present the result cleanly in markdown.
2. If diarization was requested, note that speaker labels appear as "Speaker 0", "Speaker 1", etc.
3. Offer follow-up actions:
   - "Want me to save this transcript to a file?"
   - "Should I extract action items from this meeting?"
   - "Want me to search the codebase for anything mentioned?"
   - "Shall I create a summary document?"

## Supported formats

mp3, mp4, m4a, wav, flac, ogg, webm, opus, aac, aiff

## Notes

- Sentiment and topic analysis are English-only features
- For files over 30 minutes, transcription may take a minute — let the user know
- If no file path is provided, ask the user for the path before calling a tool
