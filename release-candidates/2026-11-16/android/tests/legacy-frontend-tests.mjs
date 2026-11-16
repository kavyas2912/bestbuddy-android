// Deterministic contract tests of the production ask() orchestration. No phone or model claim.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../ui/src/app.js',import.meta.url),'utf8');
const askSource=source.slice(source.indexOf('async function conversationContext('),source.indexOf('function go('));
function setup(resolve,generate=async()=>({text:'A contextual answer',backend:'CPU',firstTokenMs:10})){
 const events=[];const nodes=new Map();const c=vm.createContext({safetyState:{active:false,state:'off'},performance,document:{hidden:false},setTimeout:()=>{},nodes,events,
  $:s=>{if(!nodes.has(s))nodes.set(s,{textContent:''});return nodes.get(s)},
  enabled:()=>true,spokenOnly:t=>/joke|fun fact|chatter/i.test(t),
  call:async(cmd,args)=>{events.push([cmd,args]);return resolve(cmd,args)},
  native:async(cmd,args)=>{events.push([cmd,args]);return cmd==='generate'?generate(args):null},
  say:(...args)=>events.push(['say',...args]),notice:e=>events.push(['notice',String(e)]),orb:()=>{},go:()=>{},setChat:()=>{},renderExplore:()=>{},refreshPanels:async()=>{},
 });
 vm.runInContext(`let epoch=0,busy=false,chatMode=false,voiceActivated=false,last=0,region='IN';const prefs={name:'friend',lang:'English',tone:'calm'},info={interests:[]},brief={weather:'Weather',schedule:'Schedule',news:'News',markets:'Markets'};async function quiet(){epoch++;busy=false;events.push(['stop'])}async function speak(text,ticket=epoch){if(ticket===epoch)events.push(['speak',text])};${askSource}`,c);
 return {c,events,run:(text,opts={})=>vm.runInContext(`ask(${JSON.stringify(text)},${JSON.stringify(opts)})`,c)};
}
let passed=0;async function test(name,fn){await fn();console.log('PASS '+name);passed++}
await test('jokes are spoken with no user or assistant chat bubbles',async()=>{const t=setup(()=>({tier:'skill',reply:'A joke'}));await t.run('Tell me a joke');assert.equal(t.events.filter(e=>e[0]==='say').length,0);assert.equal(t.events.find(e=>e[0]==='speak')[1],'A joke')});
await test('ordinary typed chat invokes local model and records context',async()=>{const t=setup(()=>({tier:'llm',needs_model:true}));await t.run('Help me plan a small garden');assert.equal(t.events.filter(e=>e[0]==='say').length,2);assert(t.events.some(e=>e[0]==='generate'));assert(t.events.some(e=>e[0]==='remember'&&e[1].reply==='A contextual answer'))});
await test('casual voice turns are spoken without adding text',async()=>{const t=setup(()=>({tier:'phrasebook',reply:'Hello friend'}));await t.run('hello',{voice:true});assert(!t.events.some(e=>e[0]==='say'));assert(t.events.some(e=>e[0]==='speak'))});
await test('safety output remains visible during voice engagement',async()=>{const t=setup(()=>({tier:'safety',reply:'Safety guidance'}));await t.run('I need help',{voice:true});assert(t.events.some(e=>e[0]==='say'&&e[2]==='Safety guidance'))});
await test('Explore results stay out of the Home chat canvas',async()=>{const t=setup(()=>({tier:'skill',reply:'Weather result'}));await t.run('weather',{explore:true});assert(!t.events.some(e=>e[0]==='say'));assert.equal(t.c.nodes.get('#exploreResult').textContent,'Weather result')});
await test('Quiet discards a late core answer',async()=>{let finish;const t=setup(()=>new Promise(r=>finish=r));const pending=t.run('hello');await vm.runInContext('quiet()',t.c);finish({tier:'phrasebook',reply:'Late answer'});await pending;assert(!t.events.some(e=>e[0]==='speak'||e[0]==='remember'));assert(!t.events.some(e=>e[0]==='say'&&e[1]==='b'))});
await test('Quiet discards a late model answer',async()=>{let finish;const t=setup(()=>({tier:'llm',needs_model:true}),()=>new Promise(r=>finish=r));const pending=t.run('plan a trip');await new Promise(r=>setImmediate(r));await vm.runInContext('quiet()',t.c);finish({text:'Late model answer'});await pending;assert(!t.events.some(e=>e[0]==='speak'||e[0]==='remember'));assert(!t.events.some(e=>e[0]==='say'&&e[1]==='b'))});
await test('model failure releases the busy state',async()=>{const t=setup(()=>({needs_model:true}),async()=>{throw Error('Model unavailable')});await t.run('something');assert.equal(vm.runInContext('busy',t.c),false);assert(t.events.some(e=>e[0]==='notice'))});
await test('disabled plugin prevents resolution and output',async()=>{const t=setup(()=>({reply:'bad'}));t.c.enabled=()=>false;await t.run('weather');assert(!t.events.some(e=>e[0]==='vce_resolve'||e[0]==='say'||e[0]==='speak'));assert(t.events.some(e=>e[0]==='notice'))});
console.log(`${passed} frontend contract tests passed`);
