import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionSession,migrateCompanionPrefs,QUESTION_BANK,greetingText,chatterInstruction} from '../ui/src/companion-session.js';
import {saveSelectedPlace} from '../ui/src/selected-place.js';

test('upgrade removes forced senior mode, preserves Quiet, and honours explicit senior choice',()=>{
 const old={seniorAssistant:true,quietMode:true,chatty:'quiet',autoChatter:false};
 migrateCompanionPrefs(old);assert.equal(old.seniorAssistant,false);assert.equal(old.autoChatter,true);assert.equal(old.quietMode,true);
 const chosen={seniorAssistant:true,seniorOptIn:true};migrateCompanionPrefs(chosen);assert.equal(chosen.seniorAssistant,true);
});
test('question bank is bounded, never cycles asked personal questions, and respects declines',()=>{
 let clock=Date.UTC(2026,10,15,10),prefs={},writes=0;
 const session=createCompanionSession({prefs,save:()=>writes++,now:()=>clock});
 const questions=new Set();
 for(let day=0;day<12;day++){
  for(let i=0;i<4;i++){const question=session.question();if(question){assert(!questions.has(question));questions.add(question);session.answer('A neutral preference');}}
  clock+=86400000;
 }
 assert.equal(questions.size,QUESTION_BANK.length);assert(writes>0);
 const fresh=createCompanionSession({prefs:{},save:()=>{},now:()=>clock});
 fresh.question();assert.equal(fresh.answer('rather not').declined,true);assert.equal(fresh.question(),null);
});
test('only appropriate preferences become topics; questions and private or urgent answers do not',()=>{
 const session=createCompanionSession({prefs:{},save:()=>{}});
 session.question();assert.deepEqual(session.answer('gardening'),{field:'interests',value:'gardening'});
 assert.deepEqual(session.answer('I want to learn painting'),{field:'goals',value:'learn painting'});
 session.question();assert.equal(session.answer('How are you?'),null);
 session.question();assert.equal(session.answer('my password is secret'),null);
});
test('public content rotation survives restart without retaining the utterance',()=>{
 const prefs={};let session=createCompanionSession({prefs,save:()=>{}});
 session.record('A fresh astronomy fact.');session=createCompanionSession({prefs,save:()=>{}});
 assert.equal(session.available('A fresh astronomy fact.'),false);
 assert(!JSON.stringify(prefs).includes('astronomy'));
 assert.match(greetingText('Anu',9),/Good morning, Anu.*daily briefing/);
});

test('delivery history survives more than 240 items and a serialised restart',()=>{
 const prefs={};let session=createCompanionSession({prefs,save:()=>{}});
 for(let index=0;index<600;index++)session.record('Public story number '+index);
 const restored=JSON.parse(JSON.stringify(prefs));
 session=createCompanionSession({prefs:restored,save:()=>{}});
 for(let index=0;index<600;index++)assert.equal(session.available('PUBLIC story number '+index+'!'),false);
 assert.equal(session.available('A new story about a lighthouse'),true);
 assert(!JSON.stringify(restored).includes('Public story'));
});

test('a changed model follow-up cannot recycle the same source story',()=>{
 const prefs={};let session=createCompanionSession({prefs,save:()=>{}});
 session.record('The kite rose in the wind. What inspires you?',{sourceText:'The kite rose in the wind.'});
 session=createCompanionSession({prefs:JSON.parse(JSON.stringify(prefs)),save:()=>{}});
 assert.equal(session.available('The kite rose in the wind.'),false);
 assert.equal(prefs.companionCadence.initiations.length,1);
 const before=prefs.companionCadence.recent.length;
 session.record('The kite rose in the wind.');
 assert.equal(session.available('The kite rose in the wind.'),false);
 assert.equal(prefs.companionCadence.recent.length,before);
});
test('saving Boston while India was selected invokes the real native country command, without GPS',async()=>{
 const calls=[];const invoke=async(command,args)=>{calls.push({command,args});if(command==='vce_region')return args.country;};
 const place=await saveSelectedPlace({input:'Boston, MA, USA',country:'IN',symbols:'^spx',invoke,httpGet:async()=>{throw Error('offline')},online:false});
 assert.equal(place.country,'US');assert.equal(place.city,'Boston');assert.equal(place.region,'New England');
 assert.deepEqual(calls[0],{command:'vce_region',args:{country:'US'}});
 assert.equal(calls.at(-1).command,'vce_set_place');assert.equal(calls.at(-1).args.lat,null);
});
test('selected place wins over a geocoder result in another country and can save during outages',async()=>{
 const calls=[];const invoke=async(command,args)=>{calls.push({command,args});return args?.country;};
 const place=await saveSelectedPlace({input:'Boston, MA, USA',country:'IN',symbols:'',invoke,online:true,
 httpGet:async()=>JSON.stringify({results:[{name:'Boston',country_code:'IN',latitude:1,longitude:1}]})});
 assert.equal(place.country,'US');assert.equal(place.lat,null);
 assert(!calls.some(row=>row.command==='vce_set_region'));
});

