# Device feedback implementation — V1.10.0

## Applied
- Main navigation is Home / Discover / Media / More; My Day remains reachable through Home and Discover.
- Discover now presents a compact activity selector, Surprise Me, and My Day. All existing command handlers remain in the code.
- Music Lounge has current/next track, explicit local track picker, collapsible library, and a service selector including regional providers. Services open through the existing native openLink command.
- Cinema defaults to four topic cards rather than twelve, retains category/search/favourites/local videos, and labels publisher-directory links accurately.
- Compact typography and panels, shorter media cards, removal of forced large Discover result area, and improved narrow-screen overflow handling.

## Not yet implemented — requires separate native/media integration
- Custom Macaw Android splash: source archive has no confirmed Macaw artwork. No icon was silently replaced.
- Introductory voice with controlled volume: existing native speak API has no proven volume parameter. Avoiding unexpectedly loud speech.
- Revised onboarding with location confirmation and consented, paced daily briefing: existing consent/age gating is preserved until the native flow can be safely revised.
- Direct, individually verified video links: current entries are publisher directories. No fabricated video URLs were inserted.
- Full media-player modernization and local device-wide scan: Android storage access and audio focus require native implementation.
- Safety functions were condensed visually, not removed; emergency features and consent checks remain intact.

No APK build or on-device verification was performed here.
