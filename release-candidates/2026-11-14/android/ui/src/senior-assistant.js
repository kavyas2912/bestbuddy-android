import {revealPane} from './swipe-pages.js';
export const SENIOR_TOPICS = [
  {id:'connection', title:'Stay connected', prompt:'Help me plan a social activity',
    reply:'Who would you enjoy speaking with this week? We could plan a short call, a shared hobby, or a visit that fits your energy and preferences. Which would feel most comfortable?',
    source:'WHO · Social connection', url:'https://www.who.int/health-topics/ageing/reducing-social-isolation-and-loneliness-among-older-people'},
  {id:'hobbies', title:'Enjoy a hobby', prompt:'Help me choose a hobby',
    reply:'What have you enjoyed before: music, gardening, reading, crafts, or something else? We can choose one small activity and a time that suits you.',
    source:'NIH National Institute on Aging · Meaningful activities', url:'https://www.nia.nih.gov/health/healthy-aging/participating-activities-you-enjoy-you-age'},
  {id:'sleep', title:'Rest and routine', prompt:'Help me with a sleep routine',
    reply:'A regular bedtime and waking time can help you build a comfortable sleep routine. What is your usual evening like? If sleep difficulties persist or medicines affect your sleep, bring this up with your healthcare professional.',
    source:'NIH National Institute on Aging · Sleep habits',url:'https://www.nia.nih.gov/sites/default/files/2025-02/healthy-sleep-habits-nia.pdf'},
  {id:'meals',title:'Meals and wellbeing',prompt:'Help me plan my meals',
    reply:'Which foods do you enjoy, and do you have dietary instructions from your healthcare professional? We can start with a simple shopping or meal plan that follows those instructions. Difficulties with appetite, chewing, or swallowing deserve a conversation with your healthcare professional.',
    source:'NIH NIDDK · Health tips for older adults',url:'https://www.niddk.nih.gov/health-information/weight-management/healthy-eating-physical-activity-for-life/health-tips-for-older-adults'},
  {id:'activity',title:'Gentle activity',prompt:'Help me plan a gentle activity',
    reply:'What activities feel comfortable for you now? We can consider a familiar activity, a hobby, or spending time with a friend. If you have health concerns, pain, or worries about movement, ask your healthcare professional which activities are suitable.',
    source:'NIH NIDDK · Health tips for older adults',url:'https://www.niddk.nih.gov/health-information/weight-management/healthy-eating-physical-activity-for-life/health-tips-for-older-adults'}
];
export function seniorReply(text) {
  const normalized = String(text).trim().replace(/[.!?]+$/, '').toLowerCase();
  const topic = SENIOR_TOPICS.find(item => item.prompt.toLowerCase() === normalized);
  return topic ? {tier:'senior-knowledge',reply:topic.reply,source:topic.source} : null;
}
export function setupSeniorAssistant({prefs,save,ask,go,openSafety,openLink,notify}) {
  const host = document.querySelector('#seniorHub');
  const enabled = document.querySelector('#seniorEnabled');
  enabled.checked = prefs.seniorAssistant;
  function apply() {
    document.documentElement.dataset.senior = String(prefs.seniorAssistant);
    host.hidden = !prefs.seniorAssistant;
    document.querySelector('.hero-kicker').textContent = prefs.seniorAssistant ? 'SENIOR ASSISTANT' : 'A MOMENT FOR YOURSELF';
    document.documentElement.style.setProperty('--fsx', prefs.seniorAssistant ? Math.max(1.1,prefs.fsx||1) : prefs.fsx||1);
  }
  enabled.onchange = () => {prefs.seniorAssistant=enabled.checked;save();apply()};
  for (const topic of SENIOR_TOPICS) {
    const button=document.createElement('button');
    button.type='button';button.className='btn btn-outline-primary';
    button.textContent=topic.title;
    button.onclick=()=>{go('home');Promise.resolve(ask(topic.prompt)).catch(notify)};
    document.querySelector('#seniorTopics').append(button);
    const link=document.createElement('button');
    link.type='button';link.className='btn btn-sm btn-outline-primary';link.textContent=topic.source;
    link.onclick=()=>Promise.resolve(openLink(topic.url)).catch(notify);
    document.querySelector('#seniorSources').append(link);
  }
  document.querySelector('#seniorRoutine').onclick=()=>go('daybook');
  document.querySelector('#seniorSafety').onclick=openSafety;
  document.querySelector('#seniorTalk').onclick=()=>(revealPane(document.querySelector('#orb')),document.querySelector('#orb').click());
  document.querySelector('#seniorMusic').onclick=()=>{go('media');revealPane(document.querySelector('#musicWidget'));document.querySelector('#musicWidget').scrollIntoView({block:'nearest'})};
  apply();
}
