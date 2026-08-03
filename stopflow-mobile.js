/* StopFlow 0.4.0 — adaptation mobile/tablette et installation PWA. */
(function(){
  const isMobile=()=>window.matchMedia('(max-width:950px)').matches;

  function labelTables(root=document){
    if(!isMobile())return;
    root.querySelectorAll('.tablewrap table').forEach(table=>{
      const labels=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
      table.querySelectorAll('tbody tr').forEach(row=>{
        [...row.children].forEach((cell,index)=>cell.setAttribute('data-label',labels[index]||''));
      });
    });
  }

  function simplifyMobileNav(){
    const bar=document.querySelector('.mobilebar');
    if(!bar)return;
    const wanted=['dashboard','history','suggestions','users'];
    [...bar.querySelectorAll('[data-page]')].forEach(btn=>{
      const page=btn.dataset.page;
      btn.style.display=wanted.includes(page)?'block':'none';
      const labels={dashboard:'Accueil',history:'Historique',suggestions:'Idées',users:'Utilisateurs'};
      if(labels[page])btn.textContent=labels[page];
    });
  }

  function observeChanges(){
    const observer=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        mutation.addedNodes.forEach(node=>{
          if(node.nodeType===1)labelTables(node.matches?.('.tablewrap')?node:node);
        });
      }
      labelTables();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function isStandalone(){
    return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  }

  function installBanner(){
    if(!isMobile()||isStandalone()||sessionStorage.getItem('stopflow_install_dismissed'))return;
    const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
    const banner=document.createElement('div');
    banner.className='sf-install-banner';
    banner.innerHTML=`<b>Installer StopFlow</b><p>${ios?'Dans Safari : Partager puis « Sur l’écran d’accueil ».':'Ajoutez StopFlow à votre écran d’accueil pour l’ouvrir comme une application.'}</p><div class="flex"><button class="btn secondary" id="sfInstallHelp">Voir les étapes</button><button class="btn ghost" id="sfInstallClose">Plus tard</button></div>`;
    document.body.appendChild(banner);
    banner.querySelector('#sfInstallClose').onclick=()=>{sessionStorage.setItem('stopflow_install_dismissed','1');banner.remove()};
    banner.querySelector('#sfInstallHelp').onclick=()=>{
      alert(ios?'1. Touchez le bouton Partager de Safari.\n2. Choisissez « Sur l’écran d’accueil ».\n3. Touchez Ajouter.':'Utilisez l’option « Installer l’application » ou « Ajouter à l’écran d’accueil » du navigateur.');
    };
  }

  async function registerServiceWorker(){
    if(!('serviceWorker' in navigator)||location.protocol==='file:')return;
    try{await navigator.serviceWorker.register('/service-worker.js?v=0400')}catch(error){console.warn('StopFlow PWA:',error)}
  }

  function boot(){
    simplifyMobileNav();
    labelTables();
    observeChanges();
    registerServiceWorker();
    setTimeout(installBanner,1600);
    window.addEventListener('resize',()=>{simplifyMobileNav();labelTables()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
