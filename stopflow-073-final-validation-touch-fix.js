/* StopFlow 0.7.3 — propriétaire tactile final de la validation mobile (Safari/iPhone). */
(function(){
  if(window.stopflow073FinalValidationTouchFix?.active)return;

  const MOBILE_QUERY='(max-width: 950px)';
  const MOVE_THRESHOLD=12;
  const state={gesture:null,suppressClickUntil:0,running:false};

  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches===true;
  const summaryVisible=()=>{
    const page=document.getElementById('summary');
    return Boolean(page&&!page.classList.contains('hidden'));
  };
  const validationButton=target=>{
    if(!isMobile()||!summaryVisible())return null;
    const button=target?.closest?.('#sf73ValidationConfirm')||null;
    return button&&document.getElementById('summary')?.contains(button)?button:null;
  };

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

  function install(){
    window.addEventListener('pointerdown',event=>{
      const button=validationButton(event.target);
      if(!button||(event.button!=null&&event.button!==0))return;
      state.gesture={button,id:event.pointerId,x:event.clientX,y:event.clientY,startedAt:Date.now(),moved:false};
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    },true);

    window.addEventListener('pointermove',event=>{
      const gesture=state.gesture;
      if(!gesture||gesture.id!==event.pointerId)return;
      if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>MOVE_THRESHOLD)gesture.moved=true;
    },true);

    window.addEventListener('pointerup',event=>{
      const gesture=state.gesture;
      if(!gesture||gesture.id!==event.pointerId)return;
      state.gesture=null;
      const button=validationButton(event.target);
      const tap=!gesture.moved&&button===gesture.button&&Date.now()-gesture.startedAt<1400;
      if(!tap)return;
      state.suppressClickUntil=Date.now()+1000;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      finalize();
    },true);

    window.addEventListener('pointercancel',event=>{
      if(state.gesture?.id===event.pointerId)state.gesture=null;
    },true);

    window.addEventListener('click',event=>{
      const button=validationButton(event.target);
      if(!button)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if(Date.now()<state.suppressClickUntil)return;
      finalize();
    },true);

    if(!window.PointerEvent){
      window.addEventListener('touchend',event=>{
        const button=validationButton(event.target);
        if(!button)return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        finalize();
      },{capture:true,passive:false});
    }
  }

  window.stopflow073FinalValidationTouchFix={active:true,finalize};
  install();
})();
