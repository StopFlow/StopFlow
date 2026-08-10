/* StopFlow 0.7.0 — propriétaire tactile mobile des cartes 0.7.0, distinction tap / scroll conservatrice. */
(function(){
  if(window.stopflow070MobileCardTouch?.active)return;

  const MOVE_THRESHOLD=5;
  const TOUCH_MOVE_THRESHOLD=4;
  const SCROLL_THRESHOLD=1;
  const RECENT_SCROLL_GUARD=220;
  const state={gesture:null,suppressCard:null,suppressUntil:0,recentScrollAt:0};
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
    state.suppressUntil=Date.now()+1100;
  }

  function cancelGestureForScroll(){
    state.recentScrollAt=Date.now();
    if(state.gesture)state.gesture.moved=true;
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
    if(Math.abs(window.scrollY-gesture.startScrollY)>SCROLL_THRESHOLD||Math.abs(window.scrollX-gesture.startScrollX)>SCROLL_THRESHOLD)cancelGestureForScroll();
  },true);

  /* Sur iPhone, touchmove reste un garde-fou supplémentaire lorsque Safari compresse les PointerEvents pendant le scroll. */
  document.addEventListener('touchmove',event=>{
    const gesture=state.gesture;
    if(!gesture||!event.touches?.length)return;
    const touch=event.touches[0];
    const dx=touch.clientX-gesture.startX;
    const dy=touch.clientY-gesture.startY;
    if(Math.hypot(dx,dy)>TOUCH_MOVE_THRESHOLD)gesture.moved=true;
  },{capture:true,passive:true});

  document.addEventListener('pointerup',event=>{
    const gesture=state.gesture;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    state.gesture=null;

    const endDx=event.clientX-gesture.startX;
    const endDy=event.clientY-gesture.startY;
    const fingerMoved=Math.hypot(endDx,endDy)>MOVE_THRESHOLD;
    const pageMoved=Math.abs(window.scrollY-gesture.startScrollY)>SCROLL_THRESHOLD||Math.abs(window.scrollX-gesture.startScrollX)>SCROLL_THRESHOLD;
    const recentScroll=Date.now()-state.recentScrollAt<RECENT_SCROLL_GUARD;
    const sameCard=gesture.card===cardFromEvent(event)||gesture.card.contains(event.target);
    const isTap=!gesture.moved&&!fingerMoved&&!pageMoved&&!recentScroll&&sameCard&&Date.now()-gesture.startedAt<1000;

    rememberSyntheticClick(gesture.card);
    if(isTap)activate(gesture.card,event);
  },true);

  document.addEventListener('pointercancel',event=>{
    const gesture=state.gesture;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    rememberSyntheticClick(gesture.card);
    state.gesture=null;
  },true);

  document.addEventListener('scroll',cancelGestureForScroll,true);

  /* Sur le mobile 0.7.0, seul pointerup peut ouvrir une carte. Le click Safari est toujours absorbé. */
  document.addEventListener('click',event=>{
    if(!isMobile())return;
    const card=cardFromEvent(event);
    if(!card||card.closest('.sf70-personalizing'))return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  },true);
})();
