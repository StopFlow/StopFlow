/* StopFlow 0.7.3 — ouverture PDF iPhone fiable dans un onglet séparé + restauration écran final. */
(function(){
  if(window.stopflow073PdfNavigationFixV2?.active)return;

  const MOBILE_QUERY='(max-width: 950px)';
  const state={lastHandledAt:0,scheduled:false};
  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches===true;

  function buttonFrom(target){
    return target?.closest?.('#sf73InventoryComplete #sf73DonePdf')||null;
  }

  function clearReloadShield(){
    const shield=document.getElementById('sf73ReloadShield');
    if(shield&&shield.style.display!=='none')shield.style.display='none';
    document.documentElement.classList.add('sf73-mobile-ready');
    document.getElementById('app')?.classList.add('sf73-mobile-ready');
  }

  function currentSavedOrder(){
    try{
      const id=typeof current!=='undefined'?current?.id:null;
      if(typeof db!=='undefined'&&Array.isArray(db.orders)&&id){
        const exact=db.orders.find(order=>String(order?.id||'')===String(id));
        if(exact)return exact;
      }
      if(typeof db!=='undefined'&&Array.isArray(db.orders)){
        return [...db.orders].sort((a,b)=>new Date(b?.inventoryAt||0)-new Date(a?.inventoryAt||0))[0]||null;
      }
    }catch(error){console.warn('StopFlow 0.7.3 — récupération du bon PDF',error)}
    return null;
  }

  function buildBlob(){
    const order=currentSavedOrder();
    if(!order)return null;
    try{
      if(typeof createSimplePDF==='function')return createSimplePDF(order);
    }catch(error){console.warn('StopFlow 0.7.3 — génération PDF séparée',error)}
    return null;
  }

  function showPdfStatus(message,type='info'){
    let box=document.querySelector('#sf73InventoryComplete .sf73-pdf-open-status');
    if(!box){
      const actions=document.querySelector('#sf73InventoryComplete .sf73-complete-actions');
      if(!actions)return;
      box=document.createElement('div');
      box.className='sf73-pdf-open-status';
      box.style.cssText='grid-column:1/-1;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.4;';
      actions.appendChild(box);
    }
    const background=type==='error'?'#fff1f1':'#eef5ff';
    const color=type==='error'?'#a72b2b':'#294f78';
    if(box.style.background!==background)box.style.background=background;
    if(box.style.color!==color)box.style.color=color;
    if(box.textContent!==message)box.textContent=message;
  }

  function openPdfSeparate(){
    clearReloadShield();

    const blank=window.open('about:blank','_blank');
    if(!blank){
      showPdfStatus('Safari a bloqué l’ouverture du document. Autorise les fenêtres surgissantes pour cette preview, puis réessaie.','error');
      return;
    }

    try{
      blank.opener=null;
      blank.document.open();
      blank.document.write('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>StopFlow — PDF</title><style>body{margin:0;background:#071d31;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;min-height:100vh;display:grid;place-items:center}.box{text-align:center;padding:24px}.box b{display:block;font-size:22px;margin-bottom:8px}.box span{opacity:.75}</style></head><body><div class="box"><b>StopFlow</b><span>Ouverture du PDF…</span></div></body></html>');
      blank.document.close();
    }catch{}

    const blob=buildBlob();
    if(!blob){
      try{blank.close()}catch{}
      showPdfStatus('Le PDF n’a pas pu être préparé. Retourne dans l’historique puis ouvre le bon.','error');
      return;
    }

    const url=URL.createObjectURL(blob);
    try{
      blank.location.replace(url);
      showPdfStatus('Le PDF est ouvert dans un onglet séparé. StopFlow reste disponible ici.');
    }catch(error){
      try{blank.location.href=url}catch{}
      console.warn('StopFlow 0.7.3 — ouverture onglet PDF',error);
    }
    setTimeout(()=>{try{URL.revokeObjectURL(url)}catch{}},180000);
  }

  function intercept(event){
    const button=buttonFrom(event.target);
    if(!button||!isMobile())return;
    const now=Date.now();
    if(now-state.lastHandledAt<900){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    state.lastHandledAt=now;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openPdfSeparate();
  }

  function enhanceCompletion(){
    const button=document.querySelector('#sf73InventoryComplete #sf73DonePdf');
    if(!button)return;
    if(button.textContent!=='Ouvrir le PDF')button.textContent='Ouvrir le PDF';
    if(button.getAttribute('aria-label')!=='Ouvrir le PDF dans un nouvel onglet')button.setAttribute('aria-label','Ouvrir le PDF dans un nouvel onglet');
    if(button.title!=='Ouvre le PDF séparément de StopFlow')button.title='Ouvre le PDF séparément de StopFlow';
  }

  function scheduleEnhance(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{
      state.scheduled=false;
      enhanceCompletion();
    });
  }

  /* Capture fenêtre : ce propriétaire passe avant les gestionnaires tactiles hérités du bouton PDF uniquement. */
  window.addEventListener('touchend',intercept,{capture:true,passive:false});
  window.addEventListener('pointerup',intercept,true);
  window.addEventListener('click',intercept,true);

  /* Le garde historique affiche le masque sur pagehide. Ce listener est enregistré après lui :
     il remet explicitement l’interface dans un état restaurable avant le cache arrière Safari. */
  window.addEventListener('pagehide',clearReloadShield,true);
  window.addEventListener('pageshow',clearReloadShield,true);
  window.addEventListener('focus',clearReloadShield,true);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')clearReloadShield();
  },true);

  /* Observer sans écriture en boucle : enhanceCompletion ne modifie le DOM que si nécessaire. */
  const observer=new MutationObserver(scheduleEnhance);
  if(document.body)observer.observe(document.body,{subtree:true,childList:true});

  window.stopflow073PdfNavigationFixV2={
    active:true,
    version:'0.7.3',
    open:openPdfSeparate,
    clearReloadShield,
    refresh:scheduleEnhance
  };

  clearReloadShield();
  scheduleEnhance();
  [100,300,800,1600,3000].forEach(delay=>setTimeout(()=>{clearReloadShield();scheduleEnhance()},delay));
})();
