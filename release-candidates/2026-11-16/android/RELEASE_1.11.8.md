# BestBuddy Android 1.11.8 — engaging conversation candidate

16 November 2026. Package `app.vce.buddy`, versionName `1.11.8`, versionCode `11108`.

## Conversation changes

The owner clarified that the app should ask **more** thoughtful questions, encourage the user to share, and maintain a warm, humorous manner. This change increases invitations to reply; it does not replace conversation with silent observations.

- Lively foreground chatter becomes eligible after about one idle minute instead of three, checked every ten seconds. Two out of three contextual invitation slots favour a question while the user is engaging. Fresh sourced humour, stories and discoveries continue between those slots.
- Questions draw on known interests and avoid explicitly disliked topics. Curated personal-profile questions remain limited to three daily; contextual conversation does not consume that personal questionnaire allowance.
- Open conversational answers can reach the local model with newly learned preferences, rather than being intercepted by the same fixed preference acknowledgement. Offline fallback remains available. Generation context requests thoughtful follow-ups, light wit and sensitivity to distress.
- A sourced discovery can receive one short model-generated follow-up question. A repeated generated question is rejected independently of the source story. Questions allow a permission-checked voice reply after speech completes.
- Explicit dislikes can be learned alongside interests and goals under the existing memory/learning permissions. Corrections through existing profile controls remain available.
- Unanswered proactive turns progressively slow down; actual replies restore the lively pace. Quiet, snooze, declined personal questions, active safety alerts, media playback, settings/navigation and an ongoing voice turn take precedence. The app does not chatter while hidden.
- Public-content fingerprints survive beyond 240 items and track source seeds separately from generated additions. This is exact-normalisation duplicate protection for the proactive path, not a claim of complete semantic deduplication or implemented recall across the family.

## Verification

Current JavaScript suite: 51 passing Node test entries, including the full-app DOM/bridge harness with 10 passing integration scenarios. New coverage includes one-minute eligibility, non-response backoff, frequent relevant questions, disliked-topic avoidance, question declines, local-model follow-ups, preference context, duplicate follow-up rejection and native safety/Quiet precedence. JavaScript syntax checks pass.

The DOM harness uses mocked native results. It does not establish real model quality, microphone sensitivity, audible speech or phone acceptance. Existing Android local model and speech requirements remain; this change does not claim that the separately requested fully bundled default-model package is complete.

## Installation and acceptance

Use a debug-signed APK to update the prior debug test installation. Use the approved release-signed APK for an existing matching release installation or a new private installation. Do not uninstall just to overcome a signature mismatch; preserve/export personal data first.

On the phone, confirm the displayed version is 1.11.8, Sound and proactive chatter are enabled, and permissions are granted. Leave the conversation screen idle for about one minute; answer Buddy's question, then continue the topic. Check that it responds to the answer, asks useful follow-ups and mixes in humour naturally. Confirm that Quiet, Not now, media playback and safety alerts suppress ordinary chatter. Repeated unanswered invitations should become less frequent.

This candidate updates BestBuddy Android. Butler and the dedicated Senior Assistant still require their corresponding implementation and native release validation; this APK is not delivery of all twelve planned platform builds.
