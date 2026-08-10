/* StopFlow 0.7.0 — propriétaire tactile mobile des cartes 0.7.0. */
(function(){
  if(window.stopflow070MobileCardTouch?.active)return;

  const state={lastCard:null,lastAt:0};
  window.stopflow070MobileCardTouch={active:true,state};

  const isMobile=()=>window.matchMedia?.('(max-width: 950px)').matches===true;

  function activate(card,event){
    if(!card||card.closest('.sf70-personalizing'))return false;
    const key=card.dataset.sf70Card||'';

    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();

    /* Températures V3 doit contourner explicitement l'ancien S.action. */
    if(key==='temperatures.use'&&typeof window.stopflow070TemperatureV3?.open==='function'){
      window.stopflow070TemperatureV3.open();
      return true;
    }

    /* Les cartes 0.7.0 possèdent déjà leur action métier dans onclick.
       On l'exécute immédiatement au toucher au lieu d'attendre le click Safari. */
    if(typeof card.onclick==='function'){
      card.onclick.call(card,event||new Event('click'));
      return true;
    }
    return false;
  }

  document.addEventListener('pointerdown',event=>{
    if(!isMobile()||(event.button!=null&&event.button!==0))return;
    const card=event.target.closest?.('.sf70-action-card[data-sf70-card]');
    if(!card||card.closest('.sf70-personalizing'))return;
    state.lastCard=card;
    state.lastAt=Date.now();
    activate(card,event);
  },true);

  /* Secours pour d'anciens Safari qui ne remontent pas pointerdown comme attendu. */
  document.addEventListener('click',event=>{
    if(!isMobile())return;
    const card=event.target.closest?.('.sf70-action-card[data-sf70-card]');
    if(!card||card.closest('.sf70-personalizing'))return;
    if(state.lastCard===card&&Date.now()-state.lastAt<800){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    activate(card,event);
  },true);
})();