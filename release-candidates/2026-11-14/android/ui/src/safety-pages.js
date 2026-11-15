export function setupSafetyPages(root = document) {
  const panel = root.querySelector('#settings-panel-safety');
  const groups = [...panel.querySelectorAll(':scope > details.settings-group')];
  const findGroup = title => groups.find(group => group.querySelector('summary').textContent.trim() === title);
  function card(group) {
    const section = document.createElement('section');
    section.className = 'safety-card';
    if (group.id) section.id = group.id;
    const heading = document.createElement('h3');
    heading.className = 'h6';
    heading.textContent = group.querySelector('summary').textContent;
    section.append(heading, ...group.querySelector('.settings-group-body').childNodes);
    group.replaceWith(section);
    return section;
  }
  const sound = card(findGroup('Sound triggers & timing'));
  const contacts = card(findGroup('Contacts & call escalation'));
  const voice = card(findGroup('Beeper & voice prompts'));
  const limits = card(findGroup('Read safety limits'));
  const support = card(findGroup('Support & emergency details'));
  const pages = ['Status', 'People & response', 'Preferences'].map((title, index) => {
    const page = document.createElement('div');
    page.className = 'safety-page';
    page.setAttribute('role', 'group');
    page.setAttribute('aria-label', title);
    const heading = document.createElement('h3');
    heading.className = 'h5';
    heading.textContent = title;
    page.append(heading);
    return page;
  });
  const status = panel.querySelector('#safetyMode');
  pages[0].append(status, limits);
  pages[1].append(contacts, support);
  pages[2].append(sound);
  const advanced = document.createElement('details');
  advanced.className = 'safety-advanced';
  advanced.innerHTML = '<summary>Advanced settings</summary>';
  advanced.append(voice);
  // Detailed escalation timing remains available in one place.
  for (const id of ['safetyTimeout', 'safetyGrace']) {
    const field = panel.querySelector('#' + id) || pages[1].querySelector('#' + id) || pages[2].querySelector('#' + id);
    const label = root.querySelector('label[for="' + id + '"]') ||
      pages[1].querySelector('label[for="' + id + '"]') || pages[2].querySelector('label[for="' + id + '"]');
    if (label) advanced.append(label);
    advanced.append(field);
  }
  pages[2].append(advanced);
  const preview = document.createElement('p');
  preview.className = 'safety-preview small';
  preview.setAttribute('role', 'status');
  pages[1].prepend(preview);
  function updatePreview() {
    const calls = root.querySelector('#safetyAutoCalls') || pages[1].querySelector('#safetyAutoCalls');
    const granted = root.querySelector('#safetyAutoConsent') || pages[1].querySelector('#safetyAutoConsent');
    preview.textContent = calls.checked && granted.checked
      ? 'After unanswered check-ins and warnings, Buddy attempts your chosen family contact, then your healthcare contact. Calls can be blocked by Android or network conditions.'
      : 'After an unanswered check-in, Buddy alerts on this device. Automatic calls require selected contacts and separate approval.';
  }
  pages[1].addEventListener('change', updatePreview);
  const viewport = document.createElement('div');
  viewport.className = 'safety-viewport';
  for (const page of pages) page.classList.add('swipe-page');
  viewport.append(...pages);
  const toolbar = document.createElement('div');
  toolbar.className = 'safety-toolbar';
  toolbar.innerHTML = '<button type="button" class="btn btn-primary" id="safetyOkayAlways" disabled>I’m OK</button><button type="button" class="btn btn-outline-danger" id="safetyHelpAlways" disabled>Get help</button>';
  toolbar.querySelector('#safetyOkayAlways').onclick = () => root.querySelector('#safetyOkay').click();
  toolbar.querySelector('#safetyHelpAlways').onclick = () => root.querySelector('#safetyHelp').click();
  const navigation = document.createElement('div');
  navigation.className = 'page-controls';
  navigation.innerHTML = '<button type="button" class="btn btn-outline-primary" aria-label="Previous Safety page">‹</button><span role="status"></span><button type="button" class="btn btn-outline-primary" aria-label="Next Safety page">›</button>';
  const tabbar=document.createElement('div');tabbar.className='pane-tabs';tabbar.setAttribute('role','tablist');tabbar.setAttribute('aria-label','Safety pages');
  for(const [i,label] of ['Status','People and response','Preferences'].entries()){
    const button=document.createElement('button');button.type='button';button.className='btn btn-outline-primary';button.textContent=['🛟','👥','⚙'][i];button.title=label;button.setAttribute('aria-label',label);button.setAttribute('role','tab');button.dataset.index=i;button.onclick=()=>select(i);tabbar.append(button);
  }
  navigation.hidden=true;
  panel.append(toolbar,tabbar, viewport,navigation);
  panel.classList.add('safety-pages');
  const [previous, next] = navigation.querySelectorAll('button');
  let index = 0;
  function update() {
    
    previous.disabled = index === 0;
    next.disabled = index === 2;
    navigation.querySelector('span').textContent = pages[index].getAttribute('aria-label') + ' · ' + (index + 1) + ' / 3';
  }
  function select(page) {
    index = page;
    pages.forEach((item,i)=>item.hidden=i!==index);
    for(const button of tabbar.querySelectorAll('button'))button.setAttribute('aria-selected',String(Number(button.dataset.index)===index));
    update();
  }
  previous.onclick = () => select(Math.max(0, index - 1));
  next.onclick = () => select(Math.min(2, index + 1));
  viewport.addEventListener('scroll', update, {passive: true});
  viewport.addEventListener('focusin', event => {
    const page = event.target.closest('.safety-page');
    if (page) select(pages.indexOf(page));
  });
  
  updatePreview();
  select(0);
  return select;
}
