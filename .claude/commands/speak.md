---
description: Read text aloud using Deepgram Aura text-to-speech
argument-hint: <text to speak>
---

Convert the following text to speech and play it through the speakers.

Text to speak: $ARGUMENTS

1. If no text is provided in $ARGUMENTS, ask the user what they want spoken.
2. Call `text_to_speech` with:
   - `text`: $ARGUMENTS
   - `voice`: "aura-2-thalia-en"
   - `play`: true
3. Confirm: "✅ Audio played. File saved to [output_path]."
