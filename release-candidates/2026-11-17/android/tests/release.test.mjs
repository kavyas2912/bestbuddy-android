import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {NEWS_TABS,selectedNews,newsTab,readingText,newsTopic} from '../ui/src/news-ui.js';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=p=>readFileSync(join(root,p),'utf8');
const ui=read('ui/src/app.js');
const html=read('ui/index.html');
const cfg=JSON.parse(read('src-tauri/tauri.conf.json'));
const content=JSON.parse(read('vce-core/seed/content.json'));
const sources=JSON.parse(read('vce-core/seed/sources.json'));
test('retains the 0.7.4-derived baseline and ships unique current target identity',()=>{
 assert.equal(cfg.identifier,'app.vce.buddy');assert.equal(cfg.version,'1.11.9');
 assert.match(read('src-tauri/Cargo.toml'), /version = "1\.11\.9"/);
 assert.match(html,/BestBuddy Android V1\.11\.9/);
 assert.match(html,/src\/app\.js\?v=1\.11\.9/);
 assert.ok(cfg.bundle.targets==="all"||Array.isArray(cfg.bundle.targets));
});
test('every requested offline content type has at least 50 entries; unique ids; original seeding retained',()=>{
 const exact=(family,topic)=>content.filter(x=>x.family===family&&(!topic||x.topic===topic));
 for(const [family,topic] of [['joke',null],['story',null],['anecdote',null],['fact','general'],['fact','science'],['fact','technology'],['fact','history']]){
  assert(exact(family,topic).length>=50,`${family}:${topic} insufficient`);
 }
 assert.equal(new Set(content.map(x=>x.id)).size,content.length);
 assert(content.some(x=>x.id==='j1')&&content.some(x=>x.id==='s1'));
});
test('news category tabs classify locally, nationally, globally, and miscellaneous',()=>{
 assert.deepEqual(NEWS_TABS,['World','National','Regional','Local','Misc']);
 assert.equal(newsTab({title:'Ahmedabad exhibition',summary:'City news'},'IN','Ahmedabad'),'Local');
 assert.equal(newsTab({title:'Parliament debates',topic:'country:IN'},'IN','Ahmedabad'),'National');
 assert.equal(newsTab({title:'Space telescope',topic:'science'},'IN','Ahmedabad'),'Misc');
 assert.equal(newsTab({title:'Overseas event',topic:'news'},'IN','Ahmedabad'),'World');
});
test('topic filtering includes Sports even when story also marked breaking',()=>{
 const rows=[{title:'Cricket final',topic:'sports',summary:'A final',breaking:true},{title:'Government budget',topic:'country:IN',summary:'Budget information'}];
 assert.equal(newsTopic(rows[0]),'Sports');
 assert.equal(selectedNews(rows,{tab:'Misc',topic:'Sports'}).length,1);
 assert.equal(selectedNews(rows,{tab:'Misc',topic:'Breaking'}).length,1);
});
test('readout strictly limits to top five articles and remains empty for missing data',()=>{
 const rows=Array.from({length:9},(_,i)=>({title:`News ${i}`,summary:`Summary ${i}`}));
 assert.equal(readingText(rows).split('\n\n').length,5);
 assert.equal(readingText([]),'');
});
test('quiet mode persists and speech is gated; speech cannot be silently triggered by entering News, Markets or Daybook',()=>{
 assert.match(ui,/quietMode:false/);assert.match(ui,/prefs\.quietMode\|\|!String\(text/);
 assert.match(ui,/await quiet\(\);/);assert.match(ui,/if\(key==='Brief'\)\{await speak/);
 const method=ui.slice(ui.indexOf('async function explore(key){'),ui.indexOf('let movedMedia='));
 assert(!/await speak\(text\|\|/.test(method));
 assert.match(ui,/!prefs\.autoChatter/);
});
test('media playback nodes stay in the Media tab, not Explore',()=>{
 assert.match(html,/data-view="media"/);assert.match(html,/id="musicWidget"/);assert.match(html,/id="videoWidget"/);
 const cmds=ui.slice(ui.indexOf('const COMMANDS='),ui.indexOf('function renderCommands()'));
 assert(!cmds.includes("['Music'"));assert(!cmds.includes("['Video'"));
});
test('Panchang references and read-only daybook path exist',()=>{
 assert.match(ui,/renderDaybook/);assert.match(ui,/vce_daybook/);assert.match(read('src-tauri/src/lib.rs'),/fn vce_daybook/);
 assert.match(ui,/drikpanchang\.com/);assert.match(ui,/No saved reminders for this date/);
});
test('market stories use existing sourced news, display under indices, and speak only on button action',()=>{
 const market=read('ui/src/market-ui.js');
 assert.match(market, /Trending market stories/);assert.match(market,/id="readMarketStories"/);assert.match(market,/onSpeak\(stories\.map/);
});
test('JokeAPI upgrade retains on/off state and does not restrict to single type',()=>{
 const j=sources.find(x=>x.id==='jokeapi');assert(j);assert(!j.url.includes('type=single'));
 assert(j.per_fetch>=10);
 const src=read('vce-core/src/sources.rs');assert.match(src,/source\.id == "jokeapi"\s*&& !source\.user_added/);
});
test('mature jokes are separate and require affirmative opt-in',()=>{
 assert.match(ui,/if\(!prefs\.enableMatureJokes\)/);
 assert.match(ui,/window\.confirm\(/);
 assert.match(html,/id="disableMature"/);
});

import {parseICS,normalizePanchang,eventsInRange} from '../ui/src/live-daybook.js';
test('new live Day Book preserves event parsing, annual dates, and provider verification',()=>{
 const ev=parseICS('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261102\nSUMMARY:Anniversary\nRRULE:FREQ=YEARLY\nEND:VEVENT\nEND:VCALENDAR');
 assert.equal(ev.length,1);assert.equal(eventsInRange(ev,'2027-11-02','2027-11-02')[0].title,'Anniversary');
 assert.throws(()=>normalizePanchang({date:'2026-11-02'},'2026-11-02'));
 assert.match(html,/id="bookDate"/);assert.match(html,/id="homeUpcoming"/);
 assert.match(read('src-tauri/src/lib.rs'),/vce_scan_local_resources/);
});

test('unavailable local model preserves the offline reply path', () => {
  assert.match(ui, /if\s*\(result\)\s*\{[^{}]*r=\{tier:'llm',reply:result\.text\}[^]*?\$\('#voiceNotice'\)\.textContent=`Local \$\{result\.backend\}/);
});

test('typed and spoken requests share canonical navigation actions', () => {
  assert.match(ui, /const navigation = resolveNavigationCommand\(text\)/);
  assert.match(ui, /go\(navigation\)/);
});
import {resolveNavigationCommand} from '../ui/src/navigation-commands.js';
test('canonical navigation accepts polite commands and preserves questions', () => {
  assert.equal(resolveNavigationCommand('Please open My Day.'), 'daybook');
  assert.equal(resolveNavigationCommand('Go to the Media'), 'media');
  assert.equal(resolveNavigationCommand('What is my day like?'), undefined);
  assert.equal(resolveNavigationCommand('show me news about media'), undefined);
});

import {seniorReply,SENIOR_TOPICS} from '../ui/src/senior-assistant.js';
test('senior knowledge handles its topics without intercepting urgent requests', () => {
  assert.ok(seniorReply('Help me with a sleep routine.').source.includes('NIH'));
  assert.equal(seniorReply('I have chest pain and need help'), null);
  assert.equal(seniorReply('Call my daughter'), null);
  assert.equal(seniorReply('What dose of medicine should I take?'), null);
  for (const topic of SENIOR_TOPICS) {
    assert.ok(topic.url.startsWith('https://'));
    assert.ok(seniorReply(topic.prompt).reply.length > 0);
  }
});

test('installer, launcher and release notes agree with the current app identity', () => {
  const strings = read('src-tauri/gen/android/app/src/main/res/values/strings.xml');
  for (const name of ['app_name', 'main_activity_title']) {
    assert.ok(strings.includes('<string name="' + name + '">' + cfg.productName + '</string>'));
  }
  assert.ok(cfg.productName.endsWith('V' + cfg.version));
  assert.equal(cfg.app.windows[0].title, cfg.productName);
  assert.ok(read('VERSION.md').includes('versionName ' + cfg.version));
  assert.ok(read('VERSION.md').includes('versionCode ' + cfg.bundle.android.versionCode));
  assert.ok(html.includes('BestBuddy Android V' + cfg.version));
});

test('location-selected headlines stay in their requested region', () => {
  assert.equal(newsTab({scope:'Local',scopeCountry:'IN',scopeCity:'Ahmedabad',title:'City update'},'IN','ahmedabad'),'Local');
  assert.equal(newsTab({scope:'World',scopeCountry:'IN',title:'International update'},'IN','ahmedabad'),'World');
});
