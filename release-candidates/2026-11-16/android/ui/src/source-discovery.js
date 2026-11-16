// Bounded publisher feed discovery, using the user's existing online-content consent.
export const directories=[
 {name:'NASA',url:'https://www.nasa.gov/',group:'fact'},
 {name:'ScienceDaily',url:'https://www.sciencedaily.com/',group:'fact'},
 {name:'Phys.org',url:'https://phys.org/',group:'fact'},
 {name:'The Hindu',url:'https://www.thehindu.com/rssfeeds/',group:'news'},
 {name:'Indian Express',url:'https://indianexpress.com/rss/',group:'news'},
 {name:'Hindustan Times',url:'https://www.hindustantimes.com/rss',group:'news'}
];
export function discoveredFeeds(html,directory){
 const result=[],doc=new DOMParser().parseFromString(html,'text/html');
 for(const node of doc.querySelectorAll('link[href],a[href]')){
  const href=node.getAttribute('href'),type=node.getAttribute('type')||'';
  if(node.tagName==='LINK'&&!/rss|atom/i.test(type))continue;
  if(node.tagName==='A'&&!/\/feed\/?$|\.rss$|rssfeed[^/]*\.(xml|cms)$|\/rss[^/]*\.xml$/i.test(href||''))continue;
  try{const url=new URL(href,directory.url),origin=new URL(directory.url).hostname.replace(/^www\./,'');if(url.protocol!=='https:'||url.username||url.password||url.href.length>300||!(url.hostname===origin||url.hostname.endsWith('.'+origin)))continue;
   if(!result.some(r=>r.url===url.href))result.push({name:directory.name+' · '+(node.getAttribute('title')||node.textContent.trim()||'RSS').slice(0,45),url:url.href,group:directory.group});
  }catch{}
  if(result.length===8)break;
 }
 return result;
}
export function usableFeed(body,group){
 const doc=new DOMParser().parseFromString(body,'application/xml');if(doc.querySelector('parsererror'))return false;
 return [...doc.querySelectorAll('item')].slice(0,30).some(item=>{const title=item.querySelector('title')?.textContent?.trim()||'';let summary=item.getElementsByTagName('content:encoded')[0]?.textContent||item.querySelector('description')?.textContent||'';summary=new DOMParser().parseFromString(summary,'text/html').body.textContent.trim();return summary.length>=45&&title.length>=12&&!summary.toLowerCase().startsWith(title.toLowerCase())&&summary.split(/\s+/).length>=9});
}
export async function discoverSources({httpGet,existing,add,enabled=()=>true,onProgress=()=>{}}){
 let added=0,checked=0,directoriesRead=0;const candidates=[];const used=new Set(existing.map(s=>s.url));const groups={};
 for(const directory of directories){
  try{onProgress('Checking '+directory.name);const page=await httpGet(directory.url);directoriesRead++;const rows=discoveredFeeds(page,directory);candidates.push(...rows);for(const row of rows.slice(0,2)){if(used.has(row.url)||existing.length+added>=40||(groups[row.group]||0)>=2||!enabled(row.group))continue;checked++;if(!usableFeed(await httpGet(row.url),row.group))continue;await add(row);used.add(row.url);groups[row.group]=(groups[row.group]||0)+1;added++}}catch{/* One unavailable publisher must not stop the other sources. */}
 }
 return {added,checked,candidates,directoriesRead};
}
