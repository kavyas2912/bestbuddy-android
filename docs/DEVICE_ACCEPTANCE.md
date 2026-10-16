# Device acceptance

Status: not run on a physical Android device in this cleanup session.

1. Install the candidate APK on a clean device and launch it. Check dashboard layout, navigation and persistence after restart.
2. Review consent controls. With microphone consent off, confirm recording stays off. Grant system microphone permission and voice consent deliberately.
3. Confirm the complete model pack is available. On Android first launch, wait for the voice assets to finish copying before testing speech.
4. Record a five-second microphone sample using the app diagnostic. Save and replay the WAV. Record whether input frames, audible playback and transcription succeed.
5. Test a short spoken command, the composer response and TTS playback. Test Hey Buddy, silence and interruption during playback. Record the first failing stage and app logs.
6. Test reminders across midnight, a lead-day reminder and a leap-day anniversary. Restart and check that already delivered reminders do not repeat.
7. Test optional news/weather/market/music/messenger integrations only with their required network access, accounts and consent. A visible control does not prove integration success.
8. Test personal-data export and erase, then restart to confirm the result.

Test permission denial and retry, fresh-install model extraction, rotation, background/foreground transitions and both supported ABIs as applicable. Release APK signing and Google Play AAB publication need separate configuration and validation.

Record the artifact SHA-256, OS/device, version, prerequisites and pass/fail result for each stage. Do not describe the release as accepted before this checklist has evidence.
