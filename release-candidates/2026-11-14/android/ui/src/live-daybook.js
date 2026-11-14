/** Smart Butler Day Book: date-keyed live providers, read-only calendar subscriptions, private user events.
 * No sample events, guessed festivals or obsolete provider data are ever represented as live.
 * Refresh runs when the app is visible; Android does not guarantee WebView timers while closed.
 */
const KEY='bestbuddy_daybook_v176', MAX_EVENTS=350, DAY=86400000;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey=d=>{const z=x=>String(x).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`};
const validDate=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00');return !Number.isNaN(+d)&&dateKey(d)===s;};
const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');return x&&typeof x==='object'?x:{}}catch{return {}}};
const save=d=>localStorage.setItem(KEY,JSON.stringify(d));
const https=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password&&u.length<1000}catch{return false}};
const text=s=>String(s??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,250);
const escapeICS=s=>String(s||'').replace(/\\n/gi,' ').replace(/\\[,;]/g,m=>m.slice(1)).trim();
function icsDate(s) { const v=String(s||''); const m=v.match(/^(\d{4})(\d{2})(\d{2})/);return m?`${m[1]}-${m[2]}-${m[3]}`:''; }
export function parseICS(body) {
  if(typeof body!=='string'||body.length>3_000_000||!body.includes('BEGIN:VCALENDAR'))throw Error('Not a valid or suitably sized iCalendar file');
  const lines=body.replace(/\r\n?/g,'\n').split('\n');const unfolded=[];
  for(const line of lines){if(/^[ \t]/.test(line)&&unfolded.length)unfolded[unfolded.length-1]+=line.slice(1);else unfolded.push(line)}
  const events=[];let e=null;
  for(const line of unfolded){if(line==='BEGIN:VEVENT'){e={};continue}if(line==='END:VEVENT'){
    if(e&&validDate(e.date)&&e.title){events.push({id:'ics:'+String(e.uid||e.date+e.title).slice(0,160),date:e.date,title:e.title,annual:!!e.annual,kind:'calendar',source:'iCalendar subscription'})}
    e=null;if(events.length>=MAX_EVENTS)break;continue;
  }if(!e)continue;const idx=line.indexOf(':');if(idx<0)continue;const key=line.slice(0,idx).split(';')[0].toUpperCase(),v=line.slice(idx+1);
    if(key==='DTSTART')e.date=icsDate(v);if(key==='SUMMARY')e.title=text(escapeICS(v));if(key==='UID')e.uid=v;if(key==='RRULE'&&/FREQ=YEARLY\b/.test(v))e.annual=true;
  }return events;
}
export function normalizePanchang(data,expectedDate) {
  if(!data||typeof data!=='object'||String(data.date)!==expectedDate||!data.tithi?.name||!data.nakshatra?.name)throw Error('Panchang provider returned incomplete or mismatched date data');
  return {date:expectedDate,city:text(data.city),tithi:text(data.tithi.name),nakshatra:text(data.nakshatra.name),yoga:text(data.yoga?.name),karana:text(data.karana?.name),vara:text(data.vara?.name),sunrise:text(data.sun?.sunrise),sunset:text(data.sun?.sunset),rahu:text(data.muhurta?.rahu_kalam),source:'Nitya Panchangam',url:'https://nityapanchangam.com/api/',retrievedAt:Date.now()};
}
export function normalizeHolidays(data,year) {
 if(!Array.isArray(data))throw Error('Unexpected holiday calendar response');
 return data.filter(x=>validDate(x.date)&&x.date.startsWith(String(year))&&typeof(x.name||x.localName)==='string').slice(0,400).map(x=>({id:'holiday:'+x.date+':'+(x.name||x.localName),date:x.date,title:text(x.localName||x.name),kind:'holiday',source:'Nager.Date holidays',tentative:!!x.tentative}));
}
export function eventForDate(e,date) {if(!e?.date)return false;return e.annual?e.date.slice(5)===date.slice(5):e.date===date;}
export function eventsInRange(items,from,to) { const out=[];for(const e of items){if(e.annual){for(let year=+from.slice(0,4);year<=+to.slice(0,4);year++){const candidate=year+e.date.slice(4);if(validDate(candidate)&&candidate>=from&&candidate<=to)out.push({...e,date:candidate})}}else if(e.date>=from&&e.date<=to)out.push(e)}return out.sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''));}
const when=s=>{const d=new Date(s);return Number.isFinite(+d)?d.toLocaleString():'unknown'};
function statusRec(data,ttl,now=Date.now()){if(!data)return 'not downloaded';return now>=data.at&&now-data.at<=ttl?'verified '+when(data.at):'expired '+when(data.at)}
export function createDaybook({httpGet,engine,getPrefs,onChange=()=>{}}){
 const d=read();d.personal=Array.isArray(d.personal)?d.personal:[];d.panchang=d.panchang||{};d.holidays=d.holidays||{};d.festivals=d.festivals||{};d.ics=d.ics||{};d.subscriptions=Array.isArray(d.subscriptions)?d.subscriptions:[];
 let syncPromise=null,lastError={},busy=false;const persist=()=>{save(d);onChange()};
 const setError=(key,error)=>{lastError[key]=String(error?.message||error).slice(0,180);onChange()};
 function addPersonal({title,date,time='',annual=false,kind='schedule'}) {
  if(!validDate(date)||!text(title)||d.personal.length>=MAX_EVENTS)throw Error('Enter a valid date and title (limit 350 items)');
  if(time&&!/^\d{2}:\d{2}$/.test(time))throw Error('Invalid time');
  const evt={id:'user:'+Date.now()+':'+Math.random().toString(36).slice(2,8),date,title:text(title),time,annual:!!annual,kind,source:'Your Day Book'};
  d.personal.push(evt);persist();return evt;
 }
 function deletePersonal(id){d.personal=d.personal.filter(e=>e.id!==id);persist()}
 function addSubscription(url){if(!https(url))throw Error('Calendar URL must be HTTPS');if(d.subscriptions.includes(url))return; if(d.subscriptions.length>=5)throw Error('Maximum five subscriptions');d.subscriptions.push(url);persist()}
 function removeSubscription(url){d.subscriptions=d.subscriptions.filter(s=>s!==url);delete d.ics[url];persist()}
 function importICS(body,name='Imported calendar') {const events=parseICS(body).map(x=>({...x,source:name}));const id='import:'+text(name);d.ics[id]={at:Date.now(),events,manual:true};persist();return events.length}
 async function syncICS(force=false) {for(const url of d.subscriptions){if(!force&&d.ics[url]&&Date.now()-d.ics[url].at<60*60_000)continue;try{const events=parseICS(await httpGet(url)).map(e=>({...e,source:url}));d.ics[url]={at:Date.now(),events};delete lastError[url];persist()}catch(e){setError(url,e)}}}
async function syncFestivals(force=false){const city=String(getPrefs().city||'').trim().toLowerCase().replace(/[^a-z]/g,'');
  const citySlug=({bangalore:'bengaluru',poona:'pune',bombay:'mumbai'}[city]||city);
  if(!force&&d.festivals[citySlug]&&Date.now()-d.festivals[citySlug].at<24*60*60_000)return;
  try{const raw=JSON.parse(await httpGet('https://shastrapanchangam.com/api/v1/festivals.json'));
   if(!raw||typeof raw.festivals!=='object')throw Error('Invalid festivals response');const events=[];
   for(const [id,fest] of Object.entries(raw.festivals)){
     if(!fest?.published||!Array.isArray(fest.dates))continue;
     const dates=Array.isArray(fest.local_dates?.[citySlug])?fest.local_dates[citySlug]:fest.dates;
     for(const date of dates){if(validDate(date))events.push({id:'festival:'+id+':'+date,date,title:text(fest.en||id),kind:'festival',source:'Shastra Panchangam · '+(fest.local_dates?.[citySlug]?'city':'Delhi reference')})}
   }
   d.festivals[citySlug]={at:Date.now(),events};delete lastError.festivals;persist();
  }catch(e){setError('festivals',e)}
 }
 async function syncHolidays(year,force=false){const country=(getPrefs().country||'IN').toUpperCase();const key=country+':'+year;const old=d.holidays[key];if(!force&&old&&Date.now()-old.at<24*60*60_000)return;
  try{const response=JSON.parse(await httpGet(`https://nagerholidays.com/api/v4/Holidays/${country}/${year}`));const events=normalizeHolidays(response,year);d.holidays[key]={at:Date.now(),events};delete lastError.holidays;persist()}catch(e){setError('holidays',e)}
 }
 async function syncPanchang(date,force=false){const prefs=getPrefs();const city=String(prefs.city||'').trim().toLowerCase().replace(/[^a-z]/g,'');const allowed=['hyderabad','bangalore','chennai','mumbai','delhi','kolkata','pune','ahmedabad','jaipur','newyork','london','singapore','dubai'];
  // A date without a city/coordinates must not be silently computed for Hyderabad.
  const coords=Number.isFinite(+prefs.latitude)&&prefs.latitude!==''&&Number.isFinite(+prefs.longitude)&&prefs.longitude!==''?{lat:+prefs.latitude,lng:+prefs.longitude}:null;
  if(!allowed.includes(city)&&!coords){setError('panchang','Choose a supported city or save its coordinates in Settings.');return}
  const place=coords?`${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`:city;const key=place+':'+date,old=d.panchang[key];if(!force&&old&&Date.now()-old.at<24*60*60_000)return;
  const query=new URLSearchParams({date});if(allowed.includes(city))query.set('city',city);else{query.set('lat',String(coords.lat));query.set('lng',String(coords.lng))}
  try{const result=normalizePanchang(JSON.parse(await httpGet('https://nityapanchangam.com/api/panchangam.php?'+query)),date);d.panchang[key]={at:Date.now(),result};delete lastError.panchang;persist()}catch(e){setError('panchang',e)}
 }
 async function sync(date=dateKey(new Date()),{force=false,week=false,month=false}={}) {if(syncPromise)return syncPromise;
  syncPromise=(async()=>{busy=true;onChange();try{
    const yr=+date.slice(0,4);await Promise.all([syncHolidays(yr,force),syncFestivals(force),syncICS(force),syncPanchang(date,force)]);
    if(week||month){const base=new Date(date+'T12:00:00');if(month)base.setDate(1);const length=month?new Date(base.getFullYear(),base.getMonth()+1,0).getDate():7;for(let i=0;i<length;i+=3){const batch=[];for(let j=i;j<Math.min(i+3,length);j++){const nx=new Date(base.getFullYear(),base.getMonth(),base.getDate()+j,12);const key=dateKey(nx);if(key!==date)batch.push(syncPanchang(key,false));}await Promise.all(batch)}}
  }finally{busy=false;syncPromise=null;persist()}})();return syncPromise;
 }
 function snapshot(date=dateKey(new Date()),mode='day',rustReminders=[]){const base=new Date(date+'T12:00:00'),to=new Date(base);
  if(mode==='week')to.setDate(to.getDate()+6);if(mode==='month')to.setMonth(to.getMonth()+1,0);
  const from=mode==='month'?date.slice(0,8)+'01':date;const end=dateKey(to),year=+date.slice(0,4),country=(getPrefs().country||'IN').toUpperCase();const holidayEntry=d.holidays[country+':'+year];
  const holidayFresh=holidayEntry&&Date.now()-holidayEntry.at<3*86400000;
  const citySlug=({bangalore:'bengaluru'}[String(getPrefs().city||'').toLowerCase()]||String(getPrefs().city||'').toLowerCase()).replace(/[^a-z]/g,'');const festEntry=d.festivals[citySlug];const festFresh=festEntry&&Date.now()-festEntry.at<3*86400000;
  const icsEvents=Object.entries(d.ics).flatMap(([source,e])=>(e.manual||Date.now()-e.at<7*86400000)?e.events:[]);
  const events=[...d.personal,...(holidayFresh?holidayEntry.events:[]),...(festFresh?festEntry.events:[]),...icsEvents,...rustReminders.filter(r=>!r.done&&Number.isFinite(r.due)).map(r=>({id:'rust:'+r.id,date:dateKey(new Date(r.due*1000)),title:r.text,time:new Date(r.due*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),kind:'reminder',source:'Buddy reminder'}))];
  const p=getPrefs(),city=String(p.city||'').toLowerCase().replace(/[^a-z]/g,'');const coords=p.latitude!==''&&p.longitude!==''&&Number.isFinite(+p.latitude)&&Number.isFinite(+p.longitude)?`${(+p.latitude).toFixed(3)},${(+p.longitude).toFixed(3)}`:'';
  const pan=d.panchang[(coords||city)+':'+date];const fresh=pan&&Date.now()-pan.at<24*60*60_000;const periodPanchang=[];for(let dt=new Date(from+'T12:00:00'),stop=new Date(end+'T12:00:00');dt<=stop;dt.setDate(dt.getDate()+1)){const key=dateKey(dt),row=d.panchang[(coords||city)+':'+key];if(row&&Date.now()-row.at<24*60*60_000)periodPanchang.push({date:key,tithi:row.result.tithi,nakshatra:row.result.nakshatra});}
  return {events:eventsInRange(events,from,end),date,end,periodPanchang,panchang:fresh?pan.result:null,panchangStatus:statusRec(pan,24*60*60_000),holidayStatus:statusRec(holidayEntry,3*86400000),festivalStatus:statusRec(festEntry,3*86400000),calendarStatus:d.subscriptions.length?d.subscriptions.map(url=>({url,status:statusRec(d.ics[url],7*86400000)})):[],errors:{...lastError},busy};
 }
 return {addPersonal,deletePersonal,addSubscription,removeSubscription,importICS,sync,snapshot,get subscriptions(){return [...d.subscriptions]},get imports(){return Object.keys(d.ics).filter(x=>x.startsWith('import:'))},get status(){return {...lastError,busy}},clearErrors(){lastError={}}};
}
