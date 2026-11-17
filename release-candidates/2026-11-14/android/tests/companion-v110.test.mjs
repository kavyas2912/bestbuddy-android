import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('version synchronized',()=>{const c=JSON.parse(read('../src-tauri/tauri.conf.json'));assert.equal(c.version,'1.10.0');assert.equal(c.bundle.android.versionCode,11000);assert.match(read('../src-tauri/Cargo.toml'),/version = "1.10.0"/)});
test('four navigation sections retained',()=>{const html=read('../ui/index.html');for(const id of ['home','explore','daybook','settings'])assert.match(html,new RegExp('data-go="'+id+'"'))});
test('quiet and conversation protections retained',()=>{const js=read('../ui/src/app.js');assert.match(js,/prefs.quietMode/);assert.match(js,/async function quiet/);assert.match(js,/offlineCompanionReply/)});
test('six named premium themes available',()=>{const js=read('../ui/src/app.js');for(const name of ['Emerald Blue + Gold','Dark Green + Gold','Golden Ivory','Ocean Blue','Sparkling Blue','Classic Charcoal + Gold'])assert.ok(js.includes(name),name)});
test('JDK search and path normalization',()=>{const ps=read('../BUILD_ANDROID.ps1');assert.match(ps,/Join-Path \$env:ProgramFiles 'Java'/);assert.match(ps,/Normalize-Directory/);assert.match(ps,/javac 21/)});
