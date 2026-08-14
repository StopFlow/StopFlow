/* StopFlow 0.7.3 — ouverture PDF séparée + retour Safari sans écran de chargement bloqué. */
(function(){
  if(window.stopflow073PdfNavigationFix?.active)return;

  const state={
    armedUntil:0,
    observer:null,
    scheduled:false
  };

  function pdfButtonFrom(target){
    return target?.closest?.('#sf73DonePdf')||null;
  }

  function armPdfOpen(target){
    if(!pdfButtonFrom(target))return;
    state.armedUntil=Date.now()+1800;
  }

  function isGeneratedPdfLink(link){
    if(!link||link.tagName!=='A')return false;
    const href=String(link.getAttribute('href')||'');
    const download=String(link.getAttribute('download')||'');
    return /^blob:/i.test(href)&&/\.pdf$/i.test(download);
  }

  function redirectGeneratedPdfToSeparateDocument(event){
    if(Date.now()>state.armedUntil)return;
    const link=event.target?.closest?.('a')||null;
    if(!isGeneratedPdfLink(link))return;

    /* Safari iPhone ignore parfois download sur les Blob PDF et remplace l’onglet courant.
       On conserve la génération existante, mais on transforme uniquement ce clic en document séparé. */
    link.target='_blank';
    link.rel='noopener noreferrer';
    link.removeAttribute('download');
    state.armedUntil=0;
  }

  function clearReloadShield(){
    const shield=document.getElementById('sf73ReloadShield');
    if(shield)shield.style.display='none';
    document.documentElement.classList.add('sf73-mobile-ready');
    document.getElementById('app')?.classList.add('sf73-mobile-ready');
  }

  function enhanceCompletion(){
    const button=document.querySelector('#sf73InventoryComplete #sf73DonePdf');
    if(button){
      if(button.textContent!=='Ouvrir le PDF')button.textContent='Ouvrir le PDF';
      button.setAttribute('aria-label','Ouvrir le PDF dans un nouvel onglet');
      button.title='Le document PDF s’ouvre séparément de StopFlow';
    }

    const info=document.querySelector('#sf73InventoryComplete .sf73-complete-card > p');
    if(info&&/PDF contient/i.test(info.textContent||'')&&!info.dataset.sf73PdfNavigationInfo){
      info.dataset.sf73PdfNavigationInfo='1';
      info.textContent='Le PDF contient l’inventaire complet. « Ouvrir le PDF » l’affiche dans un document séparé afin que cet écran final reste disponible dans StopFlow.';
    }
  }

  function refresh(){
    clearReloadShield();
    enhanceCompletion();
  }

  function scheduleRefresh(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{
      state.scheduled=false;
      refresh();
    });
  }

  function installObserver(){
    if(state.observer||!document.body)return;
    state.observer=new MutationObserver(scheduleRefresh);
    state.observer.observe(document.body,{subtree:true,childList:true});
  }

  /* Armement avant que le gestionnaire PDF 0.7.3 existant ne crée son lien Blob. */
  window.addEventListener('pointerup',event=>armPdfOpen(event.target),true);
  window.addEventListener('touchend',event=>armPdfOpen(event.target),{capture:true,passive:true});
  window.addEventListener('click',event=>armPdfOpen(event.target),true);

  /* Le lien est créé puis cliqué synchroniquement par le moteur PDF existant.
     On ne modifie que ce lien PDF généré et uniquement après une action sur #sf73DonePdf. */
  document.addEventListener('click',redirectGeneratedPdfToSeparateDocument,true);

  /* Safari peut restaurer StopFlow depuis le back-forward cache après un PDF ou Mail.
     Le masque de rechargement ne doit alors jamais rester visible. */
  window.addEventListener('pageshow',()=>{clearReloadShield();scheduleRefresh()},true);
  window.addEventListener('focus',clearReloadShield,true);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')clearReloadShield();
  },true);

  window.stopflow073PdfNavigationFix={
    active:true,
    version:'0.7.3',
    refresh:scheduleRefresh,
    clearReloadShield
  };

  installObserver();
  refresh();
  [100,300,800,1600,3000].forEach(delay=>setTimeout(()=>{installObserver();scheduleRefresh()},delay));
})();
