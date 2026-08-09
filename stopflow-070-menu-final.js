/* StopFlow 0.7.0 — propriétaire final du menu mobile/ordinateur. */
(function(){
  if(window.stopflow070MenuFinal)return;
  window.stopflow070MenuFinal=true;

  const navigation=()=>window.stopflow070CardNavigation;
  let refreshQueued=false;
  let lastPointerNavigation={id:"",at:0};

  function injectFinalMenuStyles(){
    if(document.getElementById("stopflow070MenuFinalStyles"))return;
    const style=document.createElement("style");
    style.id="stopflow070MenuFinalStyles";
    style.textContent=`
      /* Menu 0.7.0 : texte uniquement. Les pictogrammes restent sur les cartes. */
      #sf53DesktopNav.sf70-simple-nav,
      #sf52Drawer,
      #sf52DrawerContent.sf70-simple-mobile{
        pointer-events:auto!important;
      }
      #sf53DesktopNav.sf70-simple-nav>.sf53-home,
      #sf52DrawerContent.sf70-simple-mobile>.sf52-nav-home{
        pointer-events:auto!important;
        cursor:pointer!important;
        touch-action:manipulation!important;
        -webkit-user-select:none!important;
        user-select:none!important;
      }
      #sf53DesktopNav.sf70-simple-nav>.sf53-home{
        grid-template-columns:minmax(0,1fr)!important;
        padding-left:12px!important;
      }
      #sf53DesktopNav.sf70-simple-nav>.sf53-home>.sf53-icon{
        display:none!important;
      }
      #sf52DrawerContent.sf70-simple-mobile>.sf52-nav-home{
        display:grid!important;
        grid-template-columns:minmax(0,1fr)!important;
        min-height:34px!important;
        height:34px!important;
        padding:6px 11px!important;
        gap:0!important;
      }
      #sf52DrawerContent.sf70-simple-mobile>.sf52-nav-home>span:first-child{
        display:none!important;
      }
      #sf52DrawerContent.sf70-simple-mobile>.sf52-nav-home>span:nth-child(2){
        min-width:0!important;
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
      }
    `;
    document.head.appendChild(style);
  }

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

  function closeDrawerDirect(){
    document.body.classList.remove("sf52-drawer-open");
    document.getElementById("sf52Drawer")?.setAttribute("aria-hidden","true");
    document.getElementById("sf52MenuButton")?.setAttribute("aria-expanded","false");
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

    /* Le clone retire le listener 0.5.2 qui reconstruisait l'ancien menu à chaque ouverture. */
    const button=current.cloneNode(true);
    button.dataset.sf70Owned="1";
    button.setAttribute("aria-label","Ouvrir le menu");
    current.replaceWith(button);
    button.addEventListener("click",event=>{
      event.preventDefault();
      event.stopPropagation();
      openDrawer();
    });
  }

  function zoneButtonFromEvent(event,container){
    const target=event.target;
    const element=target?.nodeType===1?target:target?.parentElement;
    const button=element?.closest?.("[data-sf70-zone]");
    return button&&container.contains(button)?button:null;
  }

  function navigateFromButton(button,container){
    const id=button?.dataset?.sf70Zone;
    if(!id)return false;
    const nav=navigation();
    if(!nav?.active)return false;
    if(id==="home")nav.openHome();
    else nav.openZone(id);
    if(container.id==="sf52DrawerContent")closeDrawerDirect();
    return true;
  }

  function ownNavigationClicks(container){
    if(!container||container.dataset.sf70ClickOwner==="2")return;
    container.dataset.sf70ClickOwner="2";

    /*
      Safari : on navigue dès pointerdown. Ainsi, même si un ancien rafraîchissement
      remplace la ligne entre l'appui et le click, l'action est déjà exécutée.
    */
    container.addEventListener("pointerdown",event=>{
      if(event.button!=null&&event.button!==0)return;
      const button=zoneButtonFromEvent(event,container);
      if(!button)return;
      const id=button.dataset.sf70Zone||"";
      event.preventDefault();
      event.stopImmediatePropagation();
      lastPointerNavigation={id,at:Date.now()};
      navigateFromButton(button,container);
    },true);

    /* Fallback clavier / navigateurs sans pointerdown pertinent. */
    container.addEventListener("click",event=>{
      const button=zoneButtonFromEvent(event,container);
      if(!button)return;
      const id=button.dataset.sf70Zone||"";
      const duplicate=lastPointerNavigation.id===id&&Date.now()-lastPointerNavigation.at<800;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(!duplicate)navigateFromButton(button,container);
    },true);
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
    injectFinalMenuStyles();
    ownMenuButton();

    const mobile=document.getElementById("sf52DrawerContent");
    const desktop=document.getElementById("sf53DesktopNav");
    ownNavigationClicks(mobile);
    ownNavigationClicks(desktop);
    observeNavigationContainer(mobile);
    observeNavigationContainer(desktop);

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
