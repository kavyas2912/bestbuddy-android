// BestBuddy V1.07.5 — pure news ranking and selection, no fabricated headlines.
export const NEWS_TABS=['World','National','Regional','Local','Misc'];
export const NEWS_TOPICS=['All','Breaking','Sports','Culture','Business','Science & Tech'];
export function newsTopic(n){
 const t=`${n.title||''} ${n.summary||''} ${n.topic||''}`.toLowerCase();
 // A breaking headline remains in its subject topic; Breaking is an additional filter.
 if(/\b(sports?|cricket|football|tennis|olympic|hockey|athlet|ipl|world cup|match|tournament)\b/.test(t)) return 'Sports';
 if(/\b(cultur|art|music|book|literatur|museum|film|festival|theatre|theater|heritage)\b/.test(t)) return 'Culture';
 if(/\b(business|market|stock|finance|econom|trade|invest|banking|shares|indices)\b/.test(t)) return 'Business';
 if(/\b(science|technology|tech|research|space|nasa|ai|software|robot|climate|computing)\b/.test(t)) return 'Science & Tech';
 return 'General';
}
export function newsTab(n,region='IN',city=''){
 if(n.scopeCountry&&n.scopeCountry!==region)return 'Excluded';
 if(n.scopeCountry===region&&n.scope){if(n.scope==='Local'&&String(n.scopeCity||'').trim().toLowerCase()===String(city||'').trim().toLowerCase())return 'Local';if(n.scope==='National'||n.scope==='World'||n.scope==='Regional'||n.scope==='Misc')return n.scope;}
 const topic=String(n.topic||'').toLowerCase(),content=`${n.title||''} ${n.summary||''}`.toLowerCase();
 const c=city.trim().toLowerCase(),code=region.toUpperCase();
 if(c&&new RegExp(`(^|[^\\p{L}])${c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^\\p{L}]|$)`,'iu').test(content))return 'Local';
 if(topic===`country:${code.toLowerCase()}`||topic===`country:${code}`.toLowerCase())return 'National';
 try{const name=new Intl.DisplayNames(['en'],{type:'region'}).of(code);if(name&&name.toLowerCase()!==code.toLowerCase()&&content.includes(name.toLowerCase()))return 'National';}catch{}
 if(['business','science','technology','culture','sports','markets'].some(w=>topic.includes(w)))return 'Misc';
 return 'World';
}
export function selectedNews(news,{tab='World',topic='All',region='IN',city='',limit=0}={}){
 const rows=(news||[]).filter(n=>newsTab(n,region,city)===tab&&(topic==='All'||(topic==='Breaking'?!!n.breaking:newsTopic(n)===topic)));
 rows.sort((a,b)=>(Number(!!b.breaking)-Number(!!a.breaking))||((Date.parse(b.published)||0)-(Date.parse(a.published)||0)));
 return limit?rows.slice(0,limit):rows;
}
export function readingText(rows){return (rows||[]).slice(0,5).map((n,i)=>`${i+1}. ${n.title}. ${n.summary||''}`).join('\n\n')}
