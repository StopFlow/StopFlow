/* StopFlow 0.7.3 — standard tactile iPhone : validation + actions mobiles héritées. */
(function(){
  if(window.stopflow073FinalValidationTouchFix?.active)return;

  const MOBILE_QUERY='(max-width: 950px)';
  const MOVE_THRESHOLD=12;
  const state={lastHandledAt:0,running:false,observer:null,scheduled:false};
  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches===true;
  const summaryPage=()=>document.getElementById('summary');
  const summaryVisible=()=>Boolean(summaryPage()&&!summaryPage().classList.contains('hidden'));

  function markMobileReady(){
    const app=document.getElementById('app');
    if(app)app.classList.add('sf73-mobile-ready');
    document.documentElement.classList.add('sf73-mobile-ready');
  }

  function ensureReloadShield(){
    let shield=document.getElementById('sf73ReloadShield');
    if(shield)return shield;
    shield=document.createElement('div');
    shield.id='sf73ReloadShield';
    shield.setAttribute('aria-hidden','true');
    shield.style.cssText='display:none;position:fixed;inset:0;z-index:2147483647;background:#071d31;color:#fff;align-items:center;justify-content:center;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;';
    shield.innerHTML='<div style="text-align:center;padding:24px"><div style="font-size:22px;font-weight:800;margin-bottom:8px">StopFlow</div><div style="font-size:13px;opacity:.75">Chargement…</div></div>';
    document.body.appendChild(shield);
    return shield;
  }

  function showReloadShield(){
    if(!isMobile())return;
    const shield=ensureReloadShield();
    shield.style.display='flex';
  }

  /* Composant commun à réutiliser sur chaque nouvelle action mobile StopFlow. */
  function bindTap(element,handler){
    if(!element||typeof handler!=='function'||element.dataset.sf73CommonTap==='1')return;
    element.dataset.sf73CommonTap='1';
    element.style.touchAction='manipulation';
    let gesture=null;
    let lastTouchAt=0;
    let lastHandledAt=0;

    element.addEventListener('touchstart',event=>{
      if(!isMobile()||event.touches?.length!==1)return;
      const touch=event.touches[0];
      gesture={kind:'touch',x:touch.clientX,y:touch.clientY,at:Date.now(),moved:false};
      lastTouchAt=Date.now();
    },{passive:true});

    element.addEventListener('touchmove',event=>{
      if(!gesture||gesture.kind!=='touch'||!event.touches?.length)return;
      const touch=event.touches[0];
      if(Math.hypot(touch.clientX-gesture.x,touch.clientY-gesture.y)>MOVE_THRESHOLD)gesture.moved=true;
    },{passive:true});

    element.addEventListener('touchend',event=>{
      const current=gesture;
      gesture=null;
      lastTouchAt=Date.now();
      if(!current||current.kind!=='touch'||current.moved||Date.now()-current.at>1500)return;
      lastHandledAt=Date.now();
      event.preventDefault();
      event.stopPropagation();
      handler(event,element);
    },{passive:false});

    element.addEventListener('touchcancel',()=>{gesture=null},{passive:true});

    element.addEventListener('pointerdown',event=>{
      if(!isMobile()||Date.now()-lastTouchAt<800||(event.button!=null&&event.button!==0))return;
      gesture={kind:'pointer',id:event.pointerId,x:event.clientX,y:event.clientY,at:Date.now(),moved:false};
    });

    element.addEventListener('pointermove',event=>{
      if(!gesture||gesture.kind!=='pointer'||gesture.id!==event.pointerId)return;
      if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>MOVE_THRESHOLD)gesture.moved=true;
    });

    element.addEventListener('pointerup',event=>{
      const current=gesture;
      if(!current||current.kind!=='pointer'||current.id!==event.pointerId)return;
      gesture=null;
      if(current.moved||Date.now()-current.at>1500)return;
      lastHandledAt=Date.now();
      event.preventDefault();
      event.stopPropagation();
      handler(event,element);
    });

    element.addEventListener('pointercancel',()=>{gesture=null});

    /* Le click Safari retardé après un tap déjà traité ne doit pas déclencher deux fois l’action. */
    element.addEventListener('click',event=>{
      if(!isMobile()||Date.now()-lastHandledAt>=1100)return;
      event.preventDefault();
      event.stopPropagation();
    });
  }

  function controlFrom(target){
    if(!isMobile()||!summaryVisible())return null;
    const button=target?.closest?.('#sf73ValidationBack,#sf73ValidationConfirm')||null;
    return button&&summaryPage()?.contains(button)?button:null;
  }

  function markHandled(){state.lastHandledAt=Date.now()}

  function backToSummary(){
    const action=window.stopflow073InventoryMobileUx?.showSummary;
    if(typeof action==='function'){
      action();
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
    console.warn('StopFlow 0.7.3 — retour au résumé indisponible');
  }

  function finalize(){
    if(state.running)return;
    const action=window.stopflow073InventoryStandard?.finalize;
    if(typeof action!=='function'){
      console.warn('StopFlow 0.7.3 — validation finale indisponible');
      return;
    }
    state.running=true;
    Promise.resolve(action()).finally(()=>{state.running=false});
  }

  function activate(button){
    if(!button)return;
    markHandled();
    if(button.id==='sf73ValidationBack')backToSummary();
    else if(button.id==='sf73ValidationConfirm')finalize();
  }

  function intercept(event,button){
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    activate(button);
  }

  function openHome(){
    try{
      if(typeof window.stopflow070CardNavigation?.openHome==='function'){
        window.stopflow070CardNavigation.openHome();
        return;
      }
      if(typeof page==='function')page('dashboard');
    }catch(error){console.warn('StopFlow 0.7.3 — retour accueil',error)}
  }

  function openHistory(){
    try{
      if(typeof page==='function')page('history');
      if(typeof renderHistory==='function')renderHistory();
      window.stopflow070BackNavigation?.refresh?.();
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(error){console.warn('StopFlow 0.7.3 — ouverture historique',error)}
  }

  function enhanceHistory(){
    document.querySelectorAll('#historyRows tr').forEach(row=>{
      const detail=row.querySelector('[data-detail]');
      const id=detail?.dataset?.detail;
      if(!id)return;
      row.dataset.sf73HistoryId=id;
      row.setAttribute('role','button');
      row.tabIndex=0;
      const number=row.querySelector('td:first-child')?.textContent?.trim()||'document';
      row.setAttribute('aria-label',`Ouvrir ${number}`);
      bindTap(row,()=>{
        try{
          if(typeof showDetail==='function')showDetail(id);
          window.stopflow070BackNavigation?.refresh?.();
        }catch(error){console.warn('StopFlow 0.7.3 — détail historique',error)}
      });
    });
  }

  function enhanceCompletion(){
    const actions=document.querySelector('#sf73InventoryComplete .sf73-complete-actions');
    if(!actions)return;

    let home=actions.querySelector('#sf73DoneHome');
    if(!home){
      home=document.createElement('button');
      home.type='button';
      home.className='btn primary sf73-wide';
      home.id='sf73DoneHome';
      home.textContent='Retour à l’accueil';
      const history=actions.querySelector('#sf73DoneHistory');
      if(history)actions.insertBefore(home,history);
      else actions.prepend(home);
    }
    bindTap(home,openHome);

    const history=actions.querySelector('#sf73DoneHistory');
    if(history)bindTap(history,openHistory);
  }

  function injectStyles(){
    if(document.getElementById('sf73CommonMobileTapStyles'))return;
    const style=document.createElement('style');
    style.id='sf73CommonMobileTapStyles';
    style.textContent=`
      @media(max-width:950px){
        [data-sf73-common-tap="1"],#historyRows tr[data-sf73-history-id]{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        #historyRows tr[data-sf73-history-id]{cursor:pointer}
        #sf73DoneHome{min-height:50px}
      }
    `;
    document.head.appendChild(style);
  }

  function refreshCommonControls(){
    injectStyles();
    enhanceHistory();
    enhanceCompletion();
  }

  function scheduleRefresh(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{state.scheduled=false;refreshCommonControls()});
  }

  function installObserver(){
    if(state.observer||!document.body)return;
    state.observer=new MutationObserver(scheduleRefresh);
    state.observer.observe(document.body,{subtree:true,childList:true});
  }

  function install(){
    /* Safari iPhone : touchend reste propriétaire même lorsque PointerEvent existe. */
    window.addEventListener('touchend',event=>{
      const button=controlFrom(event.target);
      if(!button)return;
      intercept(event,button);
    },{capture:true,passive:false});

    /* Secours pour navigateurs tactiles basés sur Pointer Events. */
    window.addEventListener('pointerup',event=>{
      const button=controlFrom(event.target);
      if(!button)return;
      if(Date.now()-state.lastHandledAt<700){
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        return;
      }
      intercept(event,button);
    },true);

    /* Secours clavier / clic Safari. */
    window.addEventListener('click',event=>{
      const button=controlFrom(event.target);
      if(!button)return;
      if(Date.now()-state.lastHandledAt<900){
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        return;
      }
      intercept(event,button);
    },true);

    window.addEventListener('pagehide',showReloadShield,true);
    window.addEventListener('beforeunload',showReloadShield,true);
  }

  window.stopflow073MobileTap={active:true,version:'0.7.3',bind:bindTap,refresh:scheduleRefresh,openHome,openHistory};
  window.stopflow073FinalValidationTouchFix={active:true,finalize,back:backToSummary,ready:markMobileReady,bindTap};

  install();
  installObserver();
  markMobileReady();
  [0,100,300,800,1600,3000].forEach(delay=>setTimeout(()=>{installObserver();scheduleRefresh()},delay));
})();
