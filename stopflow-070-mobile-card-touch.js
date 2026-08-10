/* StopFlow 0.7.0 — propriétaire tactile mobile des cartes 0.7.0, avec distinction tap / scroll renforcée. */
(function(){
  if(window.stopflow070MobileCardTouch?.active)return;

  const MOVE_THRESHOLD=8;
  const SCROLL_THRESHOLD=2;
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

    if(key==='temperatures.use'&&typeof window.stopflow070TemperatureV3?.open==='function'){
      window.stopflow070TemperatureV3.open();
      return true;
    }

    if(typeof card.onclick==='function'){
      card.onclick.call(card,event||new Event('click'));
      return true;
    }
    return false;
  }

  function rememberSyntheticClick(card){
    state.suppressCard=card;
    state.suppressUntil=Date.now()+1000;
  }

  document.addEventListener('pointerdown',event=>{
    if(!isMobile()||(event.button!=null&&event.button!==0))return;
    const card=cardFromEvent(event);
    if(!card||card.closest('.sf70-personalizing'))return;

    state.gesture={
      card,
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      startScrollX:window.scrollX,
      startScrollY:window.scrollY,
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
    if(Math.abs(window.scrollY-gesture.startScrollY)>SCROLL_THRESHOLD||Math.abs(window.scrollX-gesture.startScrollX)>SCROLL_THRESHOLD)gesture.moved=true;
  },true);

  document.addEventListener('pointerup',event=>{
    const gesture=state.gesture;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    state.gesture=null;

    const endDx=event.clientX-gesture.startX;
    const endDy=event.clientY-gesture.startY;
    const fingerMoved=Math.hypot(endDx,endDy)>MOVE_THRESHOLD;
    const pageMoved=Math.abs(window.scrollY-gesture.startScrollY)>SCROLL_THRESHOLD||Math.abs(window.scrollX-gesture.startScrollX)>SCROLL_THRESHOLD;
    const sameCard=gesture.card===cardFromEvent(event)||gesture.card.contains(event.target);
    const isTap=!gesture.moved&&!fingerMoved&&!pageMoved&&sameCard&&Date.now()-gesture.startedAt<1200;

    rememberSyntheticClick(gesture.card);
    if(isTap)activate(gesture.card,event);
  },true);

  document.addEventListener('pointercancel',event=>{
    const gesture=state.gesture;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    rememberSyntheticClick(gesture.card);
    state.gesture=null;
  },true);

  document.addEventListener('scroll',()=>{
    if(state.gesture)state.gesture.moved=true;
  },true);

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
