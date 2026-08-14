/* StopFlow 0.8.0 — Général structuré par usage, sans modifier les permissions ni les actions. */
(function(){
  if(window.stopflow080GeneralUx?.active)return;

  const QUICK_IDS=new Set([
    'direct:ideas.share',
    'scoped:orders.manage',
    'scoped:alerts.view'
  ]);
  const APP_IDS=new Set(['installation']);

  let scheduled=false;

  function injectStyles(){
    if(document.getElementById('stopflow080GeneralUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080GeneralUxStyles';
    style.textContent=`
      #sf70ZonePage.sf80-general-mode .sf80-general-groups{display:grid;gap:18px}
      #sf70ZonePage.sf80-general-mode .sf80-general-group{display:grid;gap:10px}
      #sf70ZonePage.sf80-general-mode .sf80-general-group-head{display:flex;align-items:end;justify-content:space-between;gap:12px;padding:0 2px}
      #sf70ZonePage.sf80-general-mode .sf80-general-group-head h3{margin:0;font-size:16px;line-height:1.2;color:var(--text)}
      #sf70ZonePage.sf80-general-mode .sf80-general-group-head p{margin:2px 0 0;font-size:12px;color:var(--muted)}
      #sf70ZonePage.sf80-general-mode .sf80-general-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      #sf70ZonePage.sf80-general-mode .sf80-general-group-app .sf80-general-grid{grid-template-columns:minmax(0,360px)}

      @media(max-width:950px){
        #sf70ZonePage.sf80-general-mode .sf80-general-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }

      @media(max-width:620px){
        #sf70ZonePage.sf80-general-mode .sf70-zone-head{margin-bottom:14px}
        #sf70ZonePage.sf80-general-mode .sf80-general-groups{gap:17px}
        #sf70ZonePage.sf80-general-mode .sf80-general-group{gap:8px}
        #sf70ZonePage.sf80-general-mode .sf80-general-group-head{align-items:start}
        #sf70ZonePage.sf80-general-mode .sf80-general-group-head h3{font-size:15px}
        #sf70ZonePage.sf80-general-mode .sf80-general-group-head p{font-size:11px;line-height:1.3}
        #sf70ZonePage.sf80-general-mode .sf80-general-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px}
        #sf70ZonePage.sf80-general-mode .sf80-general-group-app .sf80-general-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        #sf70ZonePage.sf80-general-mode .sf70-action-card{min-height:116px!important;padding:13px 12px 12px 14px;gap:7px}
        #sf70ZonePage.sf80-general-mode .sf70-card-description{display:none}
        #sf70ZonePage.sf80-general-mode .sf70-card-title{font-size:14px;line-height:1.18;overflow-wrap:anywhere}
        #sf70ZonePage.sf80-general-mode .sf70-card-meta{margin-top:auto;justify-content:flex-end}
        #sf70ZonePage.sf80-general-mode .sf70-card-meta > span:first-child{display:none}
      }
    `;
    document.head.appendChild(style);
  }

  function makeGroup(className,title,description){
    const section=document.createElement('section');
    section.className=`sf80-general-group ${className}`;
    const head=document.createElement('div');
    head.className='sf80-general-group-head';
    const text=document.createElement('div');
    const h3=document.createElement('h3');
    h3.textContent=title;
    const p=document.createElement('p');
    p.textContent=description;
    text.append(h3,p);
    head.append(text);
    const grid=document.createElement('div');
    grid.className='sf80-general-grid';
    section.append(head,grid);
    return {section,grid};
  }

  function enhance(){
    injectStyles();
    const page=document.getElementById('sf70ZonePage');
    if(!page)return;
    const title=(page.querySelector('.sf70-zone-head h2')?.textContent||'').trim();
    if(title!=='Général'){
      page.classList.remove('sf80-general-mode');
      return;
    }

    page.classList.add('sf80-general-mode');
    if(page.querySelector(':scope > .sf80-general-groups'))return;

    const sourceGrid=page.querySelector(':scope > .sf70-card-grid');
    if(!sourceGrid)return;
    const cards=[...sourceGrid.querySelectorAll(':scope > .sf70-action-card')];
    if(!cards.length)return;

    const groups=document.createElement('div');
    groups.className='sf80-general-groups';

    const quick=makeGroup('sf80-general-group-quick','Actions & suivi','Les fonctions à consulter ou utiliser le plus souvent.');
    const manage=makeGroup('sf80-general-group-manage','Gestion','Configuration, contrôles et administration selon vos droits.');
    const app=makeGroup('sf80-general-group-app','Application','Installation et accès à StopFlow.');

    cards.forEach(card=>{
      const id=card.dataset.sf70Card||'';
      if(QUICK_IDS.has(id))quick.grid.appendChild(card);
      else if(APP_IDS.has(id))app.grid.appendChild(card);
      else manage.grid.appendChild(card);
    });

    [quick,manage,app].forEach(group=>{
      if(group.grid.children.length)groups.appendChild(group.section);
    });

    sourceGrid.replaceWith(groups);
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      enhance();
    });
  }

  const observer=new MutationObserver(schedule);
  if(document.body)observer.observe(document.body,{subtree:true,childList:true});

  window.stopflow080GeneralUx={active:true,version:'0.8.0',refresh:schedule};
  schedule();
  [100,300,800,1600].forEach(delay=>setTimeout(schedule,delay));
})();
