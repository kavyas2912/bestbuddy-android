const TOPICS = [['News','📰','news'],['Markets','📈','market'],['Weather','⛅','weather'],['Schedule','🗓','daybook'],['Fun fact','💡','discovering'],['Story','📖','watching'],['Joke','☺','discovering'],['Science','⚗','learning'],['Technology','⚙','working'],['History','⌛','learning'],['Anecdote','💬','watching']];
export function setupDiscoverTabs({select,refresh,notify}) {
  const hosts=[document.querySelector('[data-view=explore]'),document.querySelector('[data-view=daybook]')];
  const information = new Set(['News','Markets','Weather','Schedule']);
  let active='News';
  for(const host of hosts){
    if(host.dataset.view==='daybook'){const content=document.createElement('div');content.className='tab-page';content.append(...host.childNodes);host.append(content)}
    const bar=document.createElement('div');bar.className='pane-tabs discover-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Discover');
    const ideas=document.createElement('div');ideas.className='pane-tabs discover-ideas';ideas.setAttribute('role','tablist');ideas.setAttribute('aria-label','Discover ideas');
    for(const [key,icon] of TOPICS){
      const button=document.createElement('button');button.type='button';button.className='btn btn-outline-primary';button.textContent=icon;button.title=key==='Schedule'?'My Day':key;button.setAttribute('aria-label',button.title);button.setAttribute('role','tab');button.dataset.discoverTab=key;
      button.onclick=()=>Promise.resolve(select(key)).catch(notify);(information.has(key)?bar:ideas).append(button);
    }
    const more=document.createElement('button');more.type='button';more.className='btn btn-outline-primary';more.textContent='💡';more.title='Stories, facts and ideas';more.setAttribute('aria-label',more.title);more.setAttribute('role','tab');more.dataset.discoverIdeas='';
    more.onclick=()=>Promise.resolve(select('Fun fact')).catch(notify);bar.append(more);
    const button=document.createElement('button');button.type='button';button.className='btn btn-outline-primary';button.textContent='↻';button.setAttribute('aria-label','Refresh current pane');button.title='Refresh';
    button.onclick=async()=>{button.disabled=true;try{await refresh(host.dataset.view==='daybook'?'Schedule':active)}catch(e){notify(e)}finally{button.disabled=false}};
    bar.append(button);
    const banner=document.createElement('div');banner.className='pane-heading';banner.innerHTML='<img alt="" width="58" height="58"><h2 class="h5"></h2>';
    host.prepend(bar,ideas,banner);
  }
  function mark(key){
    active=key;
    for(const host of hosts){
      const current=host.dataset.view==='daybook'?'Schedule':active;
      const showIdeas=TOPICS.some(row=>row[0]===current)&&!information.has(current);
      host.querySelector('.discover-ideas').hidden=!showIdeas;
      host.querySelector('[data-discover-ideas]').setAttribute('aria-selected',String(showIdeas));
      for(const button of host.querySelectorAll('[data-discover-tab]'))button.setAttribute('aria-selected',String(button.dataset.discoverTab===current));
      const topic=TOPICS.find(row=>row[0]===current)||TOPICS[0];
      host.querySelector('.pane-heading img').src=['news','market','weather','daybook'].includes(topic[2])?'assets/macaw/pose-'+topic[2]+'.png':'assets/macaw/red-macaw-clean.png';
      host.querySelector('.pane-heading h2').textContent=current==='Schedule'?'My Day':current==='Markets'?'Market Watch':current;
    }
  }
  document.querySelector('[data-view=explore]>.discovery-actions').hidden=true;
  document.querySelector('[data-view=explore]>.explore-compact').hidden=true;
  mark(active);
  return {mark};
}
