import {createDaybook} from './live-daybook.js';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey=d=>{const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const safeUrl=url=>{try{return new URL(url).protocol==='https:'?url:''}catch{return ''}};
export function setupDaybookUI({httpGet,engine,getPrefs}) {
 let mode='day',reminders=[],drawing=false,reminderStatus='';
 const daybook=createDaybook({httpGet,engine,getPrefs,onChange:()=>{if(!drawing)render()}});
 const selected=()=>$('#bookDate').value||dateKey(new Date());
 const render=()=>{drawing=true;try{
   const s=daybook.snapshot(selected(),mode,reminders);
   const upcoming=daybook.snapshot(dateKey(new Date()),'week',reminders).events.filter(x=>['schedule','important','reminder'].includes(x.kind)).slice(0,6);
   $("#homeUpcoming").innerHTML=upcoming.length?upcoming.map(x=>`<div class="book-event"><b>${esc(x.date)}</b> ${esc(x.time||'')} · ${esc(x.title)}</div>`).join(''):'No appointments or important dates in the next seven days.';
   const status=`${reminderStatus?reminderStatus+' · ':''}${s.busy?'Refreshing… · ':''}Panchang: ${s.panchangStatus} · Holidays: ${s.holidayStatus} · Festivals: ${s.festivalStatus}`;
   $('#bookStatus').textContent=status;
   const primary=s.events.filter(e=>e.kind==='reminder'||e.kind==='schedule'||e.kind==='important');
   const others=s.events.filter(e=>!primary.includes(e));
   $('#bookEvents').innerHTML=primary.length?primary.map(x=>`<div class="book-event"><b>${esc(x.date)}</b>${x.time?' · '+esc(x.time):''} · <span>${esc(x.title)}</span>${x.annual?' · ↻ yearly':''}${x.id.startsWith('user:')?` <button type="button" class="btn btn-sm btn-outline-danger" data-remove-event="${esc(x.id)}">Remove</button>`:''}</div>`).join(''):'No upcoming personal events within this view. Add your schedule below.';
   $('#importantDates').innerHTML=others.length?others.map(x=>`<div class="book-event"><b>${esc(x.date)}</b> · ${esc(x.title)} <span class="small opacity-75">${esc(x.source)}</span></div>`).join(''):'No verified holidays or subscribed events in this date range.';
   const p=s.panchang;
   $('#panchang').innerHTML=p?`<div class="pan-grid"><div><b>Tithi</b><span>${esc(p.tithi)}</span></div><div><b>Nakshatra</b><span>${esc(p.nakshatra)}</span></div><div><b>Yoga</b><span>${esc(p.yoga)}</span></div><div><b>Karana</b><span>${esc(p.karana)}</span></div><div><b>Vara</b><span>${esc(p.vara)}</span></div><div><b>Sunrise / sunset</b><span>${esc(p.sunrise)} / ${esc(p.sunset)}</span></div><div><b>Rahu Kalam</b><span>${esc(p.rahu)}</span></div></div><small>For ${esc(p.date)} · ${esc(p.city)} · <a href="${safeUrl(p.url)}" target="_blank" rel="noopener">Nitya Panchangam (CC BY 4.0)</a> · checked ${new Date(p.retrievedAt).toLocaleString()}.</small>`:
     `<p>Live Panchang is not verified for this date and location. ${esc(s.errors.panchang||'Choose a city in Settings and refresh.')}</p><a href="https://www.drikpanchang.com/panchang/day-panchang.html" target="_blank" rel="noopener noreferrer">View external Panchang ↗</a>`;
   const period=document.querySelector('#bookPeriodPanchang');if(period)period.innerHTML=s.periodPanchang.map(x=>`<div class="book-event"><b>${esc(x.date)}</b> · ${esc(x.tithi)} · ${esc(x.nakshatra)}</div>`).join('')||'<p>Awaiting verified daily Panchang data.</p>';$('#bookErrors').textContent=Object.entries(s.errors).map(([k,v])=>k+': '+v).join(' · ').slice(0,650);
   $('#calendarFeeds').innerHTML=daybook.subscriptions.map(u=>`<div class="feed-row"><span title="${esc(u)}">${esc(u)}</span><button class="btn btn-sm btn-outline-danger" data-remove-feed="${esc(u)}">Remove</button></div>`).join('')||'No subscribed calendars. Import a local .ics calendar or add a trusted HTTPS .ics URL.';
   document.querySelectorAll('[data-remove-event]').forEach(b=>b.onclick=()=>daybook.deletePersonal(b.dataset.removeEvent));
   document.querySelectorAll('[data-remove-feed]').forEach(b=>b.onclick=()=>daybook.removeSubscription(b.dataset.removeFeed));
   document.querySelectorAll('[data-period]').forEach(b=>b.classList.toggle('active',b.dataset.period===mode));
 }finally{drawing=false}};
 const refresh=async(force=false)=>{try{reminders=await engine.call('vce_daybook')||[];reminderStatus=''}catch{reminderStatus='Saved native reminders temporarily unavailable';}render();await daybook.sync(selected(),{force,week:mode==='week',month:mode==='month'});render()};
 $('#bookDate').value=dateKey(new Date());$('#bookDate').onchange=()=>refresh(false);
 document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{mode=b.dataset.period;refresh(false)});
 $('#bookRefresh').onclick=()=>refresh(true);
 $('#bookAdd').onsubmit=e=>{e.preventDefault();try{daybook.addPersonal({title:$('#eventTitle').value,date:$('#eventDate').value,time:$('#eventTime').value,annual:$('#annualDate').checked,kind:$('#annualDate').checked?'important':'schedule'});$('#eventTitle').value='';$('#bookEntryError').textContent='Saved locally.';render()}catch(err){$('#bookEntryError').textContent=err.message}};
 $('#eventDate').value=dateKey(new Date());
 $('#calendarSubscribe').onsubmit=e=>{e.preventDefault();try{daybook.addSubscription($('#calendarURL').value.trim());$('#calendarURL').value='';refresh(true)}catch(err){$('#calendarError').textContent=err.message}};
 $('#importCalendar').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>3_000_000)throw Error('The calendar file exceeds 3 MB');const n=daybook.importICS(await f.text(),f.name);$('#calendarError').textContent=`Imported ${n} calendar entries.`;render()}catch(err){$('#calendarError').textContent=err.message}finally{e.target.value=''}};
 $('#dayPrev').onclick=()=>shift(-1);$('#dayNext').onclick=()=>shift(1);
 function shift(amount){const d=new Date(selected()+'T12:00:00');if(mode==='month')d.setMonth(d.getMonth()+amount);else d.setDate(d.getDate()+amount*(mode==='week'?7:1));$('#bookDate').value=dateKey(d);refresh(false)}
 $('#bookToday').onclick=()=>{$('#bookDate').value=dateKey(new Date());refresh(true)};
 return {open:()=>refresh(false),refresh,daybook, render,upcoming:()=>daybook.snapshot(dateKey(new Date()),'week',reminders).events.filter(e=>['important','reminder','schedule'].includes(e.kind)).slice(0,7)};
}
