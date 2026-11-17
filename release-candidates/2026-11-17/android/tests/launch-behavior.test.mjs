import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(process.env.BESTBUDDY_TEST_REQUIRE_FROM||import.meta.url);
const {JSDOM}=require('jsdom');
const project=path.dirname(path.dirname(fileURLToPath(import.meta.url))),here=path.join(project,'evidence'),ui=path.join(project,'ui');
const catalog=JSON.parse(fs.readFileSync(path.join(project,'android-plugins/vce-platform/models.json'),'utf8'));
const originalChart=JSON.stringify({chart:{result:[],error:null}});
const registration=fs.readFileSync(path.join(project,'src-tauri/src/lib.rs'),'utf8').split('generate_handler![')[1].split(']')[0];
const registered=new Set(registration.match(/vce_[a-z_]+/g));
const nativeSource=fs.readFileSync(path.join(project,'src-tauri/src/native.rs'),'utf8');
const nativeAllowed=new Set([...nativeSource.split('const ALLOWED:')[1].split('];')[0].matchAll(/"([A-Za-z]+)"/g)].map(row=>row[1]));
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name)}
async function fixture({onboarded=true,quiet=false,remember=true}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(ui,'index.html'),'utf8'),{url:'http://buddy.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,events=[];w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.play=async function(){};w.setInterval=()=>1;const timers=[];w.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length};w.clearTimeout=()=>{};
 w.indexedDB={open(){const request={result:{transaction(){const tx={objectStore(){return {getAll(){const request={result:[]};queueMicrotask(()=>request.onsuccess?.());return request;}}}};queueMicrotask(()=>queueMicrotask(()=>tx.oncomplete?.()));return tx}}};queueMicrotask(()=>request.onsuccess?.());return request;}};
 const state={place:{city:'Ahmedabad',lat:23,lon:72,symbols:'^NSEI'},region:'IN',refresh:15,profile:{name:'Test friend'},info:{interests:['space'],likes:['music'],dislikes:['noise'],dates:['Birthday: 12 March'],contacts:[],portfolio:[],watchlist:[],safety:[]},models:catalog.map(m=>({...m,installed:false,licenseAccepted:false,partialBytes:0})),safety:{active:false,state:'off'},selected:catalog[0].id,cache:{},saved:[{id:'content:test-1',title:'Cached astronomy fact',topic:'Fact / space',bytes:100,source:'Test source',time:1},{id:'news:test:2',title:'Cached local article',topic:'News / Local',bytes:200,source:'Test source',time:2}],deleted:[]};
 w.localStorage.setItem('prefs',JSON.stringify({name:state.profile.name,onboarded,quietMode:quiet,seniorAssistant:true,lang:'English',tone:'calm',feats:['News','Weather','Markets','Schedule'],plugins:{}}));
 async function rpc(command,args={}){if(!registered.has(command))throw Error('Unregistered native command: '+command);events.push({command,args});if(command==='vce_events'||command==='vce_set_user'||command==='vce_set_chatty')return;
 if(command==='vce_platform'){const c=args.command,a=args.args||{};if(!nativeAllowed.has(c))throw Error('Blocked native operation: '+c);events.push({native:c,args:a});if(c==='prepareBundled')return {resourcesReady:true};if(c==='models')return {models:state.models,selected:state.selected,backend:'CPU',state:'unloaded',sdk:35,ramBytes:6e9,freeBytes:20e9,soc:'Test SoC',npuReason:'No matching artifact',pending:state.selected,autoResume:false,downloading:false};
 if(c==='status')return{ttsReady:true,onDeviceRecognition:true,voices:[{id:'voice-en',language:'en-IN',quality:400}]};if(c==='connections')return{apps:[{id:'whatsapp',name:'WhatsApp',countries:['IN'],installed:true},{id:'instagram',name:'Instagram',countries:[],installed:false}]};
 if(c==='safetyStatus')return state.safety;if(c==='safetyStart'){state.safety={active:true,state:'monitoring',scheduled:a.scheduled,acoustic:a.acoustic,contactNumber:a.contactNumber};return{starting:true}}if(c==='safetyStop'){state.safety={active:false,state:'off'};return}if(c==='safetyAcknowledge'){state.safety.state='monitoring';return}if(c==='safetyCheckNow'){state.safety.state='check-in';state.safety.remainingSeconds=60;return}if(c==='checkModelAccess')return{granted:true};if(c==='scanDownloadsModels')return{files:[{uri:'content://downloads/1',name:'Qwen.litertlm',bytes:614000000,compatible:true}],message:'Downloads/models scanned'};if(c==='exportModel')return{folder:'Downloads/models'};if(c==='pickContact')return{name:'Test Family',number:'+919000000001'};if(c==='callContact')return{action:'confirmation requested'};if(c==='scanModels')return{files:[{uri:'content://test/local',name:'model.litertlm',bytes:300,compatible:true},{uri:'content://test/gguf',name:'model.gguf',bytes:300,compatible:false}]};
 if(c==='importModel'||c==='chooseModelFile'){const model={id:'local/test',name:'My model.litertlm',filename:'My model.litertlm',bytes:300,source:'user-import',sha256:'test',remoteTop:false,installed:true};if(!state.models.some(m=>m.id===model.id))state.models.push(model);state.selected=model.id;return{id:model.id,installed:true}}
 if(c==='selectModel'){state.selected=a.id;return}if(c==='housekeeping')return{pssBeforeKb:200000,pssAfterKb:150000,cacheBytesRemoved:a.clearCache?1048576:0};if(c==='generate')return{text:state.generatedText||'Would you enjoy exploring this topic through music?',backend:'CPU',firstTokenMs:1};if(c==='listen')return{text:'hello'};return;}
 if(command==='vce_region'){if(args.country)state.region=args.country;return state.region}if(command==='vce_refresh_settings'){if(args.minutes)state.refresh=args.minutes;return state.refresh}if(command==='vce_update_name'){state.profile.name=args.name;return}if(command==='vce_user_info')return state.info;if(command==='vce_save_user_info'){state.info=args.value;return}if(command==='vce_helpline')return 'Trusted support';
 if(command==='vce_consents')return[{purpose:'prefetch',granted:true},{purpose:'local_memory',granted:remember},{purpose:'learn_interests',granted:remember}];if(command==='vce_research_context')return[];if(command==='vce_ingest_research')return args.rows.length;if(command==='vce_sources')return[];if(command==='vce_fetch_plan')return[];if(command==='vce_place')return state.place;if(command==='vce_set_place'){state.place=args;return;}
 if(command==='vce_brief')return{source:'live',weather:state.place.city+': clear.',schedule:'No appointments',news:'• Test article',markets:'No old market cache'};
 if(command==='vce_panels')return{news:[{title:'Ahmedabad science centre opens exhibition',summary:'A science exhibition offers hands-on demonstrations and practical learning for local students.',source:'Test news',sourceName:'India News',topic:'country:IN',link:'https://example.com/local',published:'Wed, 28 Oct 2026 08:00:00 GMT'},{title:'International satellite mission begins',summary:'A new satellite mission will study weather patterns and improve environmental observations.',source:'Test news',topic:'news',link:'https://example.com/world',published:'Wed, 28 Oct 2026 09:00:00 GMT'}],quotes:[],weather:{city:'Ahmedabad',current:{temperature_2m:30,weather_code:0},daily:{time:['2026-10-28'],temperature_2m_max:[31],temperature_2m_min:[20],weather_code:[0]},fetched:1793180000},sources:[]};
 if(command==='vce_market_cache'){if(args.value)state.cache=args.value;return state.cache}if(command==='vce_http_get'){
 if(args.url.includes('geocoding-api'))return JSON.stringify({results:[{name:'Boston',country_code:'US',latitude:42.36,longitude:-71.06,admin1:'Massachusetts'}]});
 if(args.url.includes('news.google.com')){
  const domain=new URL(args.url).searchParams.get('q').match(/site:([a-z0-9.-]+)/)?.[1]||'npr.org';
  return '<rss><channel><item><title>Current report from '+domain+'</title><link>https://'+domain+'/article</link><description>A current verified article about the selected place and its community.</description><pubDate>'+new Date().toUTCString()+'</pubDate><source url="https://'+domain+'">'+domain+'</source></item></channel></rss>';
 }
 if(args.url.includes('wikipedia.org'))return JSON.stringify({query:{pages:{1:{title:'Gardening',extract:'Gardening is the practice of growing and cultivating plants.',fullurl:'https://en.wikipedia.org/wiki/Gardening'}}}});
if(args.url.includes('finance/chart')){if(decodeURIComponent(args.url).includes('^NSEI'))return originalChart;const symbol=decodeURIComponent(args.url.split('/chart/')[1].split('?')[0]);const file=path.join(here,'quote-'+symbol.replaceAll('.','-')+'.json');if(fs.existsSync(file))return fs.readFileSync(file,'utf8');throw Error('Fixture has no quote; unavailable must remain visible')}if(args.url.includes('ind_nifty50list.csv'))return fs.readFileSync(path.join(here,'nifty50-response.txt'),'utf8');throw Error('Fixture endpoint unavailable')}
 if(command==='vce_stored_items')return{items:state.saved,bundledItems:50,localFactsServed:3,worldFactsServed:7};if(command==='vce_delete_stored'){state.deleted.push(...args.ids);state.saved=state.saved.filter(i=>!args.ids.includes(i.id));return args.ids.length}
 if(command==='vce_tick'){const alarms=state.alarms||[];state.alarms=[];return alarms;}if(command==='vce_silence')return null;if(command==='vce_resolve')return /kill myself/.test(args.text)?{tier:'safety',reply:'Let us focus on your immediate safety.'}:{tier:'llm',needs_model:true,reply:''};return null;
 }
 w.__TAURI__={core:{invoke:rpc,Channel:class{onmessage(){}}}};w.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(ui,url.replace(/^\.\//,'')),'utf8'))});
 const context=dom.getInternalVMContext(),modules=new Map();async function get(file){if(modules.has(file))return modules.get(file);let code=fs.readFileSync(file,'utf8');if(file.endsWith('/app.js')||file.endsWith('\\app.js'))code+='\nexport const testApi={ask,quiet,loadModels,loadSettings,renderExplore,launchModelDownload,intelligentChatter,runCompanionChatter,startDailyBriefing,launchCompanionship,learnFromConversation,companionSession,listen,alarms,refreshLocationNews,scanLocalModels,useModelChoice,showContacts,refreshSafety,openSettingsPanel,explore,getState:()=>({epoch,busy,prefs,region}),setLastInteraction:value=>last=value,setVoiceActive:()=>voiceActivated=true};';const m=new vm.SourceTextModule(code,{context,identifier:file});modules.set(file,m);await m.link(spec=>get(path.resolve(path.dirname(file),spec)));return m}
 const app=await get(path.join(ui,'src/app.js'));await app.evaluate();for(let i=0;i<120;i++)await new Promise(r=>setImmediate(r));return{dom,w,state,events,timers,api:app.namespace.testApi,close:async()=>{await app.namespace.testApi.quiet();Object.defineProperty(w.document,'hidden',{configurable:true,value:true});for(let i=0;i<40;i++)await new Promise(resolve=>setImmediate(resolve));dom.window.close()}};
}
await test('launch greets aloud, offers briefing, disables inherited forced Senior mode and puts briefing on first page',async()=>{
 const t=await fixture();const doc=t.w.document;
 assert(t.events.some(row=>row.native==='speak'&&row.args.text.includes('daily briefing')));
 assert.equal(t.api.getState().prefs.seniorAssistant,false);assert.equal(doc.querySelector('#seniorHub').hidden,true);
 assert.equal(doc.querySelector('#startBriefing').closest('[hidden]'),null);
 const replyTimer=t.timers.find(timer=>timer.ms===400);assert(replyTimer);replyTimer.fn();
 for(let i=0;i<50;i++)await new Promise(resolve=>setImmediate(resolve));
 assert(t.events.some(row=>row.native==='listen'),'launch did not activate the voice reply path');
 assert.equal(doc.querySelector('#chat').closest('[hidden]'),null);
 assert.equal(doc.querySelector('#voiceNotice').closest('[hidden]'),null);
 await t.api.ask('hello');assert.equal(doc.querySelector('#startBriefing').closest('[hidden]'),null);
 assert(t.timers.some(timer=>timer.ms===400),'automatic voice reply was not armed');
 assert(!doc.querySelector('#onb').textContent.includes('Senior Assistant'));await t.close();
});
await test('first run greets and arms the permission-checked voice path without granting memory consent',async()=>{
 const t=await fixture({onboarded:false});
 assert(t.events.some(row=>row.native==='speak'&&row.args.text.includes("I'm Buddy")));
 assert(t.timers.some(timer=>timer.ms===400));assert(!t.events.some(row=>row.command==='vce_set_consent'));assert(!t.w.document.querySelector('#onb').hidden);await t.close();
});
await test('saved Quiet preference suppresses launch speech and automatic listening',async()=>{
 const t=await fixture({quiet:true});
 assert(!t.events.some(row=>row.native==='speak'||row.native==='listen'));await t.close();
});
await test('actual Save city handler persists Boston/US and replaces Indian publisher list',async()=>{
 const t=await fixture();const doc=t.w.document;
 doc.querySelector('#city').value='Boston, MA, USA';
 await doc.querySelector('#savePlace').onclick();
 for(let i=0;i<80;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(t.state.region,'US');assert.equal(t.state.place.city,'Boston');
 assert.equal(t.api.getState().prefs.newsRegion,'New England');
 assert(doc.querySelector('#srcList').textContent.includes('WBUR'));
 assert(!doc.querySelector('#srcList').textContent.includes('The Hindu'));
 assert(!t.events.some(row=>row.command==='vce_set_region'));
 const before=t.events.length;await t.api.startDailyBriefing();
 const speech=t.events.slice(before).filter(row=>row.native==='speak').map(row=>row.args.text).join(' ');
 assert(speech.includes('Boston'));assert(!speech.includes('Test article'));
 assert(t.events.slice(before).filter(row=>row.native==='speak').length>=3,'briefing did not start reading');await t.close();
});
await test('conversational hobbies are saved only with both memory and learning permission',async()=>{
 let t=await fixture({remember:false});t.api.companionSession.question();
 await t.api.learnFromConversation('gardening');
 assert(!t.events.some(row=>row.command==='vce_save_user_info'));await t.close();
 t=await fixture();t.api.companionSession.question();await t.api.learnFromConversation('gardening');
 assert(t.state.info.interests.includes('gardening'));
 assert(t.events.some(row=>row.command==='vce_save_user_info'));await t.close();
});
await test('native safety routing precedes preference learning and no harmful goal is saved',async()=>{
 const t=await fixture();await t.api.ask('I want to kill myself');
 assert(!t.events.some(row=>row.command==='vce_save_user_info'));
 assert(t.events.some(row=>row.native==='speak'&&row.args.text.includes('immediate safety')));await t.close();
});
await test('due reminders read aloud once and remain quiet when muted',async()=>{
 const t=await fixture();t.state.alarms=[{text:'Practise guitar',late_secs:0}];
 await t.api.alarms();assert(t.events.some(row=>row.native==='speak'&&row.args.text==='Reminder: Practise guitar'));
 const before=t.events.length;await t.api.alarms();assert(!t.events.slice(before).some(row=>row.native==='speak'));await t.close();
 const q=await fixture({quiet:true});q.state.alarms=[{text:'Practise guitar',late_secs:0}];await q.api.alarms();
 assert(!q.events.some(row=>row.native==='speak'));assert(q.w.document.querySelector('#alarm').textContent.includes('guitar'));await q.close();
});
await test('proactive Android chatter asks a relevant question after a minute and yields to Quiet and safety',async()=>{
 const t=await fixture();await t.api.quiet();
 let clock=Date.now()+61000;t.w.Date.now=()=>clock;t.api.setLastInteraction(clock-61000);
 const before=t.events.length;await t.api.runCompanionChatter();
 const speech=t.events.slice(before).filter(row=>row.native==='speak');
 assert.equal(speech.length,1);assert(speech[0].args.text.includes('space'));assert(speech[0].args.text.endsWith('?'));
 assert(t.timers.some(timer=>timer.ms===400));
 clock+=61000;t.api.setLastInteraction(clock-61000);t.api.getState().prefs.quietMode=true;
 const quietBefore=t.events.length;await t.api.runCompanionChatter();assert.equal(t.events.length,quietBefore);
 t.api.getState().prefs.quietMode=false;t.state.safety={active:true,state:'check-in'};
 await t.api.refreshSafety();const safetyBefore=t.events.length;await t.api.runCompanionChatter();assert.equal(t.events.length,safetyBefore);
 await t.close();
});
await test('a sourced discovery gains one witty model question, with valid preference context',async()=>{
 const t=await fixture();await t.api.quiet();
 t.state.models.find(model=>model.id===t.state.selected).installed=true;
 t.state.generatedText='If this discovery had a theme tune, what would you choose?';
 const before=t.events.length;await t.api.intelligentChatter('A fresh discovery from our source.',t.api.getState().epoch);
 const generated=t.events.slice(before).find(row=>row.native==='generate');assert(generated);
 assert(generated.args.text.includes('follow-up question'));assert(generated.args.text.includes('humorous'));
 const context=JSON.parse(generated.args.context);assert(context.dislikes.includes('noise'));assert(context.conversationStyle.includes('witty'));
 const speech=t.events.slice(before).find(row=>row.native==='speak');assert(speech.args.text.endsWith(t.state.generatedText));
 assert.equal(t.api.companionSession.available('A fresh discovery from our source.'),false);
 assert.equal(t.api.companionSession.available(t.state.generatedText),false);
 const next=t.events.length;await t.api.intelligentChatter('A different source discovery.',t.api.getState().epoch);
 const nextSpeech=t.events.slice(next).find(row=>row.native==='speak');
 assert.equal(nextSpeech.args.text,'A different source discovery.','an identical generated question was repeated');
 await t.close();
});
await test('an open conversational answer reaches the installed model with the newly learned topic',async()=>{
 const t=await fixture();await t.api.quiet();t.api.companionSession.question();
 t.state.models.find(model=>model.id===t.state.selected).installed=true;
 const before=t.events.length;await t.api.ask('gardening');
 const generated=t.events.slice(before).find(row=>row.native==='generate'&&row.args.text==='gardening');assert(generated);
 assert(JSON.parse(generated.args.context).interests.includes('gardening'));
 await t.close();
});
await test('launch plays the welcome cue before speech and prepares the included companion',async()=>{
 const t=await fixture();
 const welcome=t.events.findIndex(row=>row.native==='welcome');const spoken=t.events.findIndex(row=>row.native==='speak');
 assert(welcome>=0&&spoken>welcome);assert(t.events.some(row=>row.native==='prepareBundled'));
 assert(t.w.document.querySelector('#models').closest('details'));assert.equal(t.w.document.querySelector('#models').closest('details').open,false);
 assert(t.w.document.querySelector('#defaultSetupStatus').textContent.includes('No model selection'));
 await t.close();
});
await test('dialogue context follows the real memory permission, with no inaccessible preference gate',async()=>{
 const t=await fixture();await t.api.quiet();const before=t.events.length;await t.api.ask('I enjoy gardening');
 assert(t.events.slice(before).some(row=>row.native==='remember'&&row.args.user==='I enjoy gardening'));await t.close();
 const no=await fixture({remember:false});await no.api.quiet();const start=no.events.length;await no.api.ask('I enjoy gardening');
 assert(!no.events.slice(start).some(row=>row.native==='remember'));await no.close();
});
console.log(count+' full-app DOM/bridge regressions passed');
process.exit(0);
