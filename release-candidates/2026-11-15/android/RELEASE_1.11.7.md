# BestBuddy Android 1.11.7 — companion corrections

15 November 2026. Application ID app.vce.buddy; version code 11107.

- First launch and subsequent launches greet the user aloud and offer daily briefing or a chat. The Android microphone permission remains required before listening. Quiet remains effective.
- Read daily briefing is prominent on the first Conversation page and starts spoken sections immediately. Stop/Quiet cancel reading.
- Save city uses the registered vce_region command, persists the chosen city/country, and refreshes publisher selection immediately. The chosen place takes precedence over the device's physical location. An offline city choice can be saved before weather coordinates are available.
- Old automatically discovered Indian feeds are excluded when the selected country differs. Boston uses Boston local, New England regional, and US national/world publishers.
- Senior assistance is off by default, including upgrades from the earlier forced default. Explicitly opting in remains available in Settings.
- A 24-question, non-cycling bank supports casual introductions. Unanswered questions do not accumulate. Skip, Not now, Quiet and the proactive companionship switch give the user control.
- Casual hobbies and goals are saved only with both Local memory and Learn interests permission. Conversation-derived preferences are removed on learning withdrawal; manually saved preferences remain.
- Existing fresh jokes, facts, anecdotes and stories retain their freshness ledger. Recent proactive content hashes prevent immediate reuse across launches. Passive chatter has a bounded cadence; active voice conversation remains available.
- Short, non-sensitive interest topics can prefetch public Wikipedia summaries into the existing bounded offline knowledge cache, under online-content consent. Raw chats are not uploaded as research queries.
- Due reminders are spoken once when Buddy is free to speak; muted reminders remain visible. Safety routing precedes conversational shortcuts.

Validation records are in companion-core-tests.log, companion-all-js-tests.log, launch-behavior-tests.log and evidence/current-ui/layout-report.json. Browser checks cover portrait, narrow, landscape and enlarged text. Native speaker/microphone behaviour still needs a physical-device retest; no device was connected during this build.

Use the debug test APK as an update over the prior debug-signed 1.11.6 installation. Release APK/AAB use the separately protected first-publication upload key and require the corresponding signing identity. Source and store files exclude private signing material.

Open-ended conversation quality depends on the installed model. The regression checks establish flow, source selection and permission handling; they do not measure model quality or acoustic performance.
