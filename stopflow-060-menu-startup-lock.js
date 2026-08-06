/* StopFlow 0.6.0 — empêcher l'ouverture fugace des menus pendant la connexion. */
(function(){
  if(window.stopflow060MenuStartupLock)return;
  window.stopflow060MenuStartupLock=true;

  const CLOSED="__closed__";
  const MOBILE_KEY="stopflow-052-open-group";
  const DESKTOP_KEY="stopflow-053-desktop-open-group";
  let locking=false;
  let observer=null;
  let releaseTimer=null;

  function rememberClosed(){
    localStorage.setItem(MOBILE_KEY,CLOSED);
    localStorage.setItem(DESKTOP_KEY,CLOSED);
  }

  function closeVisiblePanels(){
    document.querySelectorAll(".sf52-nav-group-toggle,.sf53-group-toggle").forEach(toggle=>{
      if(toggle.getAttribute("aria-expanded")!=="false")toggle.setAttribute("aria-expanded","false");
    });
    document.querySelectorAll(".sf52-nav-panel.open,.sf53-group-panel.open").forEach(panel=>panel.classList.remove("open"));
  }

  function enforceClosed(){
    rememberClosed();
    closeVisiblePanels();
  }

  function stopObserver(){
    observer?.disconnect();
    observer=null;
  }

  function release(){
    enforceClosed();
    locking=false;
    stopObserver();
    document.documentElement.classList.remove("sf60-menu-starting");
  }

  function lockInitialMenu(){
    locking=true;
    document.documentElement.classList.add("sf60-menu-starting");
    enforceClosed();
    stopObserver();
    observer=new MutationObserver(()=>{
      if(locking)enforceClosed();
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class","aria-expanded"]});
    clearTimeout(releaseTimer);
    releaseTimer=setTimeout(release,1150);
  }

  if(!document.getElementById("sf60MenuStartupStyle")){
    const style=document.createElement("style");
    style.id="sf60MenuStartupStyle";
    style.textContent=`
      html.sf60-menu-starting .sf52-nav-panel,
      html.sf60-menu-starting .sf53-group-panel{display:none!important}
      html.sf60-menu-starting .sf52-nav-chevron,
      html.sf60-menu-starting .sf53-chevron{transition:none!important}
    `;
    document.head.appendChild(style);
  }

  /* Une rubrique fermée doit rester fermée lors des reconstructions ultérieures. */
  document.addEventListener("click",event=>{
    if(!event.target.closest?.(".sf52-nav-group-toggle,.sf53-group-toggle"))return;
    setTimeout(()=>{
      const mobileOpen=document.querySelector('.sf52-nav-group-toggle[aria-expanded="true"]');
      const desktopOpen=document.querySelector('.sf53-group-toggle[aria-expanded="true"]');
      if(!mobileOpen)localStorage.setItem(MOBILE_KEY,CLOSED);
      if(!desktopOpen)localStorage.setItem(DESKTOP_KEY,CLOSED);
    },0);
  },true);

  /* Le marqueur est placé avant toute connexion afin que les anciens modules ne choisissent aucun département par défaut. */
  enforceClosed();

  if(typeof showApp==="function"){
    const previousShowApp=showApp;
    showApp=function(){
      lockInitialMenu();
      return previousShowApp(...arguments);
    };
  }

  const app=document.getElementById("app");
  if(app&&!app.classList.contains("hidden"))lockInitialMenu();
})();
