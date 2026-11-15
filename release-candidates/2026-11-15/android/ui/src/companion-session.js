export const QUESTION_BANK = [
 ['interests','What do you enjoy doing when you have a little time to yourself?'],
 ['interests','Is there a hobby you would enjoy making more time for?'],
 ['goals','Is there one small thing you would like to make progress on this week?'],
 ['likes','What kind of music usually lifts your spirits?'],
 ['interests','What topic could you happily talk about for ages?'],
 ['likes','Do you prefer a witty joke, a curious fact, or a short story?'],
 ['interests','Is there something you have always wanted to learn?'],
 ['goals','Would you like company while you plan a small creative project?'],
 ['likes','What sort of books or stories do you enjoy?'],
 ['interests','Do you enjoy making things, exploring ideas, or being outdoors?'],
 ['likes','Would you enjoy more science, nature, history, or something else?'],
 ['goals','Is there a hobby project you would like a gentle nudge about?'],
 ['interests','What have you been curious about lately?'],
 ['likes','What kind of films do you enjoy?'],
 ['likes','Do you like a little wordplay in our conversations?'],
 ['interests','Is there a skill you would like to practise together?'],
 ['goals','What would make today feel satisfying for you?'],
 ['likes','Would you prefer shorter chats or a little more detail?'],
 ['interests','What do you enjoy reading or watching in your spare time?'],
 ['likes','Would you enjoy the occasional interesting anecdote?'],
 ['goals','Is there a small first step you have been meaning to take?'],
 ['interests','Which subject would you like me to bring you fresh discoveries about?'],
 ['likes','Is there a favourite kind of story you would like to hear more often?'],
 ['goals','Would a few minutes of planning help with anything on your mind?']
].map(([field,text],index)=>({id:'getting-to-know-'+index,field,text}));

export function migrateCompanionPrefs(prefs) {
  if (prefs.companionDefaultsVersion !== 117) {
    if (prefs.seniorOptIn !== true) prefs.seniorAssistant = false;
    if (prefs.proactiveOptOut !== true) {prefs.autoChatter=true;prefs.chatty='lively';}
    prefs.companionDefaultsVersion=117;
  }
  return prefs;
}
export function greetingText(name, hour, firstRun=false) {
  const part=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
  const who=name && name.toLowerCase()!=='friend'?', '+name:'';
  return part+who+'! '+(firstRun
    ? "I'm Buddy. What do you enjoy chatting about? We can get to know each other at your pace."
    : 'It is good to have your company. Would you like your daily briefing, or shall we have a little chat?');
}
export function contentKey(text) {
  let value=2166136261;
  for(const ch of String(text).toLowerCase().replace(/[^\p{L}\p{N}]/gu,''))value=Math.imul(value^ch.codePointAt(0),16777619);
  return (value>>>0).toString(16);
}
const unsafeForNudges=/\b(?:kill|die|harm|suicid\w*|overdose|medicat\w*|medicine|dosage|diagnos\w*|therapy|blood pressure|fasting|weight loss|bomb|weapon|attack|abuse|fraud|steal|hack|end my life|emergency|bleeding|chest pain)\b/i;
export function createCompanionSession({prefs,save,now=()=>Date.now()}) {
  let pending=null, pausedUntil=0, snoozeUntil=0, lastAt=0, turn=0;
  const state=prefs.companionCadence||{questions:[],recent:[],day:'',dailyQuestions:0};
  prefs.companionCadence=state;
  function available(text) {return !state.recent.includes(contentKey(text));}
  return {
    greeting(firstRun=false){lastAt=now();return greetingText(prefs.name,new Date(now()).getHours(),firstRun);},
    canResume(){return now()-lastAt>15*60000;},
    snooze(){snoozeUntil=now()+30*60000;pending=null;},
    canInitiate(){state.initiations=(state.initiations||[]).filter(time=>now()-time<3600000);return now()>=snoozeUntil&&state.initiations.length<8;},
    resetPrompt(){pending=null;},
    pauseQuestions(){pending=null;pausedUntil=now()+6*3600000;},
    question(){
      const day=new Date(now()).toLocaleDateString();
      if(state.day!==day){state.day=day;state.dailyQuestions=0;}
      if(pending || now()<pausedUntil || state.dailyQuestions>=3)return null;
      const row=QUESTION_BANK.find(row=>!state.questions.includes(row.id));
      if(!row)return null; // Never cycle exhausted personal questions back at the user.
      state.questions.push(row.id);state.dailyQuestions++;pending=row;save();return row.text;
    },
    answer(text){
      const prompt=pending;pending=null;
      if(/\b(skip|not now|rather not|private|don't ask|do not ask)\b/i.test(text)){this.pauseQuestions();return {declined:true};}
      // Only deliberate preference/goal statements or short answers to a matching question become topics.
      if(/^(?:hello|hi|hey|thanks|thank you|ok|okay|fine|sure|maybe|good morning|good afternoon|good evening)[.!?]?$/i.test(text.trim()))return null;
      if(/\?$/.test(text.trim())||/^(?:show|open|read|tell|give|play|what|why|how|who|where|when|can|could|please|stop)\b/i.test(text.trim()))return null;
      const explicit=String(text).match(/^\s*I (?:really )?(like|love|enjoy|am interested in|want to|would like to)\s+(.+?)[.!?]?$/i);
      const field=explicit ? (/want|would like/.test(explicit[1])?'goals':'interests') : prompt?.field;
      const value=(explicit?.[2]||text).trim().replace(/[.!?]+$/,'');
      if(unsafeForNudges.test(value)||!field || value.length<3 || value.length>100 ||
        /[@\d]|\b(?:address|password|medical|medicine|diagnos|depress|suicid|hurt|pain|call|remind|weather|briefing|news|yes|no)\b/i.test(value))return null;
      return {field,value};
    },
    invitation(info={}){
      turn++;
      const goals=(info.goals||[]).filter(goal=>!unsafeForNudges.test(goal));
      if(turn%3===0 && goals.length)return 'If it suits you, shall we take one small step toward '+goals[turn%goals.length]+'?';
      if(turn%2===1){const question=this.question();if(question)return question;}
      return null;
    },
    available,
    record(text){state.initiations=(state.initiations||[]).filter(time=>now()-time<3600000);state.initiations.push(now());state.recent.push(contentKey(text));state.recent=state.recent.slice(-240);lastAt=now();save();},
    briefingAnswer(text){return /^(?:yes|yes please|please do|briefing|daily briefing|read (?:my |the )?briefing)[.!?]?$/i.test(text.trim());}
  };
}
