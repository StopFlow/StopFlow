/* StopFlow 0.8.0 — démarrage propre : masque les écrans intermédiaires après connexion. */
(function(){
  if(window.stopflow080StartupSmooth?.active)return;

  const state={timer:null,startedAt:0,observing:false};
  const app=()=>document.getElementById('app');

  function injectStyles(){
    if(document.getElementById('stopflow080StartupSmoothStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080StartupSmoothStyles';
    style.textContent=`
      #app>.sf80-startup-screen{display:none}
      #app:not(.hidden):not([data-sf80-startup-ready="1"])>.sf80-startup-screen{
        position:fixed;inset:0;z-index:15000;display:grid;place-items:center;
        padding:24px;background:#f4f7fb;color:#10233b
      }
      #app:not(.hidden):not([data-sf80-startup-ready="1"])>.main,
      #app:not(.hidden):not([data-sf80-startup-ready="1"])>.sidebar,
      #app:not(.hidden):not([data-sf80-startup-ready="1"])~.sf52-mobile-header{
        visibility:hidden!important
      }
      .sf80-startup-card{width:min(330px,88vw);padding:22px 20px;border:1px solid #dbe5f0;border-radius:18px;background:#fff;box-shadow:0 16px 42px rgba(13,35,62,.10);text-align:center}
      .sf80-startup-brand{font-size:24px;font-weight:900;letter-spacing:-.02em;color:#10233b}
      .sf80-startup-text{margin-top:7px;color:#68778b;font-size:13px;line-height:1.4}
      .sf80-startup-loader{width:30px;height:30px;margin:16px auto 0;border:3px solid #dbe7f8;border-top-color:#2463eb;border-radius:50%;animation:sf80StartupSpin .72s linear infinite}
      @keyframes sf80StartupSpin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
  }

  function ensureScreen(){
    const root=app();
    if(!root)return null;
    let screen=root.querySelector(':scope>.sf80-startup-screen');
    if(screen)return screen;
    screen=document.createElement('div');
    screen.className='sf80-startup-screen';
    screen.setAttribute('aria-live','polite');
    screen.innerHTML='<div class="sf80-startup-card"><div class="sf80-startup-brand">StopFlow</div><div class="sf80-startup-text">Préparation de votre espace…</div><div class="sf80-startup-loader" aria-hidden="true"></div></div>';
    root.appendChild(screen);
    return screen;
  }

  function reset(){
    const root=app();
    if(!root)return;
    root.removeAttribute('data-sf80-startup-ready');
    if(state.timer){clearTimeout(state.timer);state.timer=null}
  }

  function readyConditions(){
    const root=app();
    if(!root||root.classList.contains('hidden'))return false;
    const home=document.getElementById('sf70Home');
    const nav=window.stopflow070CardNavigation;
    const navReady=!nav||nav.runtime?.loaded===true;
    const homeReady=Boolean(home&&!home.classList.contains('hidden')&&home.querySelector('.sf70-card-grid'));
    const uxReady=Boolean(window.stopflow080HomeUx?.active&&document.getElementById('stopflow080HomeUxStyles'));
    return navReady&&homeReady&&uxReady;
  }

  function finish(){
    const root=app();
    if(!root||root.classList.contains('hidden'))return;
    window.stopflow080HomeUx?.refresh?.();
    requestAnimationFrame(()=>requestAnimationFrame(()=>root.setAttribute('data-sf80-startup-ready','1')));
  }

  function check(){
    const root=app();
    if(!root||root.classList.contains('hidden'))return;
    if(readyConditions())return finish();
    const elapsed=Date.now()-state.startedAt;
    if(elapsed>4600){
      try{window.stopflow070CardNavigation?.openHome?.()}catch{}
      window.stopflow080HomeUx?.refresh?.();
      return setTimeout(finish,100);
    }
    state.timer=setTimeout(check,70);
  }

  function begin(){
    const root=app();
    if(!root||root.classList.contains('hidden'))return;
    ensureScreen();
    root.removeAttribute('data-sf80-startup-ready');
    state.startedAt=Date.now();
    if(state.timer)clearTimeout(state.timer);
    state.timer=setTimeout(check,0);
  }

  function install(){
    injectStyles();
    const root=app();
    if(!root)return false;
    ensureScreen();
    if(!state.observing){
      state.observing=true;
      new MutationObserver(()=>{
        if(root.classList.contains('hidden'))reset();
        else begin();
      }).observe(root,{attributes:true,attributeFilter:['class']});
    }
    if(!root.classList.contains('hidden'))begin();
    return true;
  }

  window.stopflow080StartupSmooth={active:true,version:'0.8.0',refresh:begin};
  let attempts=0;
  const boot=setInterval(()=>{if(install()||++attempts>60)clearInterval(boot)},50);
})();
