/* StopFlow 0.7.0 — propriétaire tactile mobile des cartes 0.7.0, avec distinction tap / scroll. */
(function(){
  if(window.stopflow070MobileCardTouch?.active)return;

  const MOVE_THRESHOLD=10;
  const state={gesture:null,suppressCard:null,suppressUntil:0};
  window.stopflow070MobileCardTouch={active:true,state};

  const isMobile=()=>window.matchMedia?.('(max-width: 950px)').matches===true;

  function cardFromEvent(event){
    return event.target.closest?.('.sf70-action-card[data-sf70-card]')||null;
  }

  function activate(card,event){
    if(!card||card.closest('.sf70-personalizing'))return false;
    const key=card.dataset.sf70Card||'';

    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();

    /* Températures V3 contourne explicitement l'ancien S.action. */
    if(key==='temperatures.use'&&typeof window.stopflow070TemperatureV3?.open==='function'){
      window.stopflow070TemperatureV3.open();
      return true;
    }

    /* Les cartes 0.7.0 possèdent déjà leur action métier dans onclick. */
    if(typeof card.onclick==='function'){
      card.onclick.call(card,event||new Event('click'));
      return true;
    }
    return false;
  }

  function rememberSyntheticClick(card){
    state.suppressCard=card;
    state.suppressUntil=Date.now()+900;
  }

  document.addEventListener('pointerdown',event=>{
    if(!isMobile()||(event.button!=null&&event.button!==0))return;
    const card=cardFromEvent(event);
    if(!card||card.closest('.sf70-personalizing'))return;

    /* Ne surtout pas preventDefault ici : le navigateur doit pouvoir démarrer un scroll. */
    state.gesture={
      card,
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      moved:false,
      startedAt:Date.now()
    };
  },true);

  document.addEventListener('pointermove',event=>{
    const gesture=state.gesture;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    const dx=event.clientX-gesture.startX;
    const dy=event.clientY-gesture.startY;
    if(Math.hypot(dx,dy)>MOVE_THRESHOLD)gesture.moved=true;
  },true);

  document.addEventListener('pointerup',event=>{
    const gesture=state.gesture;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    state.gesture=null;

    const sameCard=gesture.card===cardFromEvent(event)||gesture.card.contains(event.target);
    const isTap=!gesture.moved&&sameCard&&Date.now()-gesture.startedAt<1200;

    /* Safari peut fabriquer un click même après certains gestes : on l'absorbe ensuite. */
    rememberSyntheticClick(gesture.card);

    if(isTap)activate(gesture.card,event);
    /* Si le doigt a glissé, on ne fait rien : le défilement reste entièrement natif. */
  },true);

  document.addEventListener('pointercancel',event=>{
    const gesture=state.gesture;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    rememberSyntheticClick(gesture.card);
    state.gesture=null;
  },true);

  /* Secours pour Safari : absorbe le click synthétique après pointerup/scroll,
     ou déclenche l'action si aucun PointerEvent n'a précédé le click. */
  document.addEventListener('click',event=>{
    if(!isMobile())return;
    const card=cardFromEvent(event);
    if(!card||card.closest('.sf70-personalizing'))return;

    if(state.suppressCard===card&&Date.now()<state.suppressUntil){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    activate(card,event);
  },true);
})();
