/* StopFlow 0.7.2 — identification fiable de la version publiée ou preview. */
(function(){
  if(window.stopflow072VersionLabel)return;
  window.stopflow072VersionLabel=true;

  const VERSION='0.7.2';
  const productionHosts=new Set(['stopflow-app.vercel.app']);
  const isProduction=()=>productionHosts.has(location.hostname);
  const loginLabel=()=>isProduction()?`Version ${VERSION}`:`Version ${VERSION} — Preview de développement`;
  const pillLabel=()=>isProduction()?`StopFlow ${VERSION}`:`StopFlow ${VERSION} — Preview`;

  function ensureStyles(){
    if(document.getElementById('stopflow072VersionLabelStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow072VersionLabelStyles';
    style.textContent=`
      .sf72-app-version{
        font-size:11px;
        line-height:1.25;
        letter-spacing:.035em;
        font-weight:700;
        user-select:none;
        pointer-events:none;
      }
      #app>.sidebar>.sf72-app-version{
        position:absolute;
        left:30px;
        right:30px;
        bottom:92px;
        color:#9fb7cf;
        z-index:3;
      }
      #app.sf53-desktop-collapsed>.sidebar>.sf72-app-version{
        display:none!important;
      }
      #sf52Drawer .sf72-app-version{
        display:block;
        margin:0 0 10px 0;
        color:#8190a3;
      }
      @media(max-width:950px){
        #app>.sidebar>.sf72-app-version{display:none!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureAppVersion(){
    const label=pillLabel();

    const sidebar=document.querySelector('#app>.sidebar');
    if(sidebar){
      let version=sidebar.querySelector(':scope>.sf72-app-version');
      if(!version){
        version=document.createElement('div');
        version.className='sf72-app-version';
        const usercard=sidebar.querySelector(':scope>.usercard');
        if(usercard)sidebar.insertBefore(version,usercard);
        else sidebar.appendChild(version);
      }
      if(version.textContent!==label)version.textContent=label;
    }

    const drawerFoot=document.querySelector('#sf52Drawer .sf52-drawer-foot');
    if(drawerFoot){
      let version=drawerFoot.querySelector(':scope>.sf72-app-version');
      if(!version){
        version=document.createElement('div');
        version.className='sf72-app-version';
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
