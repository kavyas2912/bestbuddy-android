"""Boot, install and launch the actual unsigned simulator .app; retain evidence.

This is launch acceptance only. It does not claim Android's platform plugin is
available on iOS, or that a simulator proves physical microphone/wake behaviour.
"""
from pathlib import Path
import json
import os
import plistlib
import subprocess
import time

root = Path(__file__).resolve().parents[1]
out = Path(os.environ.get('IOS_EVIDENCE_DIR', root / 'ios-evidence')).resolve()
out.mkdir(parents=True, exist_ok=True)


def run(*arguments):
    result = subprocess.run(arguments, text=True, capture_output=True, timeout=240)
    if result.returncode:
        raise RuntimeError(' '.join(arguments) + '\n' + result.stdout + result.stderr)
    return result.stdout


applications = [path for path in (root / 'src-tauri/gen/apple').rglob('*.app')
                if (path / 'Info.plist').is_file() and 'simulator' in str(path).lower()]
applications += [path for path in Path.home().joinpath('Library/Developer/Xcode/DerivedData').glob('*/Build/Products/*iphonesimulator/*.app')
                 if (path / 'Info.plist').is_file()]
if not applications:
    raise FileNotFoundError('No simulator app was produced; a device archive is not substituted')
application = max(applications, key=lambda path: path.stat().st_mtime)
with (application / 'Info.plist').open('rb') as stream:
    info = plistlib.load(stream)
if info['CFBundleIdentifier'] != 'app.vce.buddy':
    raise RuntimeError('Unexpected app identity')
if 'iPhoneSimulator' not in info.get('CFBundleSupportedPlatforms', []):
    raise RuntimeError('Expected a simulator app, not a signed phone package')
devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '--json'))
choices = [(runtime, device) for runtime, rows in devices['devices'].items() for device in rows
           if 'iOS' in runtime and 'iPhone' in device['name'] and device.get('isAvailable')]
if not choices:
    raise RuntimeError('The macOS runner has no available iPhone simulator')
runtime, device = choices[-1]
identifier = device['udid']
if device['state'] != 'Booted':
    run('xcrun', 'simctl', 'boot', identifier)
run('xcrun', 'simctl', 'bootstatus', identifier, '-b')
run('xcrun', 'simctl', 'install', identifier, str(application))
launch = run('xcrun', 'simctl', 'launch', identifier, info['CFBundleIdentifier'])
time.sleep(15)
pid = launch.strip().split(':')[-1].strip()
run('xcrun', 'simctl', 'spawn', identifier, 'launchctl', 'procinfo', pid)
run('xcrun', 'simctl', 'io', identifier, 'screenshot', str(out / 'ios-launch.png'))
report = dict(app=str(application), bundle_id=info['CFBundleIdentifier'], version=info['CFBundleShortVersionString'],
              simulator=device['name'], runtime=runtime, process_alive_after_15s=True,
              signing_required=False, physical_device_acceptance=False,
              native_feature_parity='not established: existing vce-platform bridge is Android-only')
(out / 'ios-launch-report.json').write_text(json.dumps(report, indent=2))
(out / 'simulator-app-path.txt').write_text(str(application))
print(json.dumps(report))
