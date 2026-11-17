import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const h=readFileSync(new URL('../ui/index.html',import.meta.url),'utf8');
const j=readFileSync(new URL('../ui/src/app.js',import.meta.url),'utf8');
const c=readFileSync(new URL('../ui/app.css',import.meta.url),'utf8');
test('four primary navigation destinations and preserved media section',()=>{
 for(const id of ['home','explore','daybook','settings'])assert.match(h,new RegExp('data-go="'+id+'"'));
 assert.equal((h.match(/data-go="/g)||[]).length,4);
 assert.match(h,/data-view="media"/);
 for(const id of ['discoverMusic','discoverCinema','discoverPhotos','homeMusic'])assert.match(h,new RegExp('id="'+id+'"'));
});
test('working existing conversation route and native integration remain',()=>{
 assert.match(j,/vce_resolve/);assert.match(j,/native\('listen'/);assert.match(j,/native\('speak'/);assert.match(j,/setupDaybookUI/);
});
test('mature companion entry and six approved theme variants',()=>{
 for(const id of ['surpriseMe','homeGreeting','discoveryHint','skipOnboarding'])assert.match(h,new RegExp('id="'+id+'"'));
 for(const id of ['solidEmeraldBlue','solidDarkGreenGold','solidGoldenIvory','solidOceanBlue','solidSparklingBlue','solidCharcoalGold'])assert.ok(j.includes(id));
 assert.match(c,/prefers-reduced-motion/);
});
