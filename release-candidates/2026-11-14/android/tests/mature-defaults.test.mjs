import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../ui/src/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../ui/index.html',import.meta.url),'utf8');
test('mature defaults without overriding existing preferences',()=>{
 assert.match(js,/tone:'calm',theme:'solidEmeraldBlue'/);
 assert.match(js,/accent:'#d9b76b'/);
 assert.match(js,/\.\.\.prefs\}/);
});
test('onboarding tone reflects persisted preference, not static playful selection',()=>{
 assert.match(js,/const selectedTone=/);
 assert.match(js,/b\.classList\.toggle\('active',b===selectedTone\)/);
 assert.match(html,/class="btn btn-outline-primary active" data-tone="calm"/);
});
