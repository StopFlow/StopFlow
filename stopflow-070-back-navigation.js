/* StopFlow 0.7.3 — navigation retour mobile, titres centrés et tiroir fluide. */
(function(){
  if(window.stopflow070BackNavigation?.version==='0.7.3')return;

  const VERSION='0.7.3';
  const LABELS={cuisine:'Cuisine',salle:'Salle',nettoyage:'Entretien & hygiène',general:'Général'};
  const MOBILE_QUERY='(max-width: 950px)';
  let mobileTarget=null;
  let observer=null;
  let scheduled=false;
  let drawerGesture=null;
  let lastSummaryContinueAt=0;

  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches??window.innerWidth<=950;
  const navigation=()=>window.stopflow070CardNavigation;

  function currentPage(){
    return [...document.querySelectorAll('#app .page')].find(node=>!node.classList.contains('hidden'))||null;
  }

  function visibleModalBack(){
    const modal=document.getElementById('modal');
    if(!modal||modal.classList.contains('hidden'))return null;
    const style=getComputedStyle(modal);
    if(style.display==='none'||style.visibility==='hidden')return null;
    const close=modal.querySelector('#closeModal,[data-stopflow-modal-close],.sf70-tv3-modal-close');
    if(!close||close.disabled)return null;
    return {kind:'native',label:'Fermer',node:close,modal:true};
  }

  function visibleNativeBack(pageNode){
    if(!pageNode)return null;
    return [...pageNode.querySelectorAll(':scope > .sf70-back-button, :scope > .sf70-tv3-back, :scope > [data-stopflow-back]')]
      .find(node=>!node.classList.contains('hidden')&&getComputedStyle(node).display!=='none')||null;
  }

  function targetFor(pageNode){
    const modalTarget=visibleModalBack();
    if(modalTarget)return modalTarget;
    if(!pageNode)return null;
    const id=pageNode.id||'';
    if(id==='sf70Home'||id==='dashboard')return null;

    const nativeBack=visibleNativeBack(pageNode);
    if(nativeBack)return {kind:'native',label:'Retour',node:nativeBack};

    const zone=navigation()?.runtime?.currentZone||'home';
    if(id==='sf70ZonePage'&&LABELS[zone])return {kind:'nav',id:'home',label:'Accueil'};
    if(LABELS[zone])return {kind:'nav',id:zone,label:LABELS[zone]};
    return null;
  }

  function mobileTitleFor(pageNode){
    if(!pageNode)return '';
    const id=pageNode.id||'';
    const zone=navigation()?.runtime?.currentZone||'home';
    if(id==='sf70Home'||id==='dashboard')return 'Accueil';
    if(id==='sf70ZonePage'&&LABELS[zone])return LABELS[zone];
    if(id==='sf73SalleInventory')return 'Inventaire';
    return '';
  }

  function navigate(target){
    if(!target)return;
    if(target.kind==='native'){
      if(target.node?.isConnected)target.node.click();
    }else{
      const nav=navigation();
      if(!nav)return;
      if(target.id==='home')nav.openHome?.();
      else if(LABELS[target.id])nav.openZone?.(target.id);
    }
    setTimeout(scheduleApply,0);
    setTimeout(scheduleApply,100);
  }

  function injectStyles(){
    if(document.getElementById('sf73MobileNavigationStyles'))return;
    const style=document.createElement('style');
    style.id='sf73MobileNavigationStyles';
    style.textContent=`
      .sf70-coherent-back{display:inline-flex;align-items:center;border:0;background:transparent;color:var(--blue);font-weight:800;padding:4px 0 10px;margin:0 0 2px;cursor:pointer;touch-action:manipulation}
      .sf70-coherent-back:hover{text-decoration:underline}
      .sf70-coherent-back:focus-visible{outline:3px solid #dce8ff;outline-offset:3px;border-radius:6px}
      #sf73MobileBack{display:none}
      @media(max-width:950px){
        /* iPhone : la flèche et le titre occupent des colonnes distinctes. Aucun "St…" collé à la flèche. */
        #sf52MobileHeader{grid-template-columns:minmax(0,1fr)!important;position:relative!important}
        #sf52MobileHeader #sf52MenuButton,
        #sf52MobileHeader #sf52HomeButton{display:none!important}
        #sf52MobileTitle{
          grid-column:1!important;
          min-width:0!important;
          max-width:100%!important;
          overflow:hidden!important;
          text-overflow:ellipsis!important;
          white-space:nowrap!important;
          text-align:center!important
        }
        #sf52MobileHeader.sf73-has-back{grid-template-columns:42px minmax(0,1fr) 42px!important}
        #sf52MobileHeader.sf73-has-back #sf73MobileBack{display:grid!important;grid-column:1!important}
        #sf52MobileHeader.sf73-has-back #sf52MobileTitle{grid-column:2!important;text-align:center!important}
        #sf73MobileBack{font-size:24px!important;font-weight:800;line-height:1}
        body.sf73-mobile-back-active .sf70-coherent-back{display:none!important}
        .sf52-drawer,.sf52-drawer-overlay{will-change:transform,opacity}
        .sf52-drawer{transition:transform .18s cubic-bezier(.22,.61,.36,1)!important}
        .sf52-drawer-overlay{transition:opacity .18s ease!important}
        .sf52-drawer-close{position:relative;z-index:4;touch-action:manipulation}
      }
    `;
    document.head.appendChild(style);
  }

  function syncMobileTitle(pageNode){
    if(!isMobile())return;
    const title=document.getElementById('sf52MobileTitle');
    if(!title)return;
    const label=mobileTitleFor(pageNode);
    if(label)title.textContent=label;
  }

  function ensureContentButton(pageNode,target){
    let button=pageNode?.querySelector(':scope > .sf70-coherent-back');
    if(!pageNode||!target||target.kind==='native'){
      button?.remove();
      return;
    }
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='sf70-coherent-back';
      pageNode.prepend(button);
      button.addEventListener('pointerdown',event=>{
        if(event.button!=null&&event.button!==0)return;
        event.preventDefault();
        navigate(targetFor(currentPage()));
      });
      button.addEventListener('click',event=>event.preventDefault());
    }
    button.textContent=`← Retour à ${target.label}`;
  }

  function ensureMobileBack(target){
    const header=document.getElementById('sf52MobileHeader');
    if(!header){
      document.body.classList.remove('sf73-mobile-back-active');
      return;
    }

    let button=document.getElementById('sf73MobileBack');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.id='sf73MobileBack';
      button.className='sf52-menu-button';
      button.textContent='←';
      button.setAttribute('aria-label','Retour');
      const menu=document.getElementById('sf52MenuButton');
      header.insertBefore(button,menu||header.firstChild);
      button.addEventListener('pointerdown',event=>{
        if(event.button!=null&&event.button!==0)return;
        event.preventDefault();
        event.stopPropagation();
        navigate(mobileTarget||targetFor(currentPage()));
      });
      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
      });
    }

    const active=Boolean(target)&&isMobile();
    mobileTarget=active?target:null;
    header.classList.toggle('sf73-has-back',active);
    button.hidden=!active;
    button.setAttribute('aria-hidden',active?'false':'true');
    button.setAttribute('aria-label',target?.modal?'Fermer':'Retour');
    document.body.classList.toggle('sf73-mobile-back-active',active);
  }

  function summaryContinueButton(target){
    const button=target?.closest?.('#sf73SummaryContinue')||null;
    if(!button||!isMobile())return null;
    const summary=document.getElementById('summary');
    if(!summary||summary.classList.contains('hidden')||!summary.contains(button))return null;
    return button;
  }

  function openSummaryValidation(){
    const action=window.stopflow073InventoryMobileUx?.showValidation;
    if(typeof action==='function'){
      action();
      window.scrollTo({top:0,behavior:'smooth'});
      return true;
    }
    return false;
  }

  function installSummaryContinueReliability(){
    if(document.documentElement.dataset.sf73SummaryContinueFix==='1')return;
    document.documentElement.dataset.sf73SummaryContinueFix='1';

    document.addEventListener('pointerdown',event=>{
      if(!summaryContinueButton(event.target)||(event.button!=null&&event.button!==0))return;
      /* On prend la main avant les anciens gestionnaires tactiles. */
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    },true);

    document.addEventListener('pointerup',event=>{
      if(!summaryContinueButton(event.target)||(event.button!=null&&event.button!==0))return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const now=Date.now();
      if(now-lastSummaryContinueAt<500)return;
      lastSummaryContinueAt=now;
      if(!openSummaryValidation())setTimeout(openSummaryValidation,40);
    },true);

    if(!window.PointerEvent){
      document.addEventListener('touchend',event=>{
        if(!summaryContinueButton(event.target))return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const now=Date.now();
        if(now-lastSummaryContinueAt<500)return;
        lastSummaryContinueAt=now;
        if(!openSummaryValidation())setTimeout(openSummaryValidation,40);
      },{capture:true,passive:false});
    }

    document.addEventListener('click',event=>{
      if(!summaryContinueButton(event.target))return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const now=Date.now();
      if(now-lastSummaryContinueAt<500)return;
      lastSummaryContinueAt=now;
      if(!openSummaryValidation())setTimeout(openSummaryValidation,40);
    },true);
  }

  function resetDrawerInline(){
    const drawer=document.getElementById('sf52Drawer');
    const overlay=document.getElementById('sf52DrawerOverlay');
    if(drawer){drawer.style.removeProperty('transition');drawer.style.removeProperty('transform')}
    if(overlay){overlay.style.removeProperty('transition');overlay.style.removeProperty('opacity')}
  }

  function forceDrawerClosedVisual(){
    document.body.classList.remove('sf52-drawer-open');
    document.getElementById('sf52Drawer')?.setAttribute('aria-hidden','true');
    document.getElementById('sf52MenuButton')?.setAttribute('aria-expanded','false');
    resetDrawerInline();
  }

  function installDrawerReliability(){
    const drawer=document.getElementById('sf52Drawer');
    const close=document.getElementById('sf52DrawerClose');
    const overlay=document.getElementById('sf52DrawerOverlay');
    if(!drawer||drawer.dataset.sf73DrawerFix==='1')return;
    drawer.dataset.sf73DrawerFix='1';

    const closeImmediately=event=>{
      forceDrawerClosedVisual();
      const needsStateSync=event?.type==='pointerdown'||(event?.type==='touchstart'&&!window.PointerEvent);
      if(needsStateSync&&close)queueMicrotask(()=>close.click());
    };
    close?.addEventListener('pointerdown',closeImmediately,{capture:true});
    close?.addEventListener('touchstart',closeImmediately,{capture:true,passive:true});
    close?.addEventListener('click',closeImmediately,{capture:true});
    overlay?.addEventListener('pointerdown',closeImmediately,{capture:true});

    drawer.addEventListener('touchstart',event=>{
      if(!document.body.classList.contains('sf52-drawer-open')||event.touches.length!==1)return;
      const touch=event.touches[0];
      drawerGesture={
        startX:touch.clientX,
        startY:touch.clientY,
        x:touch.clientX,
        startedAt:performance.now(),
        width:Math.max(1,drawer.getBoundingClientRect().width),
        horizontal:false
      };
    },{passive:true});

    drawer.addEventListener('touchmove',event=>{
      if(!drawerGesture||event.touches.length!==1)return;
      const touch=event.touches[0];
      const dx=touch.clientX-drawerGesture.startX;
      const dy=touch.clientY-drawerGesture.startY;
      drawerGesture.x=touch.clientX;

      if(!drawerGesture.horizontal){
        if(Math.abs(dx)<7)return;
        if(Math.abs(dx)<=Math.abs(dy)*1.15){drawerGesture=null;return}
        drawerGesture.horizontal=true;
      }
      if(dx>0)return;

      event.preventDefault();
      const offset=Math.max(-drawerGesture.width,dx);
      const progress=Math.min(1,Math.abs(offset)/drawerGesture.width);
      drawer.style.transition='none';
      drawer.style.transform=`translate3d(${offset}px,0,0)`;
      if(overlay){
        overlay.style.transition='none';
        overlay.style.opacity=String(Math.max(.12,1-progress*.82));
      }
    },{passive:false});

    const finishGesture=()=>{
      if(!drawerGesture)return;
      const gesture=drawerGesture;
      drawerGesture=null;
      if(!gesture.horizontal){resetDrawerInline();return}
      const dx=gesture.x-gesture.startX;
      const elapsed=Math.max(1,performance.now()-gesture.startedAt);
      const velocity=dx/elapsed;
      const shouldClose=Math.abs(dx)>gesture.width*.2||velocity<-.38;
      if(shouldClose){
        const closeButton=document.getElementById('sf52DrawerClose');
        if(closeButton)closeButton.click();
        else forceDrawerClosedVisual();
      }else{
        resetDrawerInline();
      }
    };

    drawer.addEventListener('touchend',finishGesture,{passive:true});
    drawer.addEventListener('touchcancel',()=>{drawerGesture=null;resetDrawerInline()},{passive:true});
  }

  function apply(){
    injectStyles();
    installDrawerReliability();
    installSummaryContinueReliability();
    const pageNode=currentPage();
    const target=targetFor(pageNode);

    document.querySelectorAll('.sf70-coherent-back').forEach(button=>{
      if(!pageNode||!pageNode.contains(button))button.remove();
    });

    if(pageNode)ensureContentButton(pageNode,target);
    ensureMobileBack(target);
    syncMobileTitle(pageNode);
  }

  function scheduleApply(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      apply();
    });
  }

  function installObserver(){
    if(observer||!document.body)return;
    observer=new MutationObserver(scheduleApply);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','aria-hidden']});
  }

  window.stopflow070BackNavigation={
    active:true,
    version:VERSION,
    refresh:scheduleApply,
    getTarget:()=>targetFor(currentPage()),
    back:()=>navigate(targetFor(currentPage()))
  };

  installSummaryContinueReliability();
  document.addEventListener('click',()=>setTimeout(scheduleApply,0),true);
  document.addEventListener('pointerup',()=>setTimeout(scheduleApply,20),true);
  window.addEventListener('popstate',scheduleApply);
  window.addEventListener('resize',scheduleApply);

  let count=0;
  const timer=setInterval(()=>{
    installObserver();
    scheduleApply();
    if(++count>=60)clearInterval(timer);
  },100);
  [0,200,500,1000,1800,3000].forEach(delay=>setTimeout(()=>{installObserver();scheduleApply()},delay));
})();
