# Level 2 — Enhanced Offline Conversation

Integrated `ui/src/offline-companion.js` into `ui/src/app.js` without replacing the native voice, safety, news, weather, model or knowledge routes.

The offline companion provides greetings, help, jokes, stories, curated facts, reflective questions, mood-sensitive replies, and a short-lived follow-up context. It does not save personal dialogue, use the network, or fabricate answers to unknown questions. Unknown queries still use the original native resolver and optional local model. If model generation fails, the app returns a clearly identified offline-unavailable response rather than pretending to know the answer.

The existing Quiet control remains authoritative. No new dependencies were introduced.

This is a code integration deliverable. Android build and device verification are delegated to the user as requested.
