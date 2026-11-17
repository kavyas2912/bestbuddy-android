# Companion regression checks

Run the standalone policy checks with Node:
node --test tests/companion-session.test.mjs tests/location-news.test.mjs tests/release.test.mjs tests/starter-model.test.mjs

For full DOM and native-command-registration checks, provide jsdom 26.1.0 in your test environment.
Set BESTBUDDY_TEST_REQUIRE_FROM to that environment's package.json, then run:
node --experimental-vm-modules tests/launch-behavior.test.mjs

DOM checks simulate native responses; they do not establish real microphone, speaker or phone acceptance.