test('unanswered questions do not accumulate and passive chatter is capped and can be snoozed',()=>{
 let clock=Date.UTC(2026,10,15,10);const session=createCompanionSession({prefs:{},save:()=>{},now:()=>clock});
 assert(session.question());assert.equal(session.question(),null);
 for(let i=0;i<16;i++)session.record('Public content '+i);
 assert.equal(session.canInitiate(),false);
 clock+=3600001;assert.equal(session.canInitiate(),true);
 session.snooze();assert.equal(session.canInitiate(),false);
 clock+=1800001;assert.equal(session.canInitiate(),true);
});

test('lively chatter starts after a minute, backs off without replies and resumes with engagement',()=>{
 let clock=Date.UTC(2026,10,16,12);const prefs={chatty:'lively'};
 const session=createCompanionSession({prefs,save:()=>{},now:()=>clock});
 assert.equal(session.canInitiate(59999),false);assert.equal(session.canInitiate(60000),true);
 session.record('First conversation starter');clock+=60000;
 assert.equal(session.canInitiate(60000),true);session.record('Second conversation starter');
 clock+=60000;assert.equal(session.canInitiate(60000),false);
 clock+=120000;assert.equal(session.canInitiate(180000),true);
 session.record('Third starter');clock+=180000;session.record('Fourth starter');
 assert.equal(session.delayMs(),600000);
 session.engage();assert.equal(session.delayMs(),60000);
 clock+=60000;assert.equal(session.canInitiate(60000),true);
 prefs.chatty='quiet';assert.equal(session.canInitiate(3600000),false);
});

test('engaged users get frequent relevant questions, without disliked topics or repeated openings',()=>{
 let clock=Date.UTC(2026,10,16,12);const session=createCompanionSession({prefs:{},save:()=>{},now:()=>clock});
 const info={interests:['gardening','astronomy'],dislikes:['astronomy'],goals:[]},questions=[];
 for(let i=0;i<6;i++){
  const text=session.invitation(info);
  if(text){assert(!text.includes('astronomy'));if(text.endsWith('?'))questions.push(text);session.record(text);}
  session.answer('I enjoy gardening');session.engage();clock+=60000;
 }
 assert.equal(questions.length,4);assert.equal(new Set(questions).size,4);
 assert(questions.every(q=>q.includes('gardening')));
});

test('declining questions stops proactive questions while allowing companion observations',()=>{
 const session=createCompanionSession({prefs:{},save:()=>{}});
 session.answer('rather not');assert.equal(session.canAskQuestion(),false);
 for(let i=0;i<6;i++){const text=session.invitation({interests:['painting']});if(text)assert(!text.endsWith('?'));}
});

test('explicit dislikes are learned as dislikes; follow-ups invite sharing with a light touch',()=>{
 const session=createCompanionSession({prefs:{},save:()=>{}});
 assert.deepEqual(session.answer("I don't like noisy comedy"),{field:'dislikes',value:'noisy comedy'});
 assert.deepEqual(session.answer('I WOULD LIKE TO learn pottery'),{field:'goals',value:'learn pottery'});
 const reply=session.followUp({field:'interests',value:'painting'});
 assert(reply.includes('painting'));assert(reply.endsWith('?'));
 const prompt=chatterInstruction('A fresh astronomy discovery.');
 assert(prompt.includes('follow-up question'));assert(prompt.includes('humorous'));assert(prompt.includes('distressed'));
});

test('greetings and medical or harmful goals do not become remembered hobbies or proactive nudges',()=>{
 const session=createCompanionSession({prefs:{},save:()=>{}});
 session.question();assert.equal(session.answer('hello'),null);
 assert.equal(session.answer('I want to stop medication'),null);
 assert.equal(session.answer('I want to kill myself'),null);
});

test('saving a country change preserves the native selection of market defaults and custom symbols',async()=>{
 const calls=[];const invoke=async(command,args)=>{calls.push({command,args});if(command==='vce_region')return 'US';if(command==='vce_place')return {symbols:'^spx,^ndq'};};
 const place=await saveSelectedPlace({input:'Boston, MA, USA',country:'IN',symbols:'^NSEI',invoke,online:false});
 assert.equal(place.symbols,'^spx,^ndq');
});
