import {saveSelectedPlace} from './selected-place.js';
import {migrateCompanionPrefs,createCompanionSession,QUESTION_BANK} from './companion-session.js';
import {createRegionalHeadlines,locationInput,sourcePlan} from './regional-headlines.js';
import {setupDiscoverTabs} from './discover-tabs.js';
import {setupSeniorAssistant,seniorReply} from './senior-assistant.js';
import {setupSafetyPages} from './safety-pages.js';
import {setupSwipePages,revealPane} from './swipe-pages.js';
import {resolveNavigationCommand} from './navigation-commands.js';
import {setupDiscoveryCinema} from './discovery-cinema.js';
import {createOfflineCompanion} from './offline-companion.js';
import {setupDaybookUI} from './daybook-ui.js';
import {setupSettingsNavigation} from './settings-navigation.js';
import {discoverSources} from './source-discovery.js';
import { SEED } from './seed.js';
import {createMarketUI} from './market-ui.js';
import {NEWS_TABS,NEWS_TOPICS,selectedNews,readingText,newsTopic} from './news-ui.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const T=window.__TAURI__, tz=()=>-new Date().getTimezoneOffset()*60;
const openSafetyPage=setupSafetyPages();
const openSettingsPanel=setupSettingsNavigation();
let prefs;try{prefs=JSON.parse(localStorage.getItem('prefs')||'null')}catch{}
prefs={seniorAssistant:false,name:'friend',lang:'English',tone:'calm',theme:'solidEmeraldBlue',feats:['Weather','News','Markets','Schedule'],accent:'#d9b76b',plugins:{},chatty:'quiet',quietMode:false,enableMatureJokes:false,autoChatter:true,newsTab:'National',newsTopic:'All',...prefs};
const save=()=>localStorage.setItem('prefs',JSON.stringify(prefs));
migrateCompanionPrefs(prefs);
const companionSession=createCompanionSession({prefs,save});
save();
let briefingOffered=false, launchedGreeting=false;
const regionalHeadlines=createRegionalHeadlines(url=>httpGet(url));
const companion=createOfflineCompanion({name:prefs.name});
// Personal preferences are local and never synchronized without separate consent.

const LANG={English:'en-US',Hindi:'hi-IN',Gujarati:'gu-IN',Spanish:'es-ES',French:'fr-FR',German:'de-DE'};
const call=(c,a)=>T?T.core.invoke(c,a):Promise.reject('Layout preview only. Native features work in the Android APK.');
const preview = document.querySelector('#profilePreview');
const profilePlan = preview.querySelector('#profilePlan');
const resourceNames = {
  core_starter: 'Core Starter',
  smart_conversation: 'Smart Conversation',
  advanced_intelligence: 'Advanced Intelligence',
  senior_assistance: 'Senior Assistance',
};
let previewRequest = 0;
async function refreshProfilePreview() {
  const request = ++previewRequest;
  profilePlan.textContent = 'Reading resource requirements...';
  try {
    const plan = await call('vce_profile_plan', {
      profile: {
        intelligence: preview.querySelector('#intelligencePreview').value,
        senior_assistant: preview.querySelector('#seniorPreview').checked,
      },
    });
    if (request !== previewRequest) return;
    const bundled = plan.bundled.map(resource => resourceNames[resource]).join(', ');
    const optional = plan.optional.map(resource => resourceNames[resource]).join(', ');
    profilePlan.textContent = optional
      ? 'Bundled: ' + bundled + '. Optional: ' + optional + '.'
      : 'Bundled: ' + bundled + '. No additional resources required.';
  } catch {
    if (request === previewRequest) profilePlan.textContent = 'Resource preview is unavailable.';
  }
}
preview.addEventListener('change', refreshProfilePreview);
preview.addEventListener('toggle', () => {
  if (preview.open) refreshProfilePreview();
});

const native=(command,args={})=>call('vce_platform',{command,args});
let toastTimer;function notice(text){if(/^(?:cancelled|canceled)$/i.test(String(text?.message||text)))return;$('#toast').textContent=String(text?.message||text);$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,7000)}
const safe=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(notice);
function dialog(title,html){$('#popupTitle').textContent=title;$('#popupBody').innerHTML=html;if(!$('#popup').open)$('#popup').showModal()}
function orb(s,label){$('#orb').dataset.s=s;$('#orbLabel').textContent=label||({idle:'Tap to talk',listening:'Listening…',thinking:'Thinking…',speaking:'Speaking…',preparing:'Preparing voice…'}[s]||s);const p=$('#player');if(p)p.volume=s==='speaking'?Math.min(.12,Number($('#musicVolume')?.value||45)/100):Number($('#musicVolume')?.value||45)/100}
function say(role,text,meta=''){const d=document.createElement('div');d.className='msg '+(role==='u'?'u':'b');const a=document.createElement('div'),m=document.createElement('div');a.textContent=text;m.textContent=meta;m.className='meta';d.append(a,m);$('#chat').append(d);while($('#chat').children.length>80)$('#chat').firstElementChild.remove();if(meta!=='Buddy greeting'){revealPane(d);d.scrollIntoView({block:'nearest'})}}
let epoch=0,busy=false,chatMode=false,voiceActivated=false,last=Date.now(),view='home';
let brief={source:'seed',...SEED.brief},panels={news:[],quotes:[],weather:null,sources:[]},info={interests:[],contacts:[],dates:[],portfolio:[],watchlist:[]};
let region='IN';const marketUI=createMarketUI({$,esc,httpGet,call,native,notice,getRegion:()=>region,getInfo:()=>info,getNews:()=>dedupNews(),onSpeak:text=>speak(text),canFetch:()=>!!T&&prefetchOn,onEditList:editList,onSymbols:()=>safe(editSymbols)()});
const enabled=key=>prefs.plugins[key]!==false;
function setChat(on){chatMode=on;$('#voiceChat').setAttribute('aria-pressed',String(on));$('#voiceChat').textContent=on?'End voice chat':'Voice chat'}
async function quiet(){for(const id of ['#player','#vplayer']){const media=$(id);if(media&&!media.paused)media.pause()}epoch++;busy=false;voiceActivated=false;setChat(false);await native('stop').catch(()=>{});orb('idle');$('#voiceNotice').textContent=''}
function quietButton(){for(const q of [$('#quiet'),$('#quietHeader')]){if(!q)continue;q.textContent=prefs.quietMode?'🔇 Quiet ON':'🔊 Sound ON';q.setAttribute('aria-pressed',String(!!prefs.quietMode));q.title='Stop all BestBuddy speech. Android safety alarms remain separately controlled.';}}
async function toggleQuiet(){prefs.quietMode=!prefs.quietMode;save();if(prefs.quietMode)await quiet();quietButton();notice(prefs.quietMode?'Speech muted. Safety alerts use their separate controls.':'Speech enabled on request.');}

