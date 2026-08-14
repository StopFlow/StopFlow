/* StopFlow 0.7.3 — standard mobile : Retour en haut à gauche, + séparé en bas à gauche. */
(function(){
  if(window.stopflow073MobileNavigationLayout?.active)return;

  const MOBILE_QUERY='(max-width: 950px)';
  let observer=null;
  let attempts=0;

  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches===true;

  function injectStyles(){
    if(document.getElementById('sf73MobileNavigationLayoutStyles'))return;
    const style=document.createElement('style');
    style.id='sf73MobileNavigationLayoutStyles';
    style.textContent=`
      @media(max-width:950px){
        /* Le Retour StopFlow est indépendant du navigateur Safari et reste toujours en haut à gauche. */
        #sf73MobileBack.sf73-top-back{
          position:fixed!important;
          top:max(6px,calc(env(safe-area-inset-top) + 4px))!important;
          left:max(8px,calc(env(safe-area-inset-left) + 6px))!important;
          right:auto!important;
          bottom:auto!important;
          z-index:10060!important;
          width:40px!important;
          height:40px!important;
          min-width:40px!important;
          min-height:40px!important;
          margin:0!important;
          padding:0!important;
          border:0!important;
          border-radius:10px!important;
          background:transparent!important;
          color:#fff!important;
          display:none!important;
          place-items:center!important;
          font-size:25px!important;
          font-weight:850!important;
          line-height:1!important;
          box-shadow:none!important;
          touch-action:manipulation!important;
          -webkit-tap-highlight-color:transparent!important;
        }
        body.sf73-mobile-back-active #sf73MobileBack.sf73-top-back:not([hidden]){
          display:grid!important;
        }
        #sf73MobileBack.sf73-top-back:active{background:rgba(255,255,255,.12)!important}

        /* Le titre garde sa place au centre et ne vient jamais se coller à la flèche. */
        #sf52MobileHeader.sf73-has-back{
          grid-template-columns:minmax(0,1fr)!important;
        }
        #sf52MobileHeader.sf73-has-back #sf52MobileTitle{
          grid-column:1!important;
          padding-left:48px!important;
          padding-right:48px!important;
          text-align:center!important;
        }

        /* L'ancien Retour dans le contenu n'est pas nécessaire sur mobile. */
        body.sf73-mobile-back-active .sf70-coherent-back{display:none!important}

        /* Le + conserve une zone dédiée en bas à gauche, sans jamais partager la place du Retour. */
        #sf73MobileActionFab{
          left:max(14px,calc(env(safe-area-inset-left) + 10px))!important;
          right:auto!important;
          bottom:max(14px,calc(env(safe-area-inset-bottom) + 12px))!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function placeBackButton(){
    const button=document.getElementById('sf73MobileBack');
    if(!button)return false;
    if(button.parentElement!==document.body)document.body.appendChild(button);
    button.classList.add('sf73-top-back');
    button.textContent='←';
    button.setAttribute('aria-label',button.getAttribute('aria-label')||'Retour');
    return true;
  }

  function keepPlusSeparate(){
    const plus=document.getElementById('sf73MobileActionFab');
    if(!plus)return false;
    plus.setAttribute('aria-label',plus.getAttribute('aria-label')||'Actions de cette page');
    return true;
  }

  function refresh(){
    injectStyles();
    if(!isMobile())return;
    placeBackButton();
    keepPlusSeparate();
  }

  function installObserver(){
    if(observer||!document.body)return;
    observer=new MutationObserver(()=>{
      refresh();
      if(document.getElementById('sf73MobileBack')&&document.getElementById('sf73MobileActionFab')){
        observer.disconnect();
        observer=null;
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  window.stopflow073MobileNavigationLayout={
    active:true,
    version:'0.7.3',
    refresh
  };

  injectStyles();
  installObserver();
  refresh();
  const timer=setInterval(()=>{
    attempts+=1;
    refresh();
    installObserver();
    if(attempts>=40||(document.getElementById('sf73MobileBack')&&document.getElementById('sf73MobileActionFab'))){
      clearInterval(timer);
      observer?.disconnect();
      observer=null;
    }
  },100);
  window.addEventListener('resize',refresh,{passive:true});
  window.addEventListener('orientationchange',refresh,{passive:true});
})();
