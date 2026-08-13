/* StopFlow 0.7.3 — propriétaire tactile final Résumé/Validation sur iPhone. */
(function(){
  if(window.stopflow073FinalValidationTouchFix?.active)return;

  const MOBILE_QUERY='(max-width: 950px)';
  const state={lastHandledAt:0,running:false};
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

  window.stopflow073FinalValidationTouchFix={active:true,finalize,back:backToSummary,ready:markMobileReady};
  install();
  markMobileReady();
})();