async function speak(text,ticket=epoch){if(ticket!==epoch||document.hidden||prefs.quietMode||!String(text||'').trim())return;orb('preparing');if(ticket!==epoch||prefs.quietMode)return;await native('speak',{text,language:prefs.lang==='English'?'en':(LANG[prefs.lang]||'en'),voiceName:prefs.voiceName||'',rate:prefs.voiceRate||0.94,pauseMs:prefs.voicePause||350});if(ticket===epoch)orb('idle')}
const spokenOnly=text=>/\b(joke|fun fact|tell me a fact|anecdote|story|science fact|technology fact|history fact|make me laugh|chatter)\b/i.test(text);
async function listen(){if(busy||document.hidden||prefs.quietMode)return;voiceActivated=true;const ticket=++epoch;busy=true;try{orb('listening');const r=await native('listen',{language:LANG[prefs.lang]||'en',allowNetwork:!!prefs.allowSpeechService});if(ticket!==epoch)return;busy=false;await ask(r.text,{voice:true});}catch(e){if(ticket===epoch){setChat(false);notice(e);orb('idle')}}finally{if(ticket===epoch)busy=false}}
async function conversationContext(){
 let learned=[];try{const facts=await call('vce_know');if(Array.isArray(facts))learned=facts.slice(0,8)}catch{/* Missing learned memory does not disable local conversation. */}
 return JSON.stringify({assistantRole:prefs.seniorAssistant?'Senior Assistant. Respect autonomy, ask one short question at a time, offer practical routines and hobby suggestions. For health questions use reliable sources and avoid diagnosis or medication changes.':'Companion',name:prefs.name,country:region,language:prefs.lang,tone:prefs.tone,interests:(info.interests||[]).slice(0,6),goals:(info.goals||[]).slice(0,4),likes:(info.likes||[]).slice(0,6),dislikes:(info.dislikes||[]).slice(0,6),learned,brief:{weather:brief.weather,schedule:brief.schedule,news:(brief.news||'').slice(0,350),markets:brief.markets}}).slice(0,1500)
}
async function ask(text,{voice=false,explore=false,silentText=false}={}){
 if(busy){await quiet()};const requested=/weather/i.test(text)?'Weather':/news/i.test(text)?'News':/markets?|stocks?/i.test(text)?'Markets':/schedule|calendar/i.test(text)?'Schedule':/joke|make me laugh/i.test(text)?'Joke':/fun fact|tell me a fact/i.test(text)?'Fun fact':null;if(requested&&!enabled(requested)){notice(requested+' is disabled in Explore');return}const ticket=++epoch;busy=true;last=Date.now();const only=spokenOnly(text)||silentText||(voice&&!requested);
 try{
  if(/^(?:please )?(?:be quiet|quiet|stop talking|stop listening|stop voice chat)[.!]?$/i.test(text.trim())){prefs.quietMode=true;save();await quiet();quietButton();return}
  if(/\b(?:daily briefing|day brief|morning briefing|read.*briefing)\b/i.test(text) || (briefingOffered&&companionSession.briefingAnswer(text))){briefingOffered=false;await startDailyBriefing();return}
  if(/^(?:not now|leave me for now|later please)[.!?]?$/i.test(text.trim())){briefingOffered=false;companionSession.snooze();setChat(false);say('b','Of course. I am here whenever you feel like chatting.','Buddy companionship');await speak('Of course. I am here whenever you feel like chatting.',ticket);return}
  if(briefingOffered&&/^(?:no|no thanks|chat|let.s chat)[.!]?$/i.test(text.trim())){
    briefingOffered=false;const question=companionSession.question()||'What would you enjoy talking about?';say('b',question,'A little chat');await speak(question,ticket);return;
  }
  briefingOffered=false;
  if(safetyState.active&&safetyState.state!=='monitoring'&&!/i(?:’m|'m| am) (?:ok|okay|fine|safe)/i.test(text)){await native('safetyAcknowledge');await refreshSafety()}
  if(!only&&!explore)say('u',text);
  const navigation = resolveNavigationCommand(text);
  if (navigation) {
    go(navigation);
    return;
  }

  if(/\b(play|put on)\b.*\b(music|songs?)\b|\bphotos?\b|\bvideos?\b/i.test(text)){go('media');$('#voiceNotice').textContent='Choose a local file or media source.';return}
  if(/^(i(?:’m|'m| am) (?:ok|okay|fine|safe)|all good|cancel safety alert)[.!]?$/i.test(text.trim())){const status=await native('safetyStatus');if(status?.active&&status.state!=='monitoring'){await native('safetyAcknowledge');await refreshSafety();if(voice)await speak('Glad you are okay.',ticket);return}}
  const callRequest=text.trim().match(/^(?:please\s+)?call\s+(.+?)[.!]?$/i);if(callRequest){await quiet();await showContacts(callRequest[1]);return}
  orb('thinking');const start=performance.now();let r;
  try{
   // Native safety and command routing always precede conversational shortcuts.
   const resolved=await call('vce_resolve',{text});
   if(ticket!==epoch)return;
   const learnedPreference=resolved.tier==='safety'?null:await learnFromConversation(text);
   const casualQuestion=resolved.tier!=='safety'&&/^(?:hello|hi|hey|hello buddy|let.s chat|ask me a question|ask me something)[.!?]?$/i.test(text.trim())?companionSession.question():null;
   const fallback=(prefs.seniorAssistant&&seniorReply(text))||companion.respond(text)||
    (learnedPreference?{reply:learnedPreference.declined?'Of course. We can just enjoy a chat.':learnedPreference.field==='goals'?'We can make that manageable. What would a small first step look like for you?':'I would enjoy exploring that with you. What do you like most about it?',tier:'companion-conversation'}:null);
   r=resolved.tier==='safety'?resolved:casualQuestion?{reply:'Lovely to chat. '+casualQuestion,tier:'companion-conversation'}:resolved.needs_model&&fallback?fallback:resolved;
  }catch(error){const fallback=companion.respond(text);if(!fallback)throw error;r={tier:'offline-essentials',reply:fallback.reply}}
  if(ticket!==epoch)return;
  if(r.lookup){try{r=await call('vce_ingest_lookup',{body:await httpGet(r.lookup.url)})}catch{r={tier:'search',reply:'I could not reach that source. Please try again later.'}}}
  if(requested==='Markets'&&r.tier!=='safety'){r.reply=marketUI.summary()}if(requested==='News'&&r.tier!=='safety'){r.reply=readingText(selectedNews(dedupNews(),{tab:prefs.newsTab,topic:prefs.newsTopic,region,city:prefs.city||$('#city')?.value||'',limit:5}))||'No news with usable content is available yet.'}if(r.needs_model){const context=await conversationContext();if(ticket!==epoch)return;let result;try{result=await native('generate',{text,context})}catch(modelError){const fallback=companion.respond(text);if(fallback){r=fallback}else{r={tier:'offline-unavailable',reply:'I cannot answer that reliably offline yet. You can try another question or enable a local model.'}}}if(result){r={tier:'llm',reply:result.text};$('#voiceNotice').textContent=`Local ${result.backend} · first token ${result.firstTokenMs??'?'} ms`;}}
  if(ticket!==epoch)return;
  if(r.brief)await refreshPanels();if(!silentText||r.tier==='safety'){if(explore){$('#exploreResult').textContent=r.reply}else say('b',r.reply,[r.tier,`${Math.round(performance.now()-start)} ms`,r.source].filter(Boolean).join(' · '))}
  if(r.brief){if(explore)renderExplore('Brief');else say('b',[brief.weather,brief.schedule,brief.news,brief.markets].join(' '),'Day briefing');}
  if((requested!=='Schedule'||r.brief)&&(voice||only||r.brief||prefs.autoChatter))await speak(r.brief?[brief.weather,brief.schedule,brief.news,brief.markets].join(' '):r.reply,ticket);if(ticket===epoch&&prefs.conversationMemoryConsent===true)await native('remember',{user:text,reply:r.reply});
 }catch(e){if(ticket===epoch){notice(e);setChat(false)}}finally{if(ticket===epoch){busy=false;orb('idle');if(chatMode&&!document.hidden)setTimeout(()=>{if(ticket===epoch&&chatMode)listen()},350)}}
}
function go(name){if(name==='explore')safe(refreshLocationNews)();if(name==='daybook')safe(()=>daybookUI.refresh(false))();if(name!=='explore')restoreMedia();view=name;$$('[data-go]').forEach(b=>{const active=b.dataset.go===name;b.classList.toggle('on',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});$$('[data-view]').forEach(v=>v.hidden=v.dataset.view!==name);$('#bar').hidden=name!=='home';if(name==='settings'){if(T)safe(loadSettings)();else renderLists()}}
$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));$('#orb').onclick=safe(async()=>{if(busy)await quiet();await listen()});$('#quiet').onclick=safe(toggleQuiet);$('#quietHeader').onclick=safe(toggleQuiet);quietButton();$('#voiceChat').onclick=safe(async()=>{if(chatMode)await quiet();else{setChat(true);await listen()}});$('#bar').onsubmit=e=>{e.preventDefault();const text=$('#txt').value.trim();if(text){$('#txt').value='';safe(()=>ask(text))()}};
// V1.10.0 companion experience: existing native voice, knowledge, media and daybook routes are reused.
const greeting=()=>{const hour=new Date().getHours();const part=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';const name=(prefs.name||'').trim();$('#homeGreeting').textContent=part+(name&&name.toLowerCase()!=='friend'?', '+name:'')+'.';};
const DISCOVERY_PROMPTS=['Tell me an interesting science fact','Tell me a short story','Share a curious historical fact','Tell me a thoughtful joke','Tell me an interesting technology fact','Ask me a thoughtful question','Tell me a nature fact'];
function discoveryJourney(){const suggestions=['Talk naturally with Buddy.','Try Surprise Me for a fresh idea.','Open My Day for your plans.','Explore Music Lounge and Discovery Cinema.'];$('#discoveryHint').textContent=suggestions[Math.floor(Date.now()/86400000)%suggestions.length]}
function wireCompanion(){greeting();discoveryJourney();$('#surpriseMe').onclick=safe(()=>ask(DISCOVERY_PROMPTS[Math.floor(Math.random()*DISCOVERY_PROMPTS.length)]));$('#homeDiscover').onclick=()=>go('explore');$('#homeMusic').onclick=()=>go('media');$('#discoverMusic').onclick=()=>{go('media');revealPane($('#musicWidget'));$('#musicWidget').scrollIntoView({block:'start'})};$('#discoverCinema').onclick=()=>{go('media');revealPane($('#videoWidget'));$('#videoWidget').scrollIntoView({block:'start'})};$('#discoverPhotos').onclick=()=>{go('media');revealPane($('#photoFiles'));$('#photoFiles').scrollIntoView({block:'start'})};$('#skipOnboarding').onclick=()=>{ // No consent is silently granted; existing onboarding remains accessible from its normal flow.
 $('#onb').hidden=true;notice('You can explore now and choose memory permissions in Settings.');
};}
// Compact Discover: retain every existing command route, but avoid a long tile grid.
$('#discoverShow').onclick=safe(()=>explore($('#discoverTopic').value));
$('#discoverSurprise').onclick=safe(()=>ask(DISCOVERY_PROMPTS[Math.floor(Math.random()*DISCOVERY_PROMPTS.length)],{explore:true}));
$('#discoverDay').onclick=()=>go('daybook');
wireCompanion();
const daybookUI=setupDaybookUI({httpGet:async url=>{if(!prefetchOn)throw Error('Enable online updates in Permissions for live Panchang and holidays');return httpGet(url)},engine:{call},getPrefs:()=>({...prefs,city:$('#city')?.value||prefs.city||'',country:region})});$('#homeDayBook').onclick=()=>go('daybook');
function dedupNews(){const seen=new Set(),words=[];return (regionalHeadlines.rows(region,prefs.city,prefs.newsRegion||'')).filter(n=>{const key=n.title.toLowerCase().replace(/[^\p{L}\p{N} ]/gu,'').split(/\s+/).filter(w=>w.length>3);const set=new Set(key);const identity=(n.scope||'')+'|'+n.link;if(seen.has(identity)||words.some(s=>{if(s.scope!==n.scope)return false;let overlap=0;for(const w of set)if(s.has(w))overlap++;return overlap/Math.max(1,Math.min(set.size,s.size))>.72}))return false;seen.add(identity);set.scope=n.scope;words.push(set);return true}).sort((a,b)=>(+b.breaking-+a.breaking)||((Date.parse(b.published)||0)-(Date.parse(a.published)||0)))}
function renderBrief(){const news=dedupNews(),breaking=news.filter(n=>n.breaking);const texts={Weather:brief.weather,Schedule:brief.schedule,News:breaking.length?breaking[0].title+` · ${news.length} stories`:`No source-marked breaking news · ${news.length} stories`,Markets:marketUI.summary()};$('#brief').innerHTML=[['Weather','⛅'],['News','📰'],['Markets','📈'],['Schedule','🗓️']].filter(([k])=>enabled(k)&&prefs.feats.includes(k)).map(([k,i])=>`<button class="glass card-g text-reset text-start" data-summary="${k}"><span class="summary-title">${i} ${k}</span><span class="status-copy">${esc(texts[k])}</span></button>`).join('');$$('[data-summary]').forEach(b=>b.onclick=safe(async()=>{go('explore');await explore(b.dataset.summary)}))}
async function refreshPanels(){if(!T){renderBrief();return}const [b,p]=await Promise.all([call('vce_brief'),call('vce_panels')]);brief=b;panels=p;marketUI.acceptQuotes(p.quotes);brief.markets=marketUI.summary();renderBrief()}
const COMMANDS=[['Brief','🌅','Give me my day brief'],['Weather','⛅',"What's the weather"],['News','📰','Read the news'],['Markets','📈','How are the markets'],['Schedule','🗓️',"What's on my schedule"],['Joke','😄','Tell me a joke'],['Fun fact','💡','Tell me a fun fact'],['Story','📚','Tell me a story'],['Anecdote','💬','Tell me an anecdote'],['Science','🔬','Tell me a science fact'],['Technology','💻','Tell me a technology fact'],['History','🏛️','Tell me a history fact'],['Safety','🛟','Safety check-ins']];
function renderCommands(){$('#cmds').innerHTML=COMMANDS.map(([key,icon])=>`<div class="glass plugin-card"><button class="plugin-action" data-command="${key}" ${enabled(key)?'':'disabled'}><span>${icon}</span><strong>${key==='Video'?'Play video':key}</strong></button><label title="Enable ${key}"><input class="form-check-input" role="switch" aria-label="Enable ${key}" data-enable="${key}" type="checkbox" ${enabled(key)?'checked':''}></label></div>`).join('');$$('[data-command]').forEach(b=>b.onclick=safe(()=>explore(b.dataset.command)));$$('[data-enable]').forEach(b=>b.onchange=safe(async()=>{prefs.plugins[b.dataset.enable]=b.checked;save();await applyPluginSources(b.dataset.enable,b.checked);renderCommands();renderBrief()}))}
async function applyPluginSources(key,on){if(key==='Safety'&&!on)await native('safetyStop');const list=await call('vce_sources');const belongs=s=>key==='News'?s.kind==='rss_news':key==='Weather'?s.kind==='weather':key==='Markets'?s.kind==='markets':key==='Joke'?s.family==='joke':key==='Fun fact'?s.family==='fact'&&!['weather','markets','rss_news'].includes(s.kind):false;for(const s of list.filter(belongs)){if(!on){if(!Object.prototype.hasOwnProperty.call(prefs.sourceRestore||{},s.id))prefs.sourceRestore={...prefs.sourceRestore,[s.id]:s.enabled};if(s.enabled)await call('vce_source_toggle',{id:s.id,enabled:false})}else{if(prefs.sourceRestore?.[s.id]!==false)await call('vce_source_toggle',{id:s.id,enabled:true});if(prefs.sourceRestore)delete prefs.sourceRestore[s.id]}}save()}
async function explore(key){
 if(!enabled(key))return;
 await quiet();
 if(key==='News'&&prefetchOn)await regionalHeadlines.refresh(region,prefs.city);
 if(key==='Safety'){await refreshSafety();$('#exploreResult').innerHTML='<h5>Safety check-ins</h5><p>'+esc(safetyState.active?safetyState.state+' · '+safetyState.reason:'Off · start a safety session in Settings')+'</p><button id="openSafetySettings" class="btn btn-primary">Safety controls</button>';$('#openSafetySettings').onclick=()=>{go('settings');openSettingsPanel('safety');$('#safetyMode').scrollIntoView({block:'start'})};return}
 if(key==='Joke'||key==='Fun fact'||key==='Story'||key==='Anecdote'||key==='Science'||key==='Technology'||key==='History'){
  const prompt={Joke:'Tell me a joke','Fun fact':'Tell me a fun fact',Story:'Tell me a story',Anecdote:'Tell me an anecdote',Science:'Tell me a science fact',Technology:'Tell me a technology fact',History:'Tell me a history fact'}[key];
  $('#exploreResult').innerHTML=`<h5>${esc(key)}</h5><p>Read or listen to a fresh offline item.</p><button id="contentNext" class="btn btn-primary">Another ${esc(key)}</button>`+(key==='Joke'?'<div class="mt-2"><button id="matureJokes" class="btn btn-outline-primary">Mature humor (18+)</button><p class="muted">Separate adult confirmation required.</p></div>':'')+'<article id="contentResult" class="article" aria-live="polite"></article>';
  const show=async()=>{const r=await call('vce_resolve',{text:prompt});$('#contentResult').textContent=r.reply;await speak(r.reply)};
  $('#contentNext').onclick=safe(show);
  if(key==='Joke')$('#matureJokes').onclick=safe(()=>showMatureJoke());
  await show();return;
 }
 await refreshPanels();renderExplore(key);
 if(key==='Brief'){await speak([brief.weather,brief.schedule,brief.news,brief.markets].join(' '));}
}

let movedMedia=null;function restoreMedia(){if(movedMedia){const {node,marker}=movedMedia;const media=node.querySelector('audio,video'),playing=media&&!media.paused;marker.replaceWith(node);movedMedia=null;if(playing)media.play().catch(()=>{})}}
function weatherIcon(code){return code===0?'☀️':code<=3?'⛅':code<=48?'🌫️':code<=67?'🌧️':code<=77?'❄️':code<=86?'🌦️':'⛈️'}
function quoteRows(symbols){const rows=symbols?symbols.map(s=>panels.quotes.find(q=>q.symbol.toLowerCase()===s.toLowerCase())||{symbol:s}):panels.quotes;return rows.map(q=>{const pct=q.open&&q.price?(q.price-q.open)/q.open*100:null;return `<div class="market-row"><strong>${esc(q.symbol?.toUpperCase())}</strong><div>${q.price??'No quote'} ${pct==null?'':`<span class="${pct>=0?'up':'down'}">${pct>=0?'+':''}${pct.toFixed(2)}%</span>`}<div class="muted">${q.price?'From open · delayed snapshot · '+esc(q.date)+' '+esc(q.time):'Not available from configured provider'}</div></div></div>`}).join('')}
function renderExplore(key){discoverTabs?.mark(key);restoreMedia();if(key==='Markets'){marketUI.render($('#exploreResult'));return}if(['Music','Video'].includes(key)){const node=key==='Music'?$('#musicWidget'):$('#videoWidget');$('#exploreResult').innerHTML='<h5>'+key+'</h5>';if(node){const marker=document.createComment('media-home');node.before(marker);movedMedia={node,marker};$('#exploreResult').append(node)}return}let html='';if(key==='News'){
 const list=dedupNews(), city=(prefs.city||$('#city')?.value||'');
 const opts={tab:prefs.newsTab,topic:prefs.newsTopic,region,city};
 const rows=selectedNews(list,opts);
 html=`<h5>News</h5>${!prefetchOn?'<p class="small">Online news is off. Enable online updates in Consent, then return here.</p>':''}<div class="news-tabs" role="tablist" aria-label="News regions">${NEWS_TABS.map(t=>`<button class="btn btn-sm ${t===opts.tab?'btn-primary':'btn-outline-primary'}" role="tab" aria-selected="${t===opts.tab}" data-news-tab="${t}">${t}</button>`).join('')}</div><div class="news-topics" aria-label="News topics">${NEWS_TOPICS.map(t=>`<button class="btn btn-sm ${t===opts.topic?'btn-primary':'btn-outline-primary'}" data-news-topic="${t}">${t}</button>`).join('')}</div><div class="media-links my-2"><button id="readFiveNews" class="btn btn-primary" ${rows.length?'':'disabled'}>▶ Read up to 5</button><button id="stopNews" class="btn btn-outline-primary">■ Stop</button></div><p class="muted">${esc(city||region)} · ${rows.length} selected / ${list.length} unique headlines · ${esc(regionalHeadlines.status)}</p>`+
 (rows.length?'<ul class="news-list">'+rows.map(n=>`<li><h6>${n.breaking?'🔴 ':''}${esc(n.title)}</h6><span class="news-label">${esc(newsTopic(n))}</span><p>${esc(n.summary)}</p><div class="muted">${esc(n.sourceName||n.source)} · ${esc(n.published||'Time unavailable')}</div><button class="btn btn-sm btn-outline-primary" data-open="${esc(n.link)}">Read article</button></li>`).join('')+'</ul>':'<p class="muted">No headlines for this selection yet. Use the refresh icon above.</p>');
 }

 else if(key==='Weather'){const w=panels.weather;html='<h5>Local weather</h5>';if(w){html+=`<h3>${weatherIcon(w.current?.weather_code??-1)} ${esc(w.city)} ${w.current?.temperature_2m??'—'}°C</h3><div class="weather-days">`+(w.daily?.time||[]).map((d,i)=>`<div class="glass weather-day"><div>${esc(d.slice(5))}</div><div>${weatherIcon(w.daily.weather_code?.[i]??-1)}</div><small>${w.daily.temperature_2m_max?.[i]??'—'}° / ${w.daily.temperature_2m_min?.[i]??'—'}°</small></div>`).join('')+`</div><p class="muted">Open-Meteo · fetched ${new Date(w.fetched*1000).toLocaleString()} · forecast</p>`}else html+=`<p>${esc(prefs.city?'Weather for '+prefs.city+' is waiting for a refresh.':'Choose your city in Settings → Personal details.')}</p>`}
 else if(key==='Markets')html='<h5>Indices &amp; symbols</h5>'+quoteRows()+`<p class="muted">Stooq snapshots; movement is from the session opening price, not previous close. Unavailable local indices are never substituted.</p><div class="media-links"><button id="portfolioBtn" class="btn btn-outline-primary">Portfolio</button><button id="watchBtn" class="btn btn-outline-primary">Watchlist</button><button id="symbolsBtn" class="btn btn-outline-primary">Symbols + / −</button></div>`;
 else if(key==='Schedule')html=daybookHTML();
 else html='<h5>Day briefing</h5>'+['weather','schedule','news','markets'].map(k=>`<article class="article"><strong>${k[0].toUpperCase()+k.slice(1)}</strong><p>${esc(brief[k])}</p></article>`).join('');
 $('#exploreResult').innerHTML=html;$$('[data-open]').forEach(b=>b.onclick=safe(()=>native('openLink',{url:b.dataset.open})));if($('#portfolioBtn')){$('#portfolioBtn').onclick=()=>marketPopup('portfolio');$('#watchBtn').onclick=()=>marketPopup('watchlist');$('#symbolsBtn').onclick=safe(editSymbols)}if($('#reminderForm'))$('#reminderForm').onsubmit=e=>{e.preventDefault();const req=$('#reminderText').value.trim();if(!req)return;safe(async()=>{const r=await call('vce_resolve',{text:req});notice(r.reply);await renderDaybook();})()};
 if($('#daybookDate')){$('#daybookDate').onchange=safe(renderDaybook);safe(renderDaybook)()}
 $$('[data-news-tab]').forEach(b=>b.onclick=()=>{prefs.newsTab=b.dataset.newsTab;prefs.newsTopic='All';save();renderExplore('News')});
 $$('[data-news-topic]').forEach(b=>b.onclick=()=>{prefs.newsTopic=b.dataset.newsTopic;save();renderExplore('News')});
 if($('#readFiveNews'))$('#readFiveNews').onclick=safe(async()=>{const rows=selectedNews(dedupNews(),{tab:prefs.newsTab,topic:prefs.newsTopic,region,city:prefs.city||$('#city')?.value||'',limit:5});await speak(readingText(rows))});
 if($('#stopNews'))$('#stopNews').onclick=safe(quiet);
}
function daybookHTML(){const d=new Date(),today=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');return `<h5>Day Book · Schedule</h5><p class="muted">Calendar dates, saved reminders and Panchang references. Display only · no automatic speech.</p><label for="daybookDate" class="small">Select date</label><input type="date" class="form-control mb-2" id="daybookDate" value="${today}"><section class="glass p-2 mb-2"><h6>Panchang · ${esc(new Date().toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'}))}</h6><p class="muted">Tithi, nakshatra and timings depend on place and date. Open a location-specific Panchang; values are not calculated offline.</p><div class="media-links"><button class="btn btn-sm btn-outline-primary" data-open="https://www.drikpanchang.com/">Drik Panchang</button><button class="btn btn-sm btn-outline-primary" data-open="https://www.prokerala.com/astrology/panchang/">Prokerala</button></div></section><div id="daybookEvents" role="status">Loading saved events…</div><h6 class="mt-3">Dates to remember</h6>${(info.dates||[]).length?(info.dates||[]).map(d=>`<p>📅 ${esc(d)}</p>`).join(''):'<p class="muted">No dates saved in User Profile.</p>'}<p class="muted">Only in-app reminders are listed. Device calendar access is not enabled in this version. Reminder notifications are handled while Buddy is running.</p><form id="reminderForm"><input id="reminderText" class="form-control" aria-label="Reminder" placeholder="remind me to call at 5 pm"><button class="btn btn-outline-primary mt-2">Add reminder</button></form>`;}
async function renderDaybook(){const target=$('#daybookEvents');if(!target)return;try{
 const rows=await call('vce_daybook');const chosen=$('#daybookDate').value;const selected=(rows||[]).filter(r=>{const d=new Date(r.due*1000),date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');return date===chosen});
 target.innerHTML=selected.length?`<h6>Scheduled events · ${selected.length}</h6>`+selected.map(r=>`<article class="article"><b>${esc(new Date(r.due*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</b> · ${esc(r.text)}</article>`).join(''):'<p class="muted">No saved reminders for this date.</p>';
 }catch(e){target.textContent='Unable to load saved reminders: '+String(e)}}
const MATURE_JOKES=[
 'I asked my date whether they liked commitment. They said they were committed to avoiding the question.',
 'Our romantic dinner was candlelit because neither of us remembered to pay the electricity bill.',
 'My flirting style is like an expired coupon: optimistic, but rarely accepted.',
 'Marriage is finding that special person to discuss the thermostat with for thirty years.',
 'I told my partner they were my better half. They asked for the other half of the closet.',
 'My dating profile said I enjoy long walks. Specifically, to the fridge after midnight.',
 'I love mature relationships: we now argue about pillow firmness instead of philosophy.',
 'Our anniversary surprise was a new vacuum cleaner. I am currently sleeping beside it.',
 'My partner said I should embrace my mistakes. So I gave them a hug.',
 'At our age, a wild night means finding the remote after ten.',
 'I asked for some space in the relationship. They sent me a telescope.',
 'My date said I was a good listener. I think that is what they said.',
 'My idea of a hot date is remembering to turn off the oven.',
 'Romance is sharing the last slice of pizza, then secretly ordering another.',
 'I promised to spice things up. My partner found paprika in the coffee.',
 'Our relationship has chemistry. Mostly we are experimenting with who does dishes.',
 'My dating advice is simple: never say you know a shortcut unless you brought snacks.',
 'My partner asked for a little mystery. I hid the television remote.',
 'We agreed to have separate hobbies. Now we both compete for the same sofa.',
 'A mature romance is whispering sweet nothings so you do not wake the cat.'
];
async function showMatureJoke(){if(!prefs.enableMatureJokes){const accepted=window.confirm('Mature humor requires you to confirm you are 18+ AND explicitly enable it. Jokes contain mild adult relationship humor. Enable this category?');if(!accepted)return;prefs.enableMatureJokes=true;save();}
 const n=Number(prefs.matureJokeIndex||0)%MATURE_JOKES.length;prefs.matureJokeIndex=(n+1)%MATURE_JOKES.length;save();const text=MATURE_JOKES[n];$('#contentResult').textContent=text;await speak(text);
}
function marketPopup(key){dialog(key==='portfolio'?'Portfolio':'Watchlist',quoteRows(info[key]||[])+`<button id="editMarketList" class="btn btn-outline-primary">Edit symbols + / −</button>`);$('#editMarketList').onclick=()=>editList(key)}
async function editSymbols(){const p=await call('vce_place');dialog('Market symbols',`<p class="small">Use Yahoo Finance symbols, such as ^NSEI, ^BSESN or RELIANCE.NS. Unsupported symbols stay unavailable.</p><input id="editSymbols" class="form-control" value="${esc(p.symbols)}"><button id="saveSymbols" class="btn btn-primary mt-2">Save</button>`);$('#saveSymbols').onclick=safe(async()=>{await call('vce_set_place',{...p,symbols:$('#editSymbols').value});$('#symbols').value=$('#editSymbols').value;$('#popup').close();await runFetch(true);renderExplore('Markets')})}
const LISTS={interests:'Interests',goals:'Goals & priorities',likes:'Likes',dislikes:'Dislikes',contacts:'Contacts',dates:'Dates to remember',portfolio:'Portfolio symbols',watchlist:'Watchlist symbols'};
function renderLists(){$('#userLists').innerHTML=['interests','likes','dislikes','dates','contacts'].map(k=>`<button class="btn btn-sm btn-outline-primary me-1 mb-2" data-list="${k}">${LISTS[k]} + / −</button>`).join('');$$('[data-list]').forEach(b=>b.onclick=()=>b.dataset.list==='contacts'?safe(()=>showContacts())():editList(b.dataset.list))}
function editList(key){dialog(LISTS[key],`<p class="small">One entry per line. Save an empty list to remove all entries. These are saved in encrypted local memory.</p><textarea id="listEntries" class="form-control" rows="7">${esc((info[key]||[]).join('\n'))}</textarea><button id="saveList" class="btn btn-primary mt-2">Save</button>`);$('#saveList').onclick=safe(async()=>{const next={...info,[key]:[...new Set($('#listEntries').value.split('\n').map(x=>x.trim()).filter(Boolean))]};delete next['chat_'+key];await call('vce_save_user_info',{value:next});info=next;$('#popup').close();if(['portfolio','watchlist'].includes(key)){const p=await call('vce_place');const symbols=[...new Set([...p.symbols.split(','),...info.portfolio,...info.watchlist].map(x=>x.trim()).filter(Boolean))].join(',');await call('vce_set_place',{...p,symbols});await runFetch(true)}notice('Saved')})}
function contactRow(entry){const match=String(entry).match(/^(.*?)\s*[|—:]\s*([+0-9 ()-]{3,32})$/);return match?{name:match[1].trim(),number:match[2].trim()}:null}
async function showContacts(filter=''){
 info=await call('vce_user_info');const rows=(info.contacts||[]).map(contactRow).filter(Boolean).filter(c=>!filter||c.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
 dialog('Contacts & calls',`<div class="media-links"><button id="pickContact" class="btn btn-primary">Add from phone contacts</button><button id="manualContacts" class="btn btn-outline-primary">Edit saved contacts</button></div><p class="muted">Only selected names and numbers are saved in Buddy. Calls ask for confirmation. For manual entries use Name | +phone number.</p>`+(rows.length?rows.map((c,i)=>`<div class="model-row"><b>${esc(c.name)}</b><span class="d-block">${esc(c.number)}</span><button data-contact-call="${i}" class="btn btn-outline-primary">Call</button></div>`).join(''):'<p>No matching saved contacts.</p>'));
 $('#manualContacts').onclick=()=>editList('contacts');$('#pickContact').onclick=safe(async()=>{const picked=await native('pickContact');if(!picked||picked.cancelled)return;const entry=picked.name+' | '+picked.number;const contacts=info.contacts||[];if(!contacts.some(c=>{const v=contactRow(c);return v&&v.name===picked.name&&v.number.replace(/[^+0-9]/g,'')===picked.number})){const next={...info,contacts:[...contacts,entry]};await call('vce_save_user_info',{value:next});info=next}await showContacts();notice('Selected contact saved in Buddy')});
 $$('[data-contact-call]').forEach(b=>b.onclick=safe(async()=>{await quiet();const result=await native('callContact',rows[+b.dataset.contactCall]);if(result?.action)notice(result.action)}));
}
$('#menuBtn').onclick=()=>{dialog('Best_Buddy',`<button id="contactsMenu" class="btn btn-outline-primary w-100 mb-2">Contacts & calls</button><button id="safetyCall" class="btn btn-outline-danger w-100">Safety Call</button>`);$('#contactsMenu').onclick=safe(()=>showContacts());$('#safetyCall').onclick=safe(()=>native('callContact',{name:'Saved safety contact',number:safetyNumber||''}))};
$('#saveSafety').onclick=safe(async()=>{const n=$('#safetyNumber').value.trim();if(n&&!/^[+0-9 ()-]{3,32}$/.test(n))throw Error('Enter a valid phone number');await call('vce_save_user_info',{value:{...info,safety:n?[n]:[]}});info={...info,safety:n?[n]:[]};safetyNumber=n;notice('Safety number saved')});
// Consent controls remain authoritative in the Rust core.
const CONSENTS=[['local_memory','Save personal memory on this phone (encrypted)'],['learn_interests','Learn interests from conversation'],['mood_analysis','Notice mood to adjust tone'],['prefetch','Use internet for news, weather and sources'],['location','Device location (not connected; use your city below)'],['calendar','Device calendar (not connected; in-app reminders work)'],['cloud_byok','Cloud AI key (not connected; conversation uses local models)']];
const consentRows=(cur,pre)=>CONSENTS.filter(([k])=>!['location','calendar','cloud_byok'].includes(k)).map(([k,label])=>`<label class="d-flex justify-content-between align-items-center py-2" for="${pre}_${k}"><span class="small">${label}</span><input id="${pre}_${k}" class="form-check-input ms-2" type="checkbox" data-c="${k}" ${['location','calendar','cloud_byok'].includes(k)?'disabled':''} ${cur.some(x=>x.purpose===k&&x.granted)?'checked':''}></label>`).join('');
$('#consents').innerHTML=consentRows([],'o');$('#allowAll').onclick=()=>$$('#consents input:not(:disabled)').forEach(i=>i.checked=true);
async function loadConsents(){const cur=await call('vce_consents');$('#consents2').innerHTML=consentRows(cur,'s');$$('#consents2 input').forEach(i=>i.onchange=safe(async()=>{await call('vce_set_consent',{purpose:i.dataset.c,granted:i.checked});if(!i.checked&&['local_memory','learn_interests'].includes(i.dataset.c)){await native('clearSession');info=await call('vce_user_info')}await refreshStatus();if(i.checked&&i.dataset.c==='prefetch')await runFetch(true)}))}
$('#know').onclick=safe(async()=>{const list=await call('vce_know');$('#knowBox').hidden=false;$('#knowBox').innerHTML=list.length?list.map((t,i)=>`<div class="py-1">${esc(t)} <button class="btn btn-sm btn-outline-danger" data-forget="${i}">Forget</button></div>`).join(''):'No learned interests yet.';$$('[data-forget]').forEach(b=>b.onclick=safe(async()=>{await call('vce_forget',{index:+b.dataset.forget});$('#know').click()}))});
$('#exportBtn').onclick=safe(async()=>{$('#exportBox').textContent=await call('vce_export');$('#exportBox').hidden=false});
$('#wipe').onclick=()=>{dialog('Wipe personal data?',`<p>This erases Buddy’s saved memory, profile, reminders, source settings and conversation. Public model downloads are retained for reuse.</p><button id="confirmWipe" class="btn btn-danger">Erase my personal data</button>`);$('#confirmWipe').onclick=safe(async()=>{await quiet();await native('safetyStop');await native('clearSession');await native('pauseDownload');await native('modelOptions',{clearToken:true});await call('vce_wipe');localStorage.clear();location.reload()})};
$('#chatty').value=prefs.chatty;$('#chatty').onchange=safe(async e=>{prefs.chatty=e.target.value;voiceActivated=prefs.chatty!=='quiet';last=Date.now();save();await call('vce_set_chatty',{level:prefs.chatty})});
const suggested=[
 ...[['Google News','https://news.google.com/'],['MSN News','https://www.msn.com/en-in/news'],['AP News','https://apnews.com/'],['ANI News','https://www.aninews.in/']].map(([name,url])=>({group:'news',name:name+' · publisher browser',url,browse:true})),
 {group:'news',name:'BBC Top Stories',url:'https://feeds.bbci.co.uk/news/rss.xml'},
 {group:'news',name:'BBC World',url:'https://feeds.bbci.co.uk/news/world/rss.xml'},
 {group:'news',name:'BBC Technology',url:'https://feeds.bbci.co.uk/news/technology/rss.xml'},
 {group:'news',name:'Le Monde International (English)',url:'https://www.lemonde.fr/en/international/rss_full.xml'},
 {group:'fact',name:'NASA Science',url:'https://science.nasa.gov/feed/'},
 {group:'joke',name:'JokeAPI safe mode (bundled)',existing:'jokeapi'},
 {group:'anecdote',name:'Wikipedia On This Day (bundled)',existing:'wiki_otd'}
];
for(const row of prefs.discoveredSources||[])if(!suggested.some(s=>s.url===row.url))suggested.push(row);
function sourceOptions(){$('#sourceChoices').innerHTML=suggested.filter(s=>s.group===$('#sourceGroup').value&&(s.group!=='news'||sourcePlan(region,prefs.city,prefs.newsRegion||'').plan.some(feed=>feed.publishers.some(p=>{try{return (new URL(s.url||'').hostname===p.domain||new URL(s.url||'').hostname.endsWith('.'+p.domain))}catch{return false}})))).map(s=>`<option value="${suggested.indexOf(s)}">${esc(s.name)}</option>`).join('')};$('#sourceGroup').onchange=sourceOptions;sourceOptions();
$('#addSuggested').onclick=safe(async()=>{const s=suggested[+$('#sourceChoices').value];if(s.browse){await native('openLink',{url:s.url});$('#srcMsg').textContent='Publisher opened. Headline-only discovery is not stored as an article summary.';return}if(s.existing)await call('vce_source_toggle',{id:s.existing,enabled:true});else await call('vce_source_add',{name:s.name,url:s.url,family:s.group});$('#srcMsg').textContent='Added. Fetch checks whether the feed contains usable content.';await renderSources();await runFetch(true)});
$('#srcAdd').onclick=safe(async()=>{await call('vce_source_add',{name:$('#srcName').value,url:$('#srcUrl').value,family:$('#srcFam').value});$('#srcMsg').textContent='Added';$('#srcName').value=$('#srcUrl').value='';await renderSources();await runFetch(true)});
async function renderSources(){const open=new Set($$('#srcList details[open]').map(d=>d.dataset.sourceGroup));const list=(await call('vce_sources')).filter(source=>source.kind!=='rss_news'||sourcePlan(region,prefs.city,prefs.newsRegion||'').plan.some(feed=>feed.publishers.some(p=>{try{const host=new URL(source.url).hostname.toLowerCase();return host===p.domain||host.endsWith('.'+p.domain)}catch{return false}})));for(const row of list)if(!suggested.some(s=>s.existing===row.id||s.url===row.url))suggested.push({group:row.kind==='rss_news'?'news':row.family,name:row.name,existing:row.id,url:row.url});sourceOptions();$('#srcList').innerHTML=['News','Weather / Markets','Jokes','Facts / Stories'].map(group=>{const matches=s=>group==='News'?s.kind==='rss_news':group==='Weather / Markets'?['weather','markets'].includes(s.kind):group==='Jokes'?s.family==='joke':!['rss_news','weather','markets'].includes(s.kind)&&s.family!=='joke';return `<details data-source-group="${group}" ${open.has(group)||(!open.size&&group==='News')?'open':''}><summary>${group}</summary>`+list.filter(matches).map(s=>`<label class="d-flex justify-content-between align-items-center py-2"><span class="small">${esc(s.name)}<span class="d-block muted">${s.last_ok?'Fetched '+new Date(s.last_ok*1000).toLocaleString():'Not fetched'}${s.fails?' · '+esc(s.last_error||'Last fetch failed'):''} · ${s.total||0} items fetched${s.next_due?' · next check '+new Date(s.next_due*1000).toLocaleTimeString():''}</span></span><input type="checkbox" class="form-check-input" aria-label="Enable ${esc(s.name)}" data-source="${esc(s.id)}" ${s.enabled?'checked':''}></label>`).join('')+'</details>'}).join('');const feeds=sourcePlan(region,prefs.city,prefs.newsRegion||'');$('#srcList').insertAdjacentHTML('afterbegin','<div class="glass p-2 mb-2"><strong>News publishers · '+esc([feeds.location.city,feeds.location.region,feeds.location.country].filter(Boolean).join(', '))+'</strong>'+feeds.plan.map(feed=>'<p class="small mb-1"><b>'+esc(feed.scope)+'</b> · '+esc(feed.publishers.map(p=>p.name).join(', '))+'</p>').join('')+'</div>');$$('[data-source]').forEach(b=>b.onchange=safe(async()=>{await call('vce_source_toggle',{id:b.dataset.source,enabled:b.checked});await refreshPanels()}))}
async function httpGet(url){if(!T)throw Error('Android APK required');return call('vce_http_get',{url})}
let fetching=false,prefetchOn=false,lastOk=0,discovering=false;
function pill(){$('#pill').textContent=!T?'Layout preview':!navigator.onLine?'Offline · saved content':!prefetchOn?'Online updates off':lastOk?'Updated '+new Date(lastOk*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'No updates yet'}
async function refreshStatus(){prefetchOn=(await call('vce_consents')).some(c=>c.purpose==='prefetch'&&c.granted);const sources=await call('vce_sources');lastOk=Math.max(0,...sources.map(s=>s.last_ok));pill()}
async function refreshSourceDiscovery(force=false){
 if(!T||!prefetchOn||navigator.onLine===false||discovering||document.hidden||prefs.autoSources===false||(!force&&Date.now()-(prefs.sourceDiscoveryAt||0)<7*86400000))return;
 discovering=true;prefs.sourceDiscoveryAt=Date.now();save();
 try{const existing=await call('vce_sources');const result=await discoverSources({httpGet,existing,enabled:g=>g!=='news'&&enabled(g==='joke'?'Joke':'Fun fact'),add:row=>call('vce_source_add',{name:row.name,url:row.url,family:row.group}),onProgress:msg=>{if($('#discoveryStatus'))$('#discoveryStatus').textContent=msg}});
  for(const row of result.candidates)if(!suggested.some(s=>s.url===row.url))suggested.push(row);prefs.discoveredSources=result.candidates;if(!result.directoriesRead)prefs.sourceDiscoveryAt=Date.now()-6*86400000;prefs.sourceDiscoveryResult=result.directoriesRead?`${result.added} new feeds added · ${result.checked} candidate feeds checked`:'Publisher directories unavailable. Retry tomorrow or press Check for new sources.';save();sourceOptions();if($('#discoveryStatus'))$('#discoveryStatus').textContent=prefs.sourceDiscoveryResult;await renderSources();
 }finally{discovering=false}
}
async function runFetch(force=false,sourceKind=null){if(!T||!prefs.onboarded||fetching||document.hidden)return;fetching=true;let completed=0,failed=0;try{
 const sources=await call('vce_sources');for(const key of ['News','Weather','Markets','Joke','Fun fact'])if(!enabled(key))await applyPluginSources(key,false);
 const weatherPlace=await call('vce_place');const newsCountry=region;
 const requests=await call('vce_fetch_plan',{force});
 const plan=sourceKind?requests.filter(request=>sources.some(source=>source.id===request.id&&source.kind===sourceKind)):requests;let index=0;
 async function worker(){while(index<plan.length&&!document.hidden){const r=plan[index++];let body;try{body=await httpGet(r.url)}catch(e){await call('vce_fetch_failed',{id:r.id});failed++;completed++;continue}try{await call('vce_ingest',{id:r.id,body,weatherPlace:r.id==='weather'?weatherPlace:null,newsCountry:sources.some(s=>s.id===r.id&&s.kind==='rss_news')?newsCountry:null})}catch{failed++}completed++;if($('#fetchStatus'))$('#fetchStatus').textContent=`Updated ${completed}/${plan.length} requests · ${failed} unavailable or without usable content`;}}
 await Promise.all(Array.from({length:Math.min(3,plan.length)},worker));await refreshStatus();await refreshPanels();if(view==='settings')await renderSources();safe(()=>refreshSourceDiscovery())();
 }finally{fetching=false}return {completed,failed}}
$('#fetchNow').onclick=safe(async()=>{if(!prefetchOn){notice('Enable online prefetch before refreshing sources.');return}$('#fetchStatus').textContent='Refreshing source content…';const result=await runFetch(true);await marketUI.refresh(true);await renderSources();$('#fetchStatus').textContent=result?`Finished ${result.completed} requests · ${result.failed} unavailable or without usable content. See source details below.`:'An update is already running.'});
$('#autoSources').checked=prefs.autoSources!==false;$('#autoSources').onchange=e=>{prefs.autoSources=e.target.checked;save();if(e.target.checked)safe(()=>refreshSourceDiscovery(true))()};$('#discoverSources').onclick=safe(()=>refreshSourceDiscovery(true));
$('#savePlace').onclick=safe(async()=>{
 const button=$('#savePlace');button.disabled=true;$('#country').disabled=true;
 try{
  $('#placeMsg').textContent='Saving your chosen place…';
  const place=await saveSelectedPlace({input:$('#city').value.trim(),country:$('#country').value||region,
    symbols:$('#symbols').value,invoke:call,httpGet,online:prefetchOn&&navigator.onLine!==false});
  region=place.country;$('#country').value=region;$('#city').value=place.city;
  regionalHeadlines.clear();prefs.headlineLocation='';prefs.newsTab=place.city?'Local':'National';
  Object.assign(prefs,{city:place.city,newsRegion:place.region,latitude:place.lat??'',longitude:place.lon??''});save();
  $('#placeMsg').textContent='Saved '+[place.city,place.region,region].filter(Boolean).join(', ')+(place.verified?'':' · weather coordinates pending');
  await renderSources();await refreshPanels();safe(()=>refreshLocationNews(true))();safe(()=>runFetch(true))();
 }finally{button.disabled=false;$('#country').disabled=false}
});
$('#helpline').onchange=safe(e=>call('vce_set_helpline',{text:e.target.value}));
async function loadSettings(){renderLists();$('#addressName').value=prefs.name;$('#refreshEvery').value=await call('vce_refresh_settings');await loadConsents();region=await call('vce_region');$('#country').value=region;const [place,user,h]=await Promise.all([call('vce_place'),call('vce_user_info'),call('vce_helpline')]);info=user;$('#city').value=place.city||'';$('#symbols').value=place.symbols||'';$('#helpline').value=h;safetyNumber=(info.safety||[])[0]||'';$('#safetyNumber').value=safetyNumber;renderLists();await renderSources();await loadModels();await voiceStatus();await loadConnections();loadSafetyContacts();await refreshSafety()}
async function voiceStatus(){
 const status=await native('status');
 const language=(LANG[prefs.lang]||'en').split('-')[0];
 const voices=(status.voices||[]).filter(voice=>voice.language.split('-')[0]===language)
  .sort((a,b)=>b.quality-a.quality||a.language.localeCompare(b.language)||a.id.localeCompare(b.id));
 const voiceMenu=$('#voiceName');
 voiceMenu.replaceChildren(new Option('Automatic · clear offline voice',''));
 const counts=new Map();
 for(const voice of voices){
  const count=(counts.get(voice.language)||0)+1;
  counts.set(voice.language,count);
  let label=voice.language;
  try{label=new Intl.DisplayNames([document.documentElement.lang||'en'],{type:'language'}).of(voice.language)||label}catch{}
  voiceMenu.add(new Option(label+' · Voice '+count,voice.id));
 }
 voiceMenu.value=voices.some(voice=>voice.id===prefs.voiceName)?prefs.voiceName:'';
 $('#testVoice').disabled=!status.ttsReady||!voices.length;
 const output=voices.length?'Preview a voice to compare clarity and pronunciation.':'Install an offline voice for this language in Voice setup.';
 const input=status.onDeviceRecognition?'On-device recognition available.':status.deviceRecognition?'Device speech service requires consent.':'No speech recognizer installed.';
 $('#langs').textContent=output+' '+input;
}
$('#voiceLanguage').innerHTML=$('#lang').innerHTML=Object.keys(LANG).map(l=>`<option>${l}</option>`).join('');$('#voiceLanguage').value=prefs.lang;$('#voiceLanguage').onchange=e=>{prefs.lang=e.target.value;save();safe(voiceStatus)()};$('#allowSpeechService').checked=!!prefs.allowSpeechService;$('#allowSpeechService').onchange=e=>{prefs.allowSpeechService=e.target.checked;save()};$('#speechSettings').onclick=safe(()=>native('openSpeechSettings'));$('#recognitionSettings').onclick=safe(()=>native('openRecognitionSettings'));$('#testVoice').onclick=safe(async()=>{if(prefs.quietMode){notice('Turn on Sound to preview a voice.');return}voiceActivated=true;await speak('Hello. I am Buddy. Here is your weather and news for today.')});
let scannedModels=[],modelFocus='',pickerBusy=false;
function modelOptionsMarkup(status,selected){const remote=status.models.filter(m=>m.installed||['litert-community/SmolLM2-360M-Instruct','litert-community/Qwen3-0.6B','litert-community/Qwen3-1.7B'].includes(m.id));return '<optgroup label="Conversation models · Apache 2.0 candidates">'+remote.map(m=>`<option value="${esc(m.id)}" ${m.id===selected?'selected':''}>${m.rank||''}. ${esc(m.name||m.id.split('/')[1])} · ${Math.round(m.bytes/1e6)} MB${m.gated?' · HF access required':m.recommended?' · Recommended / public':''}${m.installed?' · installed':''}</option>`).join('')+'</optgroup>'+((status.models.some(m=>m.installed)||scannedModels.length)?'<optgroup label="Models on this phone">'+status.models.filter(m=>m.installed).map(m=>`<option value="installed:${esc(m.id)}">✓ ${esc(m.name||m.id)} · verified</option>`).join('')+scannedModels.map((m,i)=>`<option value="local:${i}" ${m.compatible?'':'disabled'}>${esc(m.name)} · ${m.compatible?'import & verify':'unsupported GGUF/TFLite'}</option>`).join('')+'</optgroup>':'')}
async function scanLocalModels(){pickerBusy=true;try{const result=await native('scanModels');if(!result.cancelled)scannedModels=result.files||[];notice(`${scannedModels.length} model files found${result.limited?' (scan limit reached)':''}. Originals are unchanged.`)}finally{pickerBusy=false}}
async function useModelChoice(value){if(value.startsWith('local:')){if($('#modelProgress'))$('#modelProgress').textContent='Copying and checking the local model…';const imported=await native('importModel',{uri:scannedModels[+value.slice(6)].uri});modelFocus=imported.id;notice('Model copied and SHA256 recorded. Use Check CPU / GPU / NPU to verify runtime compatibility.');return true}if(value.startsWith('installed:')){await quiet();await native('selectModel',{id:value.slice(10),backend:'CPU'});modelFocus=value.slice(10);notice('Verified local model selected');return true}modelFocus=value;return false}
function tokenFields(prefix){return `<label for="${prefix}Token" class="small">Hugging Face token (optional for these public models)</label><input id="${prefix}Token" class="form-control my-2" type="password" autocomplete="off" spellcheck="false" placeholder="hf_…"><label class="small"><input id="${prefix}Remember" type="checkbox"> Save token securely on this phone</label><p class="muted">A read token can help with model access. It is never added to conversations. Leave blank to use existing access or download without a token.</p>`}
async function saveTokenFields(prefix,extra={}){const field=$('#'+prefix+'Token');const token=field.value;field.value='';await native('modelOptions',{...extra,...(token?{token,rememberToken:$('#'+prefix+'Remember').checked}:{})})}
let launchDownloadRunning=false;
function startModelDownload(id,approved=false){if(launchDownloadRunning)return;launchDownloadRunning=true;$('#downloadStatus').hidden=false;$('#downloadStatus').textContent='Starting local model download…';safe(async()=>{try{await native('downloadModel',{id,licenseAccepted:!approved,autoResume:$('#launchAuto')?.checked??modelStatus?.autoResume??true});$('#downloadStatus').textContent='Local model ready — download verified.';await loadModels()}catch(e){$('#downloadStatus').textContent='Model download paused: '+String(e?.message||e);throw e}finally{launchDownloadRunning=false}})()}
async function launchModelDownload(resumeOnly=false){
 const s=await native('models');modelStatus=s;
 if(s.downloading||launchDownloadRunning||pickerBusy)return;
 try{const scan=await native('scanDownloadsModels');scannedModels=scan.files||[]}catch(e){notice('Model folder setup: '+String(e?.message||e))}
 if(s.models.some(m=>m.id===s.selected&&m.installed))return;
 const starter=s.models.find(m=>m.id==='litert-community/SmolLM2-360M-Instruct');
 if(!starter)throw Error('Bundled starter model specification is missing.');
 if(starter.installed){await native('selectModel',{id:starter.id,backend:'CPU'});return}
 const pending=s.models.find(m=>m.id===s.pending&&m.licenseAccepted);
 if(s.autoResume===false){$('#downloadStatus').hidden=false;$('#downloadStatus').textContent='Automatic model downloads are paused in Model settings.';return}
 if(navigator.onLine===false){$('#downloadStatus').hidden=false;$('#downloadStatus').textContent='Starter model will download when a connection is available.';return}
 if(resumeOnly&&pending){startModelDownload(pending.id,true);return}
 if(starter.gated||starter.license!=='apache-2.0'||starter.bytes>=500000000)throw Error('Starter model does not meet the approved download requirements.');
 startModelDownload(starter.id);
}
let modelStatus=null;
async function gatedModelFlow(m,openCard=true){
 dialog('Hugging Face approval',`<h6>${esc(m.name||m.id)}</h6><ol><li>Sign in on the model card using your Hugging Face account.</li><li>Read and accept the publisher conditions. Wait for approval if required.</li><li>Create a read token from the same account with access to this gated model, and paste it below.</li></ol><p class="muted">Browser login does not sign Buddy in. Tokens are never sent in browser URLs or conversations.</p><div class="media-links"><button id="gateCard" class="btn btn-outline-primary">Model card / sign in</button><button id="gateTokens" class="btn btn-outline-primary">Create read token</button></div>${tokenFields('gate')}<label class="small d-block my-2"><input id="gateAccepted" type="checkbox"> I accepted the conditions on Hugging Face</label><button id="gateDownload" class="btn btn-primary">Check access &amp; download</button><p id="gateStatus" role="status">${modelStatus?.tokenConfigured?'Existing token available; leave blank to reuse it.':'A token is required.'}</p>`);
 const card=()=>native('openLink',{url:m.modelCard||'https://huggingface.co/'+m.id});$('#gateCard').onclick=safe(card);$('#gateTokens').onclick=safe(()=>native('openLink',{url:'https://huggingface.co/settings/tokens'}));
 $('#gateDownload').onclick=safe(async()=>{if(!$('#gateAccepted').checked){$('#gateStatus').textContent='Accept the publisher conditions and confirm above.';return}const button=$('#gateDownload');button.disabled=true;try{$('#gateStatus').textContent='Checking account access…';await saveTokenFields('gate');await native('checkModelAccess',{id:m.id});$('#popup').close();startModelDownload(m.id)}catch(e){if($('#gateStatus'))$('#gateStatus').textContent=String(e?.message||e)}finally{button.disabled=false}});if(openCard)await card();
}
async function loadModels(){
 let folderNotice = 'Downloads/Models';
 try { const scan = await native('scanDownloadsModels'); scannedModels = scan.files || []; folderNotice = scan.message || 'Saved model folder checked automatically'; }
 catch { scannedModels = []; folderNotice = 'Folder unavailable. Choose your model folder again.'; }
 modelStatus=await native('models');const s=modelStatus;
 const allowed=['litert-community/SmolLM2-360M-Instruct','litert-community/Qwen3-0.6B','litert-community/Qwen3-1.7B'];
 s.models=s.models.filter(m=>m.installed||allowed.includes(m.id));
const focused=s.models.find(m=>m.id===(modelFocus||s.selected))||s.models[0];const configured=s.models.find(m=>m.id===s.selected);$('#models').innerHTML=`<section class="glass p-3 mb-2" role="status"><b>Configured model: ${esc(configured?.name||configured?.id||'None')}</b><div>${configured?.installed?'Verified · '+esc(s.backend)+' · '+esc(s.state):'Not downloaded yet'}</div><small>Downloads/Models + a private runtime copy (additional storage).</small></section><h3 class="h6">Conversation models</h3><p class="small" role="status">${esc(folderNotice)}</p><select id="modelChoice" hidden>${modelOptionsMarkup(s,focused.id)}</select><details><summary>Model folder &amp; file options</summary><p class="small">Choose the folder on this Android device once to grant access. Buddy checks that folder automatically. Models on your Windows PC are not automatically available on the phone.</p><button id="scanLocal" class="btn btn-outline-primary">Choose model folder</button><button id="importLocal" class="btn btn-outline-primary">Import one file</button></details><div class="local-model-list">${scannedModels.map((m,i)=>`<div class="model-row"><b>${esc(m.name)}</b><p class="small">${esc(m.reason||'Found in your model folder')}</p><button type="button" class="btn btn-outline-primary" data-local-choice="${i}" ${m.compatible?'':'disabled'}>${m.compatible?'Use local file':'Unsupported format'}</button></div>`).join('')}</div><details><summary>Hugging Face access &amp; launch downloads</summary>${tokenFields('settings')}<div class="media-links"><button id="saveHfToken" class="btn btn-outline-primary">Use token</button><button id="clearHfToken" class="btn btn-outline-primary">Forget token</button></div><div class="muted">${s.tokenConfigured?'Token available on this phone':'No token saved; public downloads can work without one'}</div><label class="small"><input id="autoResume" type="checkbox" ${s.autoResume?'checked':''}> Start/resume approved downloads at launch</label></details><p class="small">Android ${s.sdk} · ${(s.ramBytes/1e9).toFixed(1)} GB RAM · ${(s.freeBytes/1e9).toFixed(1)} GB free · ${esc(s.soc)}</p><p class="muted">CPU: app test available after download · GPU: verify with a real model test · NPU: ${esc(s.npuReason)} No NPU is claimed active without a matching artifact.</p>`+s.models.map(m=>`<div class="model-row"><b>${esc(m.name||m.id.split('/')[1])}</b>${m.source==='user-import'?'<span class="badge text-bg-warning">User model · check runtime compatibility</span>':m.gated?'<span class="badge text-bg-warning">HF account access required</span>':'<span class="badge text-bg-primary">Public / ungated</span>'}<div class="muted">${Math.round(m.bytes/1e6)} MB · text conversation · ${m.installed?'SHA256 verified':m.partialBytes?Math.round(m.partialBytes/1e6)+' MB partial':'Not installed'}</div><div class="media-links"><button class="btn btn-sm btn-outline-primary" data-card="${esc(m.id)}">${m.source==='user-import'?'Local model details':'Model card &amp; licence'}</button><button class="btn btn-sm btn-primary" data-download="${esc(m.id)}" ${m.installed?'disabled':''}>${m.installed?'Installed':m.partialBytes?'Resume':'Download'}</button>${m.installed?`<button class="btn btn-sm btn-outline-primary" data-select="${esc(m.id)}">${s.selected===m.id?'Configured':'Use this model'}</button><button class="btn btn-sm btn-outline-primary" data-export="${esc(m.id)}">Save to Downloads/Models</button>`:`<button class="btn btn-sm btn-outline-danger" data-reset="${esc(m.id)}">Reset failed download</button>`}</div></div>`).join('')+`<details><summary>Advanced runtime controls</summary><label class="small mt-2" for="backend">Inference backend</label><select id="backend" class="form-select"><option>CPU</option><option>GPU</option><option disabled>NPU — matching model required</option></select><div class="media-links"><button id="testBackends" class="btn btn-outline-primary">Check CPU / GPU / NPU</button><button id="pauseDownload" class="btn btn-outline-primary">Pause download</button><button id="unloadModel" class="btn btn-outline-primary">Release model memory</button></div><div id="modelProgress" class="small" role="status">${esc(s.state)} · ${esc(s.backend)}</div><div id="backendResults" class="small"></div></details>`;
 $('#modelChoice').onchange=safe(async e=>{const value=e.target.value;await useModelChoice(value);await loadModels();const m=s.models.find(m=>m.id===value);if(m?.gated&&!m.installed)await gatedModelFlow(m)});$$('[data-local-choice]').forEach(b=>b.onclick=safe(async()=>{await useModelChoice('local:'+b.dataset.localChoice);await loadModels()}));$$('[data-export]').forEach(b=>b.onclick=safe(async()=>{b.disabled=true;try{await native('exportModel',{id:b.dataset.export});notice('Model saved in Downloads/Models.')}finally{await loadModels()}}));$('#scanLocal').onclick=safe(async()=>{await scanLocalModels();await loadModels()});$('#importLocal').onclick=safe(async()=>{pickerBusy=true;try{await native('chooseModelFile');await loadModels()}finally{pickerBusy=false}});
 $('#saveHfToken').onclick=safe(async()=>{await saveTokenFields('settings');notice('Model access updated');await loadModels()});$('#clearHfToken').onclick=safe(async()=>{await native('modelOptions',{clearToken:true});await loadModels()});$('#autoResume').onchange=safe(e=>native('modelOptions',{autoResume:e.target.checked}));
 $('#backend').value=s.backend;$('#backend').onchange=safe(async()=>{await quiet();await native('selectModel',{id:s.selected,backend:$('#backend').value});notice('Backend selected. Use Check to test it.');});
 $$('[data-card]').forEach(b=>b.onclick=()=>{const m=s.models.find(m=>m.id===b.dataset.card);if(m.source==='user-import'){dialog('Local model details',`<p>${esc(m.name)}</p><p class="small">User-supplied LiteRT-LM container. SHA256 is recorded for integrity; publisher provenance and runtime compatibility are not assumed.</p><code class="small">${esc(m.sha256)}</code>`);return}safe(()=>native('openLink',{url:m.modelCard||m.modelCardUrl||'https://huggingface.co/'+m.id}))()});
 $$('[data-download]').forEach(b=>b.onclick=safe(async()=>{const m=s.models.find(m=>m.id===b.dataset.download);if(m.gated){await gatedModelFlow(m);return}dialog('Download '+m.id.split('/')[1],`<p>${Math.round(m.bytes/1e6)} MB. Read the model card and licence. A public copy is saved in Downloads/Models with a private runtime copy; allow about twice the model size in free storage.</p><div class="media-links"><button id="readTerms" class="btn btn-outline-primary">Read licence</button><button id="acceptModel" class="btn btn-primary">Accept &amp; download</button></div>`);$('#readTerms').onclick=safe(()=>native('openLink',{url:m.licenseUrl||m.modelCard}));$('#acceptModel').onclick=()=>{$('#popup').close();startModelDownload(m.id)}}));
 $$('[data-select]').forEach(b=>b.onclick=safe(async()=>{await quiet();await native('selectModel',{id:b.dataset.select,backend:$('#backend').value});await loadModels()}));
 $$('[data-reset]').forEach(b=>b.onclick=()=>{dialog('Reset failed download?',`<p>Remove only the incomplete or checksum-failed file for this model. Healthy verified models are retained.</p><button id="confirmReset" class="btn btn-danger">Reset failed download</button>`);$('#confirmReset').onclick=safe(async()=>{await native('resetDownload',{id:b.dataset.reset,confirmed:true});$('#popup').close();await loadModels()})});
 $('#pauseDownload').onclick=safe(()=>native('pauseDownload'));$('#unloadModel').onclick=safe(async()=>{await quiet();await native('unload');notice('Model unload requested')});
 $('#testBackends').onclick=safe(async()=>{await quiet();$('#testBackends').disabled=true;let results=[];try{for(const backend of ['CPU','GPU','NPU']){try{const r=await native('probe',{backend});results.push(`${backend}: reply ${r.text}; initialization ${r.initializeMs} ms; first token ${r.firstTokenMs} ms; generation ${r.generationMs} ms`)}catch(e){results.push(`${backend}: unavailable / failed — ${String(e?.message||e)}`)}$('#backendResults').textContent=results.join('\n');$('#backendResults').style.whiteSpace='pre-wrap'}}finally{$('#testBackends').disabled=false}})
}
const THEMES={solidGold:{name:'Solid · Royal Gold',accent:'#e8b94d',second:'#e8b94d',bg:'#19140b',surface:'#3a2e1a',solid:true},solidDarkGreenGold:{name:'Dark Green + Gold',accent:'#d7b36a',second:'#d7b36a',bg:'#10251e',surface:'#1b392e',solid:true},solidCharcoalGold:{name:'Classic Charcoal + Gold',accent:'#d7b36a',second:'#d7b36a',bg:'#1b2025',surface:'#293139',solid:true},solidEmeraldBlue:{name:'Emerald Blue + Gold',accent:'#e0bd77',second:'#d3aa62',bg:'#071b25',surface:'#153f5a',solid:true},solidSparklingBlue:{name:'Sparkling Blue',accent:'#67e8f9',second:'#67e8f9',bg:'#091b40',surface:'#164b91',solid:true},solidGoldenIvory:{name:'Golden Ivory',accent:'#b78019',second:'#b78019',bg:'#fffaf0',surface:'#f1e2c4',solid:true,light:true},solidOceanBlue:{name:'Ocean Blue',accent:'#38bdf8',second:'#38bdf8',bg:'#061b30',surface:'#0b4367',solid:true},solidRuby:{name:'Solid · Ruby',accent:'#fb7185',second:'#fb7185',bg:'#250b17',surface:'#652033',solid:true},solidAmethyst:{name:'Solid · Amethyst',accent:'#c084fc',second:'#c084fc',bg:'#21102e',surface:'#4a2562',solid:true},solidCobalt:{name:'Solid · Cobalt',accent:'#93c5fd',second:'#93c5fd',bg:'#111d3d',surface:'#284e91',solid:true},solidRose:{name:'Solid · Rose',accent:'#a92e65',second:'#a92e65',bg:'#fff2f6',surface:'#f4d3e1',solid:true,light:true},solidCoral:{name:'Solid · Coral',accent:'#fdba74',second:'#fdba74',bg:'#32160d',surface:'#82462b',solid:true},solidTurquoise:{name:'Solid · Turquoise',accent:'#5eead4',second:'#5eead4',bg:'#052e2d',surface:'#155d59',solid:true},solidIndigo:{name:'Solid · Indigo',accent:'#a5b4fc',second:'#a5b4fc',bg:'#171439',surface:'#373377',solid:true},solidIvory:{name:'Solid · Ivory',accent:'#3f6176',second:'#3f6176',bg:'#fbfaf5',surface:'#e9e5d9',solid:true,light:true},solidMint:{name:'Solid · Mint',accent:'#067d67',second:'#067d67',bg:'#effff8',surface:'#ccf2e4',solid:true,light:true},solidMaroon:{name:'Solid · Maroon',accent:'#f9a8d4',second:'#f9a8d4',bg:'#2b0e23',surface:'#713152',solid:true},solidSapphire:{name:'Solid · Sapphire',accent:'#60a5fa',second:'#60a5fa',bg:'#0d1b34',surface:'#214d84',solid:true},solidSunflower:{name:'Solid · Sunflower',accent:'#fde047',second:'#fde047',bg:'#2b2509',surface:'#63541a',solid:true},solidNavy:{name:'Solid · Navy',accent:'#7dd3fc',second:'#7dd3fc',bg:'#0c1628',surface:'#152238',solid:true},solidCharcoal:{name:'Solid · Charcoal',accent:'#5eead4',second:'#5eead4',bg:'#151719',surface:'#22262a',solid:true},solidBlack:{name:'Solid · Black',accent:'#c4b5fd',second:'#c4b5fd',bg:'#000000',surface:'#141414',solid:true},solidForest:{name:'Solid · Forest',accent:'#a7f3d0',second:'#a7f3d0',bg:'#0b211b',surface:'#14362a',solid:true},solidWhite:{name:'Solid · White',accent:'#08776c',second:'#08776c',bg:'#ffffff',surface:'#f3f5f7',solid:true,light:true},solidCream:{name:'Solid · Cream',accent:'#795020',second:'#795020',bg:'#fff8ec',surface:'#f3eadb',solid:true,light:true},aurora:{name:'Aurora',accent:'#2dd4bf',second:'#818cf8',bg:'#0b1020'},ocean:{name:'Ocean',accent:'#60a5fa',second:'#2dd4bf',bg:'#071825'},midnight:{name:'Midnight',accent:'#a78bfa',second:'#334155',bg:'#080b16'},rose:{name:'Rose',accent:'#f472b6',second:'#a78bfa',bg:'#1c1022'},sunrise:{name:'Sunrise',accent:'#fbbf24',second:'#fb7185',bg:'#21140c'},forest:{name:'Forest',accent:'#86efac',second:'#2dd4bf',bg:'#071c18'},paper:{name:'Paper · Light',accent:'#0d9488',second:'#93c5fd',bg:'#eef2ff',light:true}};
$('#themeChoice').innerHTML=Object.entries(THEMES).map(([id,t])=>`<option value="${id}">${t.name}</option>`).join('');$('#themeChoice').value=THEMES[prefs.theme]?prefs.theme:'solidEmeraldBlue';$('#themeChoice').onchange=e=>{const theme=THEMES[e.target.value];prefs.theme=e.target.value;prefs.accent=theme.accent;prefs.light=!!theme.light;$('#light').checked=prefs.light;save();look()};
const accents=['#2dd4bf','#60a5fa','#f472b6','#fbbf24','#a78bfa'];const look=()=>{const r=document.documentElement.style;const theme=THEMES[prefs.theme]||THEMES.solidEmeraldBlue;if(!THEMES[prefs.theme]){prefs.theme='solidEmeraldBlue';prefs.accent=theme.accent;save()}document.documentElement.dataset.surface=theme.solid?'solid':'glass';r.setProperty('--solid-panel',theme.surface||theme.bg);r.setProperty('--solid-edge',theme.light?'#bdc5cb':'#52616d');$('#blur').disabled=!!theme.solid;$('#light').disabled=!!theme.solid;if(theme.solid){prefs.light=!!theme.light;$('#light').checked=!!theme.light}r.setProperty('--accent2',theme.second);r.setProperty('--bs-body-bg',theme.solid?theme.bg:prefs.light?'#eef2ff':theme.bg);r.setProperty('--accent',prefs.accent||theme.accent);r.setProperty('--bs-body-color',theme.light?'#202c31':'#f7f1e3');r.setProperty('--bs-secondary-color',theme.light?'#4c5960':'#c8d8da');r.setProperty('--bs-border-color',theme.light?'#b8c4c9':'#49656b');r.setProperty('--blur',(theme.solid?0:prefs.blur??22)+'px');r.setProperty('--fsx',prefs.seniorAssistant?Math.max(1.1,prefs.fsx??1):prefs.fsx??1);document.documentElement.dataset.bsTheme=prefs.light?'light':'dark'};$('#swatches').innerHTML=accents.map(a=>`<button class="sw" style="background:${a}" data-accent="${a}" aria-label="Accent ${a}"></button>`).join('');$$('[data-accent]').forEach(b=>b.onclick=()=>{prefs.accent=b.dataset.accent;save();look()});for(const id of ['blur','fsx']){$('#'+id).value=prefs[id]??(id==='blur'?22:1);$('#'+id).oninput=e=>{prefs[id]=+e.target.value;save();look()}}$('#light').checked=!!prefs.light;$('#light').onchange=e=>{prefs.light=e.target.checked;save();look()};look();
const selectedTone=$(`[data-tone="${['playful','calm','formal'].includes(prefs.tone)?prefs.tone:'calm'}"]`);$$('[data-tone]').forEach(b=>{b.classList.toggle('active',b===selectedTone);b.onclick=()=>$$('[data-tone]').forEach(x=>x.classList.toggle('active',x===b))});$('#feats').innerHTML=['Weather','News','Markets','Schedule','Music'].map(f=>`<button type="button" class="btn btn-sm btn-outline-primary ${prefs.feats.includes(f)?'active':''}" data-feature="${f}">${f}</button>`).join('');$$('[data-feature]').forEach(b=>b.onclick=()=>b.classList.toggle('active'));
let step=0;$$('[data-next]').forEach(b=>b.onclick=()=>{if(step===2&&!$('#adult').checked){$('#adultHint').hidden=false;return}step++;$$('[data-step]').forEach(s=>s.hidden=+s.dataset.step!==step)});
$('#finish').onclick=safe(async()=>{const next={...prefs,name:$('#name').value.trim()||'friend',lang:$('#lang').value,tone:$('[data-tone].active').dataset.tone,feats:$$('[data-feature].active').map(b=>b.dataset.feature),onboarded:true};await call('vce_register',{name:next.name,lang:next.lang,tone:next.tone,adult:$('#adult').checked,tz:tz()});for(const i of $$('#consents input'))await call('vce_set_consent',{purpose:i.dataset.c,granted:i.checked});Object.assign(prefs,next);save();$('#voiceLanguage').value=prefs.lang;$('#onb').hidden=true;await refreshStatus();await refreshPanels();safe(()=>runFetch(true))();safe(()=>daybookUI.refresh(true))();await launchCompanionship(false)});
['click','keydown','touchstart'].forEach(e=>addEventListener(e,()=>last=Date.now(),{passive:true}));
async function intelligentChatter(seed,ticket){if(safetyState.active&&safetyState.state!=='monitoring')return;let text=seed;let modelUsed=false;if(prefs.modelChatter!==false&&!QUESTION_BANK.some(q=>q.text===seed)){try{const status=await native('models');if(status.models.some(m=>m.id===status.selected&&m.installed)){const context=await conversationContext();if(ticket!==epoch)return;const response=await native('generate',{text:'Write only one friendly follow-up question or invitation, no more than 25 words, grounded in this seed and the user interests. Do not add factual claims or repeat the seed. Avoid disliked topics, recent openings and repetition. Seed: '+seed,chatter:true,context});if(ticket!==epoch)return;text=seed.trim().endsWith('?')?response.text:seed+'\n\n'+response.text;modelUsed=true}}catch{/* Seed remains the grounded fallback; no error speech is imposed on the user. */}}if(ticket!==epoch||document.hidden)return;if(!companionSession.available(text))text=seed;if(!companionSession.available(text))return;say('b',text,'Buddy companionship');companionSession.record(text);await speak(text,ticket);if(ticket===epoch){if(prefs.conversationMemoryConsent===true)await native('remember',{user:'Buddy starts a light conversation',reply:text});$('#voiceNotice').textContent=modelUsed?'Local-model conversation':'Sourced conversation';last=Date.now()}}
setInterval(safe(async()=>{if(safetyState.active&&safetyState.state!=='monitoring')return;if(!T||!prefs.onboarded||document.hidden||busy||chatMode||prefs.quietMode||!prefs.autoChatter||!$('#player').paused||!$('#vplayer').paused)return;if(Date.now()-last<180000||!companionSession.canInitiate())return;let seed=companionSession.invitation(info);if(!seed)seed=await call('vce_silence',{idle:Math.floor((Date.now()-last)/1000),allowQuestions:false});if(seed&&!companionSession.available(seed))return;if(seed){const ticket=++epoch;busy=true;try{await intelligentChatter(seed,ticket)}finally{if(ticket===epoch){busy=false;orb('idle')}}}}),20000);

const pendingReminderSpeech=[];
async function alarms(){
 if(!T||!prefs.onboarded||document.hidden)return;
 const list=await call('vce_tick');
 for(const a of list){
  const msg=(a.late_secs>120?'Missed reminder: ':'Reminder: ')+a.text;
  $('#alarm').textContent=msg+' (tap to dismiss)';$('#alarm').hidden=false;
  $('#alarm').onclick=()=>{$('#alarm').hidden=true;pendingReminderSpeech.length=0};
  say('b',msg,'In-app reminder');pendingReminderSpeech.push(msg);
 }
 if(pendingReminderSpeech.length&&!busy&&!prefs.quietMode&&$('#player').paused&&$('#vplayer').paused){
  const ticket=++epoch;busy=true;
  try{await speak(pendingReminderSpeech[0],ticket);if(ticket===epoch)pendingReminderSpeech.shift()}
  finally{if(ticket===epoch){busy=false;orb('idle');if(chatMode)setTimeout(()=>{if(ticket===epoch&&chatMode&&!document.hidden)listen()},400)}}
 }
}setInterval(safe(alarms),5000);
setInterval(safe(()=>runFetch()),60000);addEventListener('online',safe(()=>runFetch()));addEventListener('offline',pill);document.addEventListener('visibilitychange',()=>{if(document.hidden){safe(quiet)();$('#player').pause();$('#vplayer').pause();if(slideT){clearInterval(slideT);slideT=null;$('#slideP').textContent='Slideshow'}}else{last=Date.now();safe(alarms)();safe(()=>runFetch())();safe(()=>daybookUI.refresh(false))();if(T){safe(()=>launchModelDownload(true))();if(companionSession.canResume()&&view==='home')safe(()=>launchCompanionship(false,true))()}}});
$$('[data-link]').forEach(b=>b.onclick=safe(()=>native('openLink',{url:b.dataset.link})));// Discovery Cinema owns its local-video picker and playback lifecycle.
async function start(){renderCommands();renderBrief();if(!T){$('#onb').hidden=true;$('#voiceNotice').textContent='Layout preview — Android features unavailable';pill();return}const channel=new T.core.Channel();channel.onmessage=e=>{if(e.type==='voice'){orb(e.state)}else if(e.type==='model'){const progress=e.state+(e.bytes?` · ${Math.round(e.bytes/1e6)} / ${Math.round(e.total/1e6)} MB`:'');if($('#modelProgress'))$('#modelProgress').textContent=progress;if(['downloading','verifying','downloaded','download-paused'].includes(e.state)){$('#downloadStatus').hidden=false;$('#downloadStatus').textContent=progress}}};await call('vce_events',{onEvent:channel});await call('vce_set_user',{name:prefs.name,tz:tz()});region=await call('vce_region');try{const place=await call('vce_place');prefs.city=place.city||'';prefs.latitude=place.lat??'';prefs.longitude=place.lon??'';$('#city').value=prefs.city;save();}catch(e){console.warn('Could not load saved place',e)}await marketUI.load();await call('vce_set_chatty',{level:prefs.chatty});safe(()=>launchCompanionship(!prefs.onboarded))();if(!prefs.onboarded){$('#hello').textContent=companionSession.greeting(true);$('#onb').hidden=false}else{info=await call('vce_user_info');const h=await call('vce_helpline');safetyNumber=(info.safety||[])[0]||'';await refreshStatus();await refreshPanels();safe(()=>runFetch())();safe(()=>refreshLocationNews())();safe(prefetchInterestTopics)();safe(()=>daybookUI.refresh(false))();setTimeout(()=>safe(scanReadableResources)(),600);safe(alarms)()}safe(()=>launchModelDownload())()}
let safetyNumber='';
safe(start)();
// Music Lounge: opt-in, on-device library. Audio bytes remain in IndexedDB.
let tracks = [], ti = -1, shuffle = false; const pl = $("#player");
const musicDB = new Promise((resolve,reject)=>{const r=indexedDB.open('bestbuddy-music-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('tracks',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
async function musicTransaction(mode,action){const db=await musicDB;return new Promise((resolve,reject)=>{const tx=db.transaction('tracks',mode),store=tx.objectStore('tracks');let result;const req=action(store);req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error)})}
const musicGetAll=()=>musicTransaction('readonly',s=>s.getAll());
const musicSave=t=>musicTransaction('readwrite',s=>s.put({id:t.id,name:t.name,blob:t.blob,favourite:t.favourite,collection:t.collection}));
const musicDelete=id=>musicTransaction('readwrite',s=>s.delete(id));
const musicVolumeKey='bb_music_volume_v1';
function musicUrl(t){if(!t.url)t.url=URL.createObjectURL(t.blob);return t.url}
const nextIdx=()=>shuffle&&tracks.length>1?(ti+1+Math.floor(Math.random()*(tracks.length-1)))%tracks.length:ti+1;
function renderTracks(){const root=$('#tracks');root.replaceChildren();tracks.forEach((t,i)=>{const row=document.createElement('div');row.className='d-flex align-items-center gap-1 py-1';const choose=document.createElement('button');choose.type='button';choose.className='btn btn-sm btn-outline-primary flex-grow-1 text-start';choose.textContent=(i===ti?'▶ ':'')+t.name;choose.onclick=()=>playT(i);const fav=document.createElement('button');fav.type='button';fav.className='btn btn-sm btn-outline-primary';fav.textContent=t.favourite?'★':'☆';fav.setAttribute('aria-label','Toggle favourite');fav.onclick=async()=>{t.favourite=!t.favourite;await musicSave(t);renderTracks()};const remove=document.createElement('button');remove.type='button';remove.className='btn btn-sm btn-outline-primary';remove.textContent='Remove';remove.onclick=async()=>{if(i===ti){pl.pause();pl.removeAttribute('src');pl.load();ti=-1}if(t.url)URL.revokeObjectURL(t.url);await musicDelete(t.id);tracks.splice(i,1);if(i<ti)ti--;renderTracks();updateMusicStatus()};row.append(choose,fav,remove);root.append(row)})}
function playT(i){if(!$('#vplayer').paused){$('#vplayer').pause()}if(prefs.quietMode){notice('Turn off Quiet before playing music.');return}if(!tracks.length)return;ti=(i+tracks.length)%tracks.length;pl.src=musicUrl(tracks[ti]);pl.play().catch(e=>notice('Music playback: '+e.message));$('#trackNow').textContent='Now playing: '+tracks[ti].name;$('#trackNext').textContent='Up next: '+(tracks.length>1?tracks[(ti+1)%tracks.length].name:'—');renderTracks();if('mediaSession' in navigator && typeof MediaMetadata!=='undefined'){navigator.mediaSession.metadata=new MediaMetadata({title:tracks[ti].name,artist:'Your local music library'});}}
$('#musicScan').onclick=()=>$('#musicFiles').click();
$('#openMusicSource').onclick=safe(async()=>{const link=$('#musicSources').value;if(!link){notice('Choose a music service.');return}if(link==='device:music'){notice('Select your preferred installed music app.');return}await native('openLink',{url:link})});
$('#musicFiles').onchange=async e=>{const files=[...e.target.files];for(const file of files){if(!file.type.startsWith('audio/')&&!/\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(file.name))continue;const t={id:crypto.randomUUID(),name:file.name.replace(/\.[^.]+$/,''),blob:file,favourite:false,collection:'My Music'};try{await musicSave(t);tracks.push(t)}catch(err){notice('Unable to save '+file.name+': '+err.message);break}}e.target.value='';renderTracks();if(ti<0&&tracks.length){ti=0;$('#trackNow').textContent='Ready: '+tracks[0].name;renderTracks();updateMusicStatus()}};
pl.onended=()=>{if(tracks.length)playT(nextIdx())};
$('#nextT').onclick=()=>playT(nextIdx());$('#prevT').onclick=()=>playT(ti-1);
$('#shuf').onclick=e=>{shuffle=!shuffle;e.target.classList.toggle('active',shuffle);e.target.setAttribute('aria-pressed',String(shuffle))};
(async()=>{try{tracks=await musicGetAll();renderTracks();updateMusicStatus()}catch(e){console.warn('Music library unavailable',e);notice('Music storage unavailable; check device storage permissions.')}})();
if('mediaSession' in navigator){navigator.mediaSession.setActionHandler('play',()=>{if(!prefs.quietMode)pl.play().catch(()=>{})});navigator.mediaSession.setActionHandler('pause',()=>pl.pause());navigator.mediaSession.setActionHandler('nexttrack',()=>playT(nextIdx()));navigator.mediaSession.setActionHandler('previoustrack',()=>playT(ti-1))}
let photos = [], pi = 0, slideT = null;
function showP() { const v = $("#photoView"); if (!photos.length) { v.hidden = true; return; } v.src = photos[pi]; v.hidden = false; $("#photoCount").textContent = (pi + 1) + " / " + photos.length; }
$("#photoFiles").onchange = e => { photos = [...e.target.files].map(f => URL.createObjectURL(f)); pi = 0; showP(); };
$("#prevP").onclick = () => { if (photos.length) { pi = (pi - 1 + photos.length) % photos.length; showP(); } };
$("#nextP").onclick = () => { if (photos.length) { pi = (pi + 1) % photos.length; showP(); } };
$("#slideP").onclick = e => { if (slideT) { clearInterval(slideT); slideT = null; e.target.textContent = "Slideshow"; return; } if (photos.length) { slideT = setInterval(() => $("#nextP").click(), 4000); e.target.textContent = "Stop"; } };
// Video file selection is managed by Discovery Cinema.

const musicToggle=$('#homeMusicToggle');
function updateMusicStatus(){const active=!pl.paused&&!pl.ended;musicToggle.textContent=active?'Ⅱ Pause':'▶ Music';musicToggle.setAttribute('aria-pressed',String(active));$('#ambienceTitle').textContent=tracks[ti]?.name||'Your own gentle soundtrack';$('#ambienceStatus').textContent=active?'Playing on this device':tracks.length?'Paused · Tap Music to resume':'Off · Choose music from your phone';$('#musicWidget').classList.toggle('music-playing',active)}
musicToggle.onclick=()=>{if(!pl.paused){pl.pause();return}if(prefs.quietMode){notice('Turn off Quiet to play music.');return}if(!tracks.length){go('media');$('#musicFiles').focus();notice('Choose your music files to begin.');return}if(ti<0||!pl.src){playT(0);return}if(!$('#vplayer').paused)$('#vplayer').pause();pl.play().catch(e=>notice(e))};
$('#musicVolume').oninput=e=>{const v=Math.max(0,Math.min(100,Number(e.target.value)));pl.volume=v/100;localStorage.setItem(musicVolumeKey,String(v));$('#musicVolumeLabel').textContent=v+'%'};const savedMusicVolume=Math.max(0,Math.min(100,Number(localStorage.getItem(musicVolumeKey)??45)));$('#musicVolume').value=savedMusicVolume;$('#musicVolumeLabel').textContent=savedMusicVolume+'%';pl.volume=savedMusicVolume/100;
pl.addEventListener('play',()=>{if(!$('#vplayer').paused)$('#vplayer').pause();updateMusicStatus()});pl.addEventListener('pause',updateMusicStatus);pl.addEventListener('ended',updateMusicStatus);updateMusicStatus();

$('#voiceName').onchange=e=>{prefs.voiceName=e.target.value;save()};$('#voiceRate').value=prefs.voiceRate||0.94;$('#voiceRate').oninput=e=>{prefs.voiceRate=+e.target.value;save()};$('#voicePause').value=prefs.voicePause||350;$('#voicePause').oninput=e=>{prefs.voicePause=+e.target.value;save()};

$('#country').onchange=safe(async e=>{
 const country=e.target.value;
 if(country===region)return;
 const saved=await call('vce_place');
 region=await call('vce_region',{country});
 await call('vce_set_place',{city:'',lat:null,lon:null,symbols:saved.symbols});
 regionalHeadlines.clear();prefs.newsRegion='';prefs.headlineLocation='';prefs.city='';prefs.latitude='';prefs.longitude='';prefs.newsTab='National';save();
 $('#city').value='';
 $('#placeMsg').textContent='Choose a city in '+region+' for local weather and headlines.';
 await refreshPanels();
 await renderSources();
 await refreshLocationNews(true);
 await runFetch(true);
});

$('#saveName').onclick=safe(async()=>{const name=$('#addressName').value.trim();await call('vce_update_name',{name});prefs.name=name;save();$('#nameMsg').textContent='Buddy will address you as '+name+'.'});
$('#refreshEvery').onchange=safe(e=>call('vce_refresh_settings',{minutes:+e.target.value}));$('#safetyContacts').onclick=safe(()=>showContacts());
async function loadConnections(){const {apps}=await native('connections');const preferred=apps.filter(a=>a.countries.includes(region)||(region!=='CN'&&a.countries.length===0));const other=apps.filter(a=>!preferred.includes(a)&&!(region==='IN'&&a.id==='tiktok'));const buttons=rows=>rows.map(a=>`<button class="btn btn-outline-primary connection" data-connection="${esc(a.id)}"><strong>${esc(a.name)}</strong><small class="d-block">${a.installed?'Open app':'Open website'}</small></button>`).join('');$('#connectionsList').innerHTML=buttons(preferred);$('#moreConnections').innerHTML=buttons(other);$$('[data-connection]').forEach(b=>b.onclick=safe(()=>native('openConnection',{id:b.dataset.connection})))}
async function showStorage(){const data=await call('vce_stored_items');const groups=[...new Set(data.items.map(i=>i.topic))];$('#storedItems').innerHTML=`<p class="muted">${data.items.length} removable cached items · ${data.bundledItems} bundled items stay with the app. Regional facts served: ${data.localFactsServed} local / ${data.worldFactsServed} other countries.</p>`+groups.map((g,index)=>`<details data-stored-group="${index}"><summary><label><input type="checkbox" data-topic-check="${index}"> ${esc(g)} (${data.items.filter(i=>i.topic===g).length})</label></summary>`+data.items.filter(i=>i.topic===g).map(i=>`<label class="storage-row"><input type="checkbox" data-storage-item="${esc(i.id)}"><span>${esc(i.title)}<small class="d-block muted">${esc(i.source)} · ${(i.bytes/1024).toFixed(1)} KB</small></span></label>`).join('')+'</details>').join('')+`<button id="deleteStored" class="btn btn-outline-danger mt-2">Delete selected cached items</button>`;
 $$('[data-topic-check]').forEach(c=>c.onchange=()=>c.closest('details').querySelectorAll('[data-storage-item]').forEach(x=>x.checked=c.checked));$('#deleteStored').onclick=()=>{const ids=$$('[data-storage-item]:checked').map(i=>i.dataset.storageItem);if(!ids.length){notice('Select items or a topic first');return}dialog('Delete selected cached content?',`<p>${ids.length} selected entries will be removed from this app. Models, contacts, profile and original media remain. Enabled sources can fetch new content later.</p><button id="confirmStoredDelete" class="btn btn-danger">Delete ${ids.length} entries</button>`);$('#confirmStoredDelete').onclick=safe(async()=>{const removed=await call('vce_delete_stored',{ids});$('#popup').close();await marketUI.load();await refreshPanels();await showStorage();notice(removed+' cached entries removed')})}}
$('#browseStorage').onclick=safe(showStorage);
async function housekeeping(clearCache){await quiet();const r=await native('housekeeping',{clearCache});$('#housekeepingStatus').textContent=`App memory: ${(r.pssBeforeKb/1024).toFixed(1)} → ${(r.pssAfterKb/1024).toFixed(1)} MB. Temporary cache removed: ${(r.cacheBytesRemoved/1048576).toFixed(1)} MB. Models and personal data retained.`}
$('#reclaimMemory').onclick=safe(()=>housekeeping(false));$('#cleanRuntime').onclick=()=>{dialog('Clean temporary app cache?',`<p>Release the loaded model and clear rebuildable runtime files. Verified models, interrupted model downloads, personal information and phone media are kept.</p><button id="confirmRuntimeClean" class="btn btn-primary">Clean app cache</button>`);$('#confirmRuntimeClean').onclick=safe(async()=>{$('#popup').close();await housekeeping(true)})};
renderLists();

$('#autoChatter').checked=!!prefs.autoChatter;$('#autoChatter').onchange=e=>{prefs.autoChatter=e.target.checked;prefs.proactiveOptOut=!e.target.checked;save()};$('#disableMature').onclick=()=>{prefs.enableMatureJokes=false;save();notice('Mature jokes disabled.')};$('#modelChatter').checked=prefs.modelChatter!==false;$('#modelChatter').onchange=e=>{prefs.modelChatter=e.target.checked;if(e.target.checked){voiceActivated=true;last=Date.now()}save()};

let safetyState={active:false,state:'off'},safetyCallHandling=false;
function loadSafetyContacts(){const contacts=(info.contacts||[]).map(contactRow).filter(Boolean);if(safetyNumber)contacts.unshift({name:'Saved safety contact',number:safetyNumber});const markup='<option value="">Local alerts only · no contact selected</option>'+contacts.map(c=>`<option value="${esc(c.number)}" data-name="${esc(c.name)}">${esc(c.name)} · ${esc(c.number)}</option>`).join('');$('#safetyTrusted').innerHTML=markup;$('#safetyHealthcare').innerHTML=markup}
async function refreshSafety(){if(!T)return;safetyState=await native('safetyStatus')||{active:false,state:'off'};const alert=safetyState.active&&safetyState.state!=='monitoring';$('#safetyBanner').hidden=!safetyState.active;$('#safetyBannerText').textContent=alert?(safetyState.state==='check-in'?`Are you OK? ${safetyState.remainingSeconds||0}s to respond.`:safetyState.autoCalls?(safetyState.state+' · '+(safetyState.callStatus||'Call escalation enabled')+` · ${safetyState.remainingSeconds||0}s`):'Check-in unanswered · nobody has been contacted automatically.'):'Safety mode on · '+(safetyState.microphoneActive?'local acoustic monitoring':'check-ins / microphone paused');$('#safetyOkay').hidden=!alert;$('#safetyHelp').disabled=!safetyState.contactNumber&&!safetyNumber&&!$('#safetyTrusted').value;$('#safetyHelpAlways').disabled=$('#safetyHelp').disabled;$('#safetyOkayAlways').disabled=!alert;$('#safetyStatusText').textContent=safetyState.active?`${safetyState.state} · ${safetyState.reason||'Monitoring'}${safetyState.lastError?' · '+safetyState.lastError:''}`:'Off'+(safetyState.lastError?' · '+safetyState.lastError:' · start a new session when needed');$('#safetyStart').disabled=!!safetyState.active;$('#safetyTest').disabled=!safetyState.active;
 if(safetyState.callRequested&&!safetyCallHandling){safetyCallHandling=true;try{await quiet();await native('callContact',{name:safetyState.callName||'Trusted contact',number:safetyState.callNumber})}finally{safetyCallHandling=false}}
}
$('#safetyStart').onclick=safe(async()=>{if(!$('#safetyConsent').checked){openSafetyPage(0);$('#safetyLimits').scrollIntoView({block:'nearest'});throw Error('Review the safety-mode limits and tick the consent box first.');}if(!enabled('Safety'))throw Error('Enable the Safety widget in Explore first.');const selected=$('#safetyTrusted').selectedOptions[0],healthcare=$('#safetyHealthcare').selectedOptions[0];if($('#safetyAutoCalls').checked&&(!$('#safetyAutoConsent').checked||!$('#safetyTrusted').value||!$('#safetyHealthcare').value))throw Error('Choose family and healthcare contacts and approve the automatic calling rule first.');await native('safetyStart',{confirmed:true,scheduled:$('#safetyScheduled').checked,acoustic:$('#safetyAcoustic').checked,spoken:$('#safetySpoken').checked,intervalMinutes:+$('#safetyInterval').value,timeoutSeconds:+$('#safetyTimeout').value,sensitivity:$('#safetySensitivity').value,contactNumber:$('#safetyTrusted').value,contactName:selected?.dataset.name||'Trusted contact',alarmHelp:$('#safetyAlarmHelp').checked,alarmSeconds:+$('#safetyAlarmSeconds').value,autoCalls:$('#safetyAutoCalls').checked,autoCallsConfirmed:$('#safetyAutoConsent').checked,healthcareNumber:$('#safetyHealthcare').value,healthcareName:healthcare?.dataset.name||'Healthcare contact',graceMinutes:+$('#safetyGrace').value});$('#safetyStatusText').textContent='Starting visible safety session…';setTimeout(safe(refreshSafety),500)});
const stopSafety=safe(async()=>{await native('safetyStop');await refreshSafety()});$('#safetyStop').onclick=stopSafety;$('#safetyStopQuick').onclick=stopSafety;$('#safetyOkay').onclick=safe(async()=>{await native('safetyAcknowledge');await refreshSafety()});$('#safetyTest').onclick=safe(async()=>{await native('safetyCheckNow');await refreshSafety()});$('#safetyHelp').onclick=safe(async()=>{const selected=$('#safetyTrusted').selectedOptions[0];await quiet();await native('callContact',{name:selected?.dataset.name||'Trusted contact',number:safetyState.contactNumber||$('#safetyTrusted').value||safetyNumber})});setInterval(()=>{if(T&&!document.hidden)safe(refreshSafety)()},2000);

let safetyActivityAt=0;for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{if(T&&safetyState.active&&safetyState.state!=='monitoring'&&Date.now()-safetyActivityAt>1000){safetyActivityAt=Date.now();safe(async()=>{await native('safetyAcknowledge');await refreshSafety()})()}},{passive:true});

// Day Book is display-only; foreground refresh never triggers unsolicited speech.
setInterval(()=>{if(T&&prefs.onboarded&&!document.hidden&&navigator.onLine) safe(()=>daybookUI.refresh(false))()},15*60000);

let auditInFlight=false;
async function scanReadableResources(){
 if(auditInFlight)return;auditInFlight=true;const status=$('#resourceSummary');status.textContent='Scanning readable folders…';
 try{const report=await call('vce_scan_local_resources');status.textContent=`${report.files.length} candidates · ${report.scanned} directories · ${report.denied} unavailable or restricted paths.`;
 $('#resourceRows').replaceChildren();for(const row of report.files.slice(0,60)){const x=document.createElement('div');x.className='book-event';x.textContent=`${row.name} · ${row.kind} · ${row.location}`;$('#resourceRows').append(x)}
 }catch(e){status.textContent='Resource scan unavailable: '+String(e?.message||e)}finally{auditInFlight=false}
}
$('#scanResources').onclick=safe(scanReadableResources);

// Discovery Cinema shares the established video player, native link routing, and Buddy conversation.
setupDiscoveryCinema({root:document.querySelector("#videoWidget"),video:document.querySelector("#vplayer"),fileInput:document.querySelector("#videoFile"),openLink:url=>native("openLink",{url}),askBuddy:question=>{go("home");return ask(question)},notify:notice,quiet:()=>!!prefs.quietMode});

// Daily briefing is visible on the main conversation page and starts reading immediately.
let briefingParts=[],briefingIndex=0;
function showBriefingPart(){
 $('#briefingText').textContent=briefingParts[briefingIndex];
 $('#briefingContinue').disabled=briefingIndex>=briefingParts.length-1;
}
async function startDailyBriefing(){
 await quiet();go('home');revealPane($('#startBriefing'));
 const ticket=++epoch;busy=true;
 try{
  await refreshPanels();
  if(prefetchOn)await refreshLocationNews();
  if(ticket!==epoch)return;
  const headlines=readingText(selectedNews(dedupNews(),{tab:'National',topic:'All',region,city:prefs.city||'',limit:5}));
  briefingParts=[brief.weather,brief.schedule,headlines||'No verified headlines for your selected place are available yet.',brief.markets].filter(Boolean);
  briefingIndex=0;$('#briefingSession').hidden=false;revealPane($('#briefingSession'));
  for(let index=0;index<briefingParts.length&&ticket===epoch;index++){
   briefingIndex=index;showBriefingPart();await speak(briefingParts[index],ticket);
  }
 }finally{if(ticket===epoch){busy=false;orb('idle')}}
}
$('#startBriefing').onclick=safe(startDailyBriefing);
$('#briefingListen').onclick=safe(async()=>{await quiet();await speak(briefingParts[briefingIndex])});
$('#briefingContinue').onclick=safe(async()=>{await quiet();if(briefingIndex<briefingParts.length-1){briefingIndex++;showBriefingPart();await speak(briefingParts[briefingIndex])}});
$('#briefingStop').onclick=safe(async()=>{await quiet();$('#briefingSession').hidden=true});
async function launchCompanionship(firstRun=false,resume=false){
 if(!T||document.hidden||(resume&&!companionSession.canResume())||!$('#player').paused||!$('#vplayer').paused)return;
 if(launchedGreeting&&!resume&&!firstRun&&busy)await quiet();
 launchedGreeting=true;
 if(firstRun)companionSession.question();else companionSession.resetPrompt();
 const text=companionSession.greeting(firstRun);greeting();say('b',text,'Buddy greeting');
 if(firstRun)$('#hello').textContent=text;
 briefingOffered=!firstRun;
 if(prefs.quietMode)return;
 const ticket=++epoch;busy=true;
 try{
  voiceActivated=true;await speak(text,ticket);
  if(ticket===epoch&&prefs.autoChatter){
   setChat(true);busy=false;setTimeout(()=>{if(ticket===epoch&&chatMode&&!document.hidden)listen()},400);
  }
 }finally{if(ticket===epoch){busy=false;orb('idle')}}
}
async function learnFromConversation(text){
 const answer=companionSession.answer(text);
 if(!answer||answer.declined)return answer;
 const consents=await call('vce_consents');
 if(!['local_memory','learn_interests'].every(p=>consents.some(c=>c.purpose===p&&c.granted)))return answer;
 const current=await call('vce_user_info');
 const rows=current[answer.field]||[];
 if(!rows.some(value=>value.toLowerCase()===answer.value.toLowerCase())){
  current[answer.field]=[...rows,answer.value].slice(-40);current['chat_'+answer.field]=[...(current['chat_'+answer.field]||[]),answer.value].slice(-40);await call('vce_save_user_info',{value:current});info=current;
  if(answer.field==='interests')safe(prefetchInterestTopics)();
 }
 return answer;
}
const topicPrefetchAt=new Map();let topicPrefetchBudget=[];
async function prefetchInterestTopics(){
 if(!prefetchOn||document.hidden)return;
 const topics=(info.interests||[]).filter(t=>t.length<=48&&t.split(/\s+/).length<=6&&!/[@\d]|\b(my|wife|husband|daughter|son|family|medical|medicine|address|password)\b/i.test(t)).slice(-2);
 if(!topics.length)return;
 for(const topic of topics){
  if(!prefetchOn||document.hidden)return;
  const key=topic.toLowerCase(),now=Date.now();
  if(now-(topicPrefetchAt.get(key)||0)<6*3600000)continue;
  topicPrefetchBudget=topicPrefetchBudget.filter(time=>now-time<3600000);
  if(topicPrefetchBudget.length>=8)return;
  topicPrefetchAt.set(key,now);topicPrefetchBudget.push(now);
  const params=new URLSearchParams({action:'query',format:'json',prop:'extracts|info',exintro:'1',explaintext:'1',inprop:'url',redirects:'1',titles:topic});
  try{const body=await httpGet('https://en.wikipedia.org/w/api.php?'+params);if(prefetchOn)await call('vce_ingest_lookup',{body})}catch{/* Keep existing verified cached material when offline. */}
 }
}
const musicPlayer = $('#player');
$('#musicPlayPause').onclick = safe(async () => {
  if (!musicPlayer.currentSrc && !musicPlayer.src) { $('#musicPlaybackStatus').textContent = 'Choose a track from your library first.'; return; }
  if (musicPlayer.paused) await musicPlayer.play(); else musicPlayer.pause();
});
function updateMusicTransport() {
  $('#musicPlayPause').textContent = musicPlayer.paused ? 'Play' : 'Pause';
  $('#musicPlayPause').setAttribute('aria-label', musicPlayer.paused ? 'Play music' : 'Pause music');
  $('#musicPlaybackStatus').textContent = musicPlayer.paused ? 'Paused' : 'Playing';
}
for (const event of ['play', 'pause', 'ended']) musicPlayer.addEventListener(event, updateMusicTransport);

function trackTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}
function updateMusicPosition() {
  const duration = musicPlayer.duration;
  $('#musicSeek').disabled = !Number.isFinite(duration) || duration <= 0;
  $('#musicSeek').value = $('#musicSeek').disabled ? 0 : Math.round(musicPlayer.currentTime / duration * 1000);
  $('#musicElapsed').textContent = trackTime(musicPlayer.currentTime);
  $('#musicDuration').textContent = trackTime(duration);
}
$('#musicSeek').oninput = event => {
  if (Number.isFinite(musicPlayer.duration) && musicPlayer.duration > 0) {
    musicPlayer.currentTime = Number(event.target.value) / 1000 * musicPlayer.duration;
    updateMusicPosition();
  }
};
for (const event of ['timeupdate', 'durationchange', 'loadedmetadata', 'emptied']) musicPlayer.addEventListener(event, updateMusicPosition);
musicPlayer.controls = false;
setupSeniorAssistant({prefs,save,ask,go,openSafety:()=>{go('settings');openSettingsPanel('safety');openSafetyPage(0)},openLink:url=>native('openLink',{url}),notify:notice});
setupSwipePages();


const discoverTabs=setupDiscoverTabs({
 select:async key=>{if(key==='Schedule'){go('daybook');return}go('explore');discoverTabs.mark(key);await explore(key)},
 refresh:async key=>{
  if(key==='Schedule'){await daybookUI.refresh(true);return}
  if(!prefetchOn)throw Error('Allow online updates in Consent to refresh live information.');
  if(key==='News'||key==='Markets')await regionalHeadlines.refresh(region,prefs.city,true);
  await runFetch(true,key==='Weather'?'weather':key==='News'?'rss_news':null);
  if(key==='Markets')await marketUI.refresh(true);
  await refreshPanels();renderExplore(key);
 },
 notify:notice
});
renderExplore('News');

$('#onlineMusic').onclick=()=>{const menu=$('#musicSourceMenu');menu.hidden=!menu.hidden;$('#onlineMusic').setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)$('#musicSources').focus()};

async function refreshLocationNews(force=false){
 if(!T)return;
 await refreshStatus();
 if(!prefetchOn){if(view==='explore'&&document.querySelector('[data-view=explore] [data-discover-tab][aria-selected=true]')?.dataset.discoverTab==='News')renderExplore('News');return}
 region=await call('vce_region');
 const place=await call('vce_place');
 prefs.city=place.city||'';
 const key=region+'|'+prefs.city;
 if(prefs.headlineLocation!==key){prefs.newsTab=prefs.city?'Local':'National';prefs.headlineLocation=key;save()}
 const requestLocation=[region,prefs.city,prefs.newsRegion||''];
 await regionalHeadlines.refresh(requestLocation[0],requestLocation[1],force,requestLocation[2]);
 if(requestLocation[0]!==region||requestLocation[1]!==prefs.city)return;
 const active=document.querySelector('[data-view=explore] [data-discover-tab][aria-selected=true]')?.dataset.discoverTab;
 if(view==='explore'&&active==='News')renderExplore('News');
}
window.addEventListener('online',()=>{if(T){safe(()=>launchModelDownload(true))();if(view==='explore')safe(()=>refreshLocationNews(true))()}});
