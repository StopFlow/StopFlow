/* StopFlow 0.8.0 — identification fiable de la version publiée ou preview. */
(function(){
  if(window.stopflow073VersionLabel)return;
  window.stopflow073VersionLabel=true;

  const VERSION='0.8.0';
  const productionHosts=new Set(['stopflow-app.vercel.app']);
  const isProduction=()=>productionHosts.has(location.hostname);
  const loginLabel=()=>isProduction()?`Version ${VERSION}`:`Version ${VERSION} — Preview de développement`;
  const pillLabel=()=>isProduction()?`StopFlow ${VERSION}`:`StopFlow ${VERSION} — Preview`;

  function ensureStyles(){
    if(document.getElementById('stopflow073VersionLabelStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow073VersionLabelStyles';
    style.textContent=`
      .sf73-app-version{
        font-size:11px;
        line-height:1.25;
        letter-spacing:.035em;
        font-weight:700;
        user-select:none;
        pointer-events:none;
      }
      #app>.sidebar>.sf73-app-version{
        position:absolute;
        left:30px;
        right:30px;
        bottom:92px;
        color:#9fb7cf;
        z-index:3;
      }
      #app.sf53-desktop-collapsed>.sidebar>.sf73-app-version{
        display:none!important;
      }
      #sf52Drawer .sf73-app-version{
        display:block;
        margin:0 0 10px 0;
        color:#8190a3;
      }
      @media(max-width:950px){
        #app>.sidebar>.sf73-app-version{display:none!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureAppVersion(){
    const label=pillLabel();

    document.querySelectorAll('.sf72-app-version').forEach(node=>node.remove());

    const sidebar=document.querySelector('#app>.sidebar');
    if(sidebar){
      let version=sidebar.querySelector(':scope>.sf73-app-version');
      if(!version){
        version=document.createElement('div');
        version.className='sf73-app-version';
        const usercard=sidebar.querySelector(':scope>.usercard');
        if(usercard)sidebar.insertBefore(version,usercard);
        else sidebar.appendChild(version);
      }
      if(version.textContent!==label)version.textContent=label;
    }

    const drawerFoot=document.querySelector('#sf52Drawer .sf52-drawer-foot');
    if(drawerFoot){
      let version=drawerFoot.querySelector(':scope>.sf73-app-version');
      if(!version){
        version=document.createElement('div');
        version.className='sf73-app-version';
        const userLine=drawerFoot.querySelector(':scope>.sf52-user-line');
        if(userLine)drawerFoot.insertBefore(version,userLine);
        else drawerFoot.prepend(version);
      }
      if(version.textContent!==label)version.textContent=label;
    }
  }

  function apply(){
    ensureStyles();

    const login=document.getElementById('login');
    if(login){
      const candidates=[...login.querySelectorAll('.login-card p.muted')];
      const version=candidates.find(node=>/Version\s+/i.test(node.textContent||''))||candidates[0];
      if(version&&version.textContent!==loginLabel())version.textContent=loginLabel();
    }

    document.querySelectorAll('.version-pill').forEach(node=>{
      if(node.textContent!==pillLabel())node.textContent=pillLabel();
    });

    ensureAppVersion();
  }

  let scheduled=false;
  const scheduleApply=()=>{
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;apply()});
  };

  const observer=new MutationObserver(scheduleApply);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});

  [0,100,300,800,1600,3000,5000].forEach(delay=>setTimeout(apply,delay));
})();

/* StopFlow 0.7.3 — standard tactile iPhone consolidé. */
(function(){
  if(document.querySelector('script[data-stopflow-073-final-validation-touch-fix="0.7.3"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-073-final-validation-touch-fix.js?v=0732';
  script.async=false;
  script.dataset.stopflow073FinalValidationTouchFix='0.7.3';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.3 — standard global responsive + tactile selon le viewport réel. */
(function(){
  if(document.querySelector('script[data-stopflow-073-mobile-responsive-standard="0.7.3"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-073-mobile-responsive-standard.js?v=0730';
  script.async=false;
  script.dataset.stopflow073MobileResponsiveStandard='0.7.3';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.3 — intitulés métier lisibles dans l’Historique des bons. */
(function(){
  if(document.querySelector('script[data-stopflow-073-history-ux="0.7.3"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-073-history-ux.js?v=0730';
  script.async=false;
  script.dataset.stopflow073HistoryUx='0.7.3';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.3 — ouvre le PDF séparément et simplifie l’écran final. */
(function(){
  if(document.querySelector('script[data-stopflow-073-pdf-blank-open="0.7.3"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-073-pdf-blank-open.js?v=0731';
  script.async=false;
  script.dataset.stopflow073PdfBlankOpen='0.7.3';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.3 — standard de placement mobile : Retour en haut, + en bas. */
(function(){
  if(document.querySelector('script[data-stopflow-073-mobile-navigation-layout="0.7.3"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-073-mobile-navigation-layout.js?v=0731';
  script.async=false;
  script.dataset.stopflow073MobileNavigationLayout='0.7.3';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — première amélioration UX : Accueil compact et direct. */
(function(){
  if(document.querySelector('script[data-stopflow-080-home-ux="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-home-ux.js?v=0800';
  script.async=false;
  script.dataset.stopflow080HomeUx='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — sous-pages Cuisine / Salle / Entretien compactes. */
(function(){
  if(document.querySelector('script[data-stopflow-080-zone-ux="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-zone-ux.js?v=0800';
  script.async=false;
  script.dataset.stopflow080ZoneUx='0.8.0';
  document.head.appendChild(script);
})();
