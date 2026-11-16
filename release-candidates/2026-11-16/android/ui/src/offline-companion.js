// BestBuddy offline companion: bounded, private, deterministic conversation layer.
// No network calls, no unconsented persistent conversation storage.
const ITEMS = Object.freeze({
  science: [
    'A day on Venus lasts longer than its year because Venus rotates very slowly.',
    'Octopuses have three hearts, and their blood uses copper-based hemocyanin.',
    'Sound travels faster through water than through air.'
  ],
  nature: [
    'Honeybees communicate the direction of food using a waggle dance.',
    'Mangrove forests protect coastlines and provide nurseries for marine life.',
    'Some trees share nutrients with neighboring plants through underground fungal networks.'
  ],
  history: [
    'Nalanda was an important center of learning in ancient India.',
    'The Antikythera mechanism is an ancient Greek device used to predict astronomical positions.',
    'The Indian mathematician Aryabhata described sophisticated astronomical calculations.'
  ],
  technology: [
    'GPS receivers use timing signals from satellites to calculate their position.',
    'Modern chips contain billions of transistors working as tiny electronic switches.',
    'Error-correcting codes help protect data sent across noisy communication channels.'
  ],
  jokes: [
    'Why did the computer bring a sweater? It left its Windows open.',
    'Why was the calendar popular? It had so many dates.',
    'I asked my phone for a joke. It said my screen time was the punchline.'
  ],
  questions: [
    'Which place would you most like to revisit, and what makes it special?',
    'What invention has made the biggest difference to your everyday life?',
    'Is there a song that brings back a happy memory?'
  ],
  stories: [
    'A gardener planted a tree whose shade he might never enjoy. Years later, children played beneath it. His quiet gift had become their afternoon.',
    'A young inventor tried the same experiment many times. Each failure taught her one thing to change. The final success began with her patience.',
    'An old traveler kept a small notebook of kind gestures. When asked about his favorite journey, he opened the notebook instead of a map.'
  ]
});
const clean = s => String(s ?? '').normalize('NFKC').toLocaleLowerCase('en').replace(/[’‘]/g,"'").replace(/[^\p{L}\p{N}'\s]/gu,' ').replace(/\s+/g,' ').trim();
const includes = (s, patterns) => patterns.some(p => p.test(s));
export function createOfflineCompanion({name='friend'}={}) {
  let turn=0, previous='', lastTopic='', lastQuestion='';
  const pick = (topic) => {
    const values=ITEMS[topic];
    const index=(turn++ + (topic===lastTopic?1:0))%values.length;
    lastTopic=topic;
    return values[index];
  };
  return {
    respond(input) {
      const text=clean(input);
      if(!text) return null;
      if(includes(text,[/\b(?:stop talking|be quiet|quiet|not now|let me rest)\b/])) return {intent:'quiet',reply:'I will be quiet.'};
      let reply=null, intent='conversation';
      if(/^(?:hello|hi|hey|good morning|good afternoon|good evening)(?: buddy)?$/.test(text)) reply=`Hello${name && name.toLowerCase()!=='friend'?', '+name:''}! Would you enjoy a story, a curious fact, or a chat?`;
      else if(includes(text,[/\b(?:who are you|what is your name|your name)\b/])) reply='I am BestBuddy, your companion for conversation, discoveries and planning your day.';
      else if(includes(text,[/\b(?:thank you|thanks|thankyou)\b/])) reply='You are very welcome. What would you like to explore next?';
      else if(includes(text,[/\b(?:how are you|how do you feel)\b/])) reply='I am ready for a good conversation. How has your day been?';
      else if(includes(text,[/\b(?:what can you do|help me|what should we do)\b/])) reply='We can talk, share a story or joke, explore facts, or look at your day. What sounds good?';
      else if(includes(text,[/\b(?:goodbye|bye|good night|goodnight)\b/])) reply='Until next time. I will be here when you want to talk.';
      else if(includes(text,[/\b(?:tell|share|give|another|more|next)\b.*\b(?:joke|riddle|funny)\b|^(?:joke|another joke)$/])) reply=pick('jokes');
      else if(includes(text,[/\b(?:story|anecdote|tale)\b/])) reply=pick('stories');
      else if(includes(text,[/\b(?:ask me|ask a|question for me|thoughtful question)\b/])) {reply=pick('questions');lastQuestion=reply;}
      else if(includes(text,[/\b(?:fact|interesting|curious|learn something)\b/])) {
        const topic=includes(text,[/\b(?:nature|animal|bird|forest)\b/])?'nature':includes(text,[/\b(?:history|ancient|heritage)\b/])?'history':includes(text,[/\b(?:technology|engineering|computer)\b/])?'technology':'science';
        reply=pick(topic);
      }
      else if(includes(text,[/\b(?:i am sad|i feel sad|feeling lonely|i am lonely)\b/])) reply='I am here to listen. Would you like to tell me what is on your mind, or would a gentle story help?';
      else if(includes(text,[/\b(?:i am happy|i feel happy|good news)\b/])) reply='That sounds lovely. Would you like to share what made your day brighter?';
      else if(lastQuestion && includes(text,[/^(?:yes|no|maybe|i would|i like|my favorite|probably)\b/])) {reply='That is interesting. What makes you feel that way?';lastQuestion='';}
      if(!reply) return null; // Never intercept unknown, time-sensitive, or safety queries.
      if(reply===previous && lastTopic && ITEMS[lastTopic]) reply=pick(lastTopic);
      previous=reply;
      return {intent,reply,tier:'offline-companion'};
    },
    reset(){turn=0;previous='';lastTopic='';lastQuestion='';}
  };
}
