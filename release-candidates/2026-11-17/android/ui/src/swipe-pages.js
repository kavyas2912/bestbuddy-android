function tabPages(host, pages, labels) {
  const bar = document.createElement('div');
  bar.className = 'pane-tabs';
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-label', host.dataset.view || 'Preferences');
  const buttons = pages.map((page, index) => {
    const [icon, name] = labels[index] || ['●', 'Page ' + (index + 1)];
    const button = document.createElement('button');
    button.type = 'button';button.className = 'btn btn-outline-primary';
    button.textContent = icon;button.title = name;button.setAttribute('aria-label', name);
    button.setAttribute('role', 'tab');
    button.id = 'pane-tab-' + tabPages.counter++;
    page.id ||= button.id + '-panel';
    button.setAttribute('aria-controls', page.id);
    page.setAttribute('role', 'tabpanel');
    page.setAttribute('aria-labelledby', button.id);
    button.onclick = () => select(index);
    button.onkeydown = event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % pages.length;
      else if (event.key === 'ArrowLeft') next = (index + pages.length - 1) % pages.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = pages.length - 1;
      else return;
      event.preventDefault();select(next);buttons[next].focus();
    };
    bar.append(button);
    return button;
  });
  function select(index) {
    pages.forEach((page, i) => {
      page.hidden = i !== index;
      buttons[i].setAttribute('aria-selected', String(i === index));
      buttons[i].tabIndex = i === index ? 0 : -1;
    });
  }
  // Existing shortcuts and conversation autoscroll can reveal another tab.
  host.addEventListener('revealpane', event => {
    const index = pages.findIndex(page => page === event.target || page.contains(event.target));
    if (index >= 0) select(index);
  });
  host.prepend(bar);
  select(0);
}
tabPages.counter = 0;
export function revealPane(element) {
  element?.dispatchEvent(new Event('revealpane', {bubbles:true}));
}
export function setupSwipePages(root = document) {
  const settingsIcons={profile:'👤',permissions:'🛡',safety:'🛟',models:'🧠'};
  for(const button of root.querySelectorAll('[data-settings-tab]')){
    const name=button.textContent.trim();button.setAttribute('aria-label',name);button.title=name;button.textContent=settingsIcons[button.dataset.settingsTab];
  }
  for(const [index,intro] of [...root.querySelectorAll('[data-view=media]>.section-intro')].entries()){
    const image=document.createElement('img');image.src='assets/macaw/pose-'+(index===0?'music':'video')+'.png';image.alt='';image.width=58;image.height=58;image.className='media-macaw';intro.prepend(image);
  }

  for (const section of root.querySelectorAll('[data-view]')) {
    if (section.dataset.view === 'settings' || section.dataset.view === 'explore' || section.dataset.view === 'daybook') continue;
    const children = [...section.children], pages = [];
    let page;
    for (const child of children) {
      const boundary = !page ||
        (section.dataset.view === 'home' && (child.matches('.home-shortcuts') || child.matches('.upcoming-card'))) ||
        (section.dataset.view === 'media' && child.matches('.section-intro, h6'));
      if (boundary) {page=document.createElement('div');page.className='tab-page';pages.push(page)}
      page.append(child);
    }
    if (section.dataset.view === 'home') {
      const actions = pages.map(page=>page.querySelector('.voice-actions')).find(Boolean);
      for (const id of ['voiceChat','quiet']) {
        const control=actions.querySelector('#'+id);
        if(control)pages[0].querySelector('.talk-stage').append(control);
      }
    }
    if(section.dataset.view==='media' && pages.length===3){const photos=pages.splice(1,1)[0];pages.push(photos)}
    if(section.dataset.view==='home'){const briefing=pages.map(page=>page.querySelector('#startBriefing')).find(Boolean);if(briefing)pages[0].prepend(briefing);for(const id of ['briefingSession','voiceNotice','chat']){const element=pages.map(page=>page.querySelector('#'+id)).find(Boolean);if(element)pages[0].append(element);}}
    section.append(...pages);
    tabPages(section,pages,section.dataset.view==='media'
      ? [['♫','Music'],['▶','Video'],['▧','Photos']]
      : [['🦜','Conversation'],['☀','Daily highlights'],['🗓','Upcoming events']]);
  }
  const profile = root.querySelector('#settings-panel-profile');
  const groups = [...profile.querySelectorAll(':scope > details.settings-group')];
  const overview=document.createElement('div');overview.className='tab-page';
  for(const node of [...profile.children])if(!groups.includes(node))overview.append(node);
  const pages=[overview];
  for(const group of groups){
    const page=document.createElement('div');page.className='tab-page';
    const heading=document.createElement('h3');heading.className='h6';heading.textContent=group.querySelector('summary').textContent;
    page.append(heading,...group.querySelector('.settings-group-body').childNodes);group.replaceWith(page);pages.push(page);
  }
  profile.prepend(overview);
  tabPages(profile,pages,[['🦜','Assistant profile'],['◎','Operating profile preview'],['👤','Personal details'],['◐','Appearance'],['🎙','Voice'],['↻','Content and prefetch'],['⇄','Connections'],['▤','Local resources'],['⚙','My data']]);
}
