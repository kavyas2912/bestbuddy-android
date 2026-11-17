export function setupSettingsNavigation(root=document){
 const tabs=[...root.querySelectorAll('[data-settings-tab]')],panels=[...root.querySelectorAll('[data-settings-panel]')];
 function select(key,{focus=false}={}){
  if(!tabs.some(t=>t.dataset.settingsTab===key))return;
  for(const tab of tabs){const active=tab.dataset.settingsTab===key;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus()}
  for(const panel of panels)panel.hidden=panel.dataset.settingsPanel!==key;
 }
 for(const tab of tabs){tab.onclick=()=>select(tab.dataset.settingsTab);tab.onkeydown=e=>{const index=tabs.indexOf(tab);let next;if(e.key==='ArrowRight')next=(index+1)%tabs.length;else if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(e.key==='ArrowDown'||e.key==='ArrowUp')next=(index+2)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();select(tabs[next].dataset.settingsTab,{focus:true})}}
 for(const group of root.querySelectorAll('.settings-group'))group.addEventListener('toggle',()=>{if(!group.open)return;const panel=group.closest('[data-settings-panel]');for(const other of panel.querySelectorAll(':scope > .settings-group'))if(other!==group)other.open=false});
 select('profile');return select;
}
