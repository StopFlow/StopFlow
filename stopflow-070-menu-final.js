/* StopFlow 0.7.0 — propriétaire final du menu mobile/ordinateur. */
(function(){
  if(window.stopflow070MenuFinal)return;
  window.stopflow070MenuFinal=true;

  const navigation=()=>window.stopflow070CardNavigation;
  let refreshQueued=false;

  function refreshCanonical(){
    const nav=navigation();
    if(!nav?.active||typeof nav.refreshMenus!=="function")return;
    nav.refreshMenus();
  }

  function queueCanonical(){
    if(refreshQueued)return;
    refreshQueued=true;
    queueMicrotask(()=>{
      refreshQueued=false;
      refreshCanonical();
    });
  }

  function openDrawer(){
    refreshCanonical();
    document.body.classList.add("sf52-drawer-open");
    document.getElementById("sf52Drawer")?.setAttribute("aria-hidden","false");
    document.getElementById("sf52MenuButton")?.setAttribute("aria-expanded","true");
  }

  function ownMenuButton(){
    const current=document.getElementById("sf52MenuButton");
    if(!current||current.dataset.sf70Owned==="1")return;

    /*
      Le bouton 0.5.2 possède un listener fermé dans son module qui appelle
      rebuildDrawer() à chaque ouverture. Le cloner retire uniquement ces
      anciens listeners ; le bouton conserve son apparence, son ID et ses
      attributs d'accessibilité.
    */
    const button=current.cloneNode(true);
    button.dataset.sf70Owned="1";
    button.setAttribute("aria-label","Ouvrir le menu");
    current.replaceWith(button);
    button.addEventListener("click",event=>{
      event.preventDefault();
      openDrawer();
    });
  }

  function legacyMenuPresent(container){
    return Boolean(container?.querySelector(".sf52-nav-group,.sf53-group"));
  }

  function observeNavigationContainer(container){
    if(!container||container.dataset.sf70FinalObserver==="1")return;
    container.dataset.sf70FinalObserver="1";
    const observer=new MutationObserver(()=>{
      if(legacyMenuPresent(container))queueCanonical();
    });
    observer.observe(container,{childList:true,subtree:true});
  }

  function apply(){
    const nav=navigation();
    if(!nav?.active)return;
    ownMenuButton();
    observeNavigationContainer(document.getElementById("sf52DrawerContent"));
    observeNavigationContainer(document.getElementById("sf53DesktopNav"));
    const subtitle=document.querySelector(".sf52-drawer-subtitle");
    if(subtitle)subtitle.textContent="Navigation par objectifs";
    refreshCanonical();
  }

  /* Installation bornée : aucun observateur global du body. */
  let attempts=0;
  const timer=setInterval(()=>{
    apply();
    attempts+=1;
    if(attempts>=40 || (document.getElementById("sf52MenuButton")&&navigation()?.active))clearInterval(timer);
  },100);

  [0,120,350,800,1600,2600].forEach(delay=>setTimeout(apply,delay));
})();
