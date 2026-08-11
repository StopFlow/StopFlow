/* StopFlow 0.7.3 — inventaire mobile terrain : comptage rapide et parcours tactile unifié. */
(function(){
  if(window.stopflow073InventoryMobileUx?.active)return;

  const MOBILE_QUERY='(max-width: 950px)';
  const MOVE_THRESHOLD=7;
  const FLOW_SELECTOR='[data-minus],[data-plus],#setAllZero,#showSummary,#saveDraft,[data-back-inventory],[data-adj-minus],[data-adj-plus],#sendPending,#validateOrder';
  const state={observer:null,scheduled:false,gesture:null,suppressAction:null,suppressUntil:0,syntheticAction:null};
  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches===true;
  const inventoryPage=()=>document.getElementById('inventory');
  const summaryPage=()=>document.getElementById('summary');
  const pageVisible=node=>Boolean(node&&!node.classList.contains('hidden'));
  const inventoryVisible=()=>pageVisible(inventoryPage());
  const summaryVisible=()=>pageVisible(summaryPage());
  const inventoryFlowVisible=()=>{
    if(inventoryVisible()||summaryVisible())return true;
    return pageVisible(document.getElementById('sf73SalleInventory'));
  };

  function injectStyles(){
    if(document.getElementById('sf73InventoryMobileUxStyles'))return;
    const style=document.createElement('style');
    style.id='sf73InventoryMobileUxStyles';
    style.textContent=`
      @media(max-width:950px){
        /* Sur le parcours inventaire, jamais de mot tronqué à côté de la flèche. */
        body.sf73-inventory-flow-visible.sf73-mobile-back-active #sf52MobileHeader{grid-template-columns:42px!important}
        body.sf73-inventory-flow-visible.sf73-mobile-back-active #sf52MobileTitle{display:none!important}

        #inventory{max-width:100%!important;overflow-x:hidden!important}
        #inventory .tablewrap{overflow:visible!important;border:0!important;border-radius:0!important;background:transparent!important}
        #inventory table{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;border-collapse:separate!important}
        #inventory thead{display:none!important}
        #inventory tbody{display:grid!important;width:100%!important;gap:9px!important}

        #inventory #inventoryMeta{display:none!important}
        #inventory > .notice{display:none!important}
        #inventory .stepper{margin:4px 0 12px!important;gap:6px!important}
        #inventory .step{font-size:12px!important;white-space:nowrap}
        #inventory .step b{width:23px!important;height:23px!important}
        #inventory .line{min-width:12px!important}
        #inventory #inventoryHeading{font-size:21px!important;margin:7px 0 3px!important}
        #inventory #articleSearch{font-size:16px!important;min-height:46px!important}
        #inventory #setAllZero,
        #inventory #showSummary,
        #inventory #saveDraft,
        #summary #sendPending,
        #summary #validateOrder,
        #summary [data-back-inventory]{touch-action:manipulation!important;-webkit-tap-highlight-color:transparent!important}
        #inventory #setAllZero{min-height:44px!important}

        #inventory #inventoryRows tr{
          display:grid!important;
          grid-template-columns:minmax(0,1fr)!important;
          grid-template-areas:'article' 'stock'!important;
          gap:0!important;
          width:100%!important;
          min-width:0!important;
          padding:12px 14px!important;
          border:1px solid var(--line)!important;
          border-radius:14px!important;
          background:#fff!important;
          box-shadow:0 4px 14px rgba(13,35,62,.05)!important;
        }
        #inventory #inventoryRows td{min-width:0!important;width:auto!important;padding:0!important;border:0!important;background:transparent!important;text-align:left!important}

        #inventory #inventoryRows td:nth-child(1){grid-area:article!important;display:block!important;padding-bottom:9px!important;margin-bottom:9px!important;border-bottom:1px solid #edf1f6!important;overflow-wrap:anywhere!important}
        #inventory #inventoryRows td:nth-child(1)::before{display:none!important;content:none!important}
        #inventory #inventoryRows td:nth-child(1) b{font-size:17px!important;line-height:1.2!important;color:var(--text)!important}
        #inventory #inventoryRows td:nth-child(1) small{display:block!important;margin-top:3px!important;font-size:12px!important}

        /* Pendant le comptage, catégorie, cible et quantité à commander restent calculées mais ne surchargent pas l'écran. */
        #inventory #inventoryRows td:nth-child(2),
        #inventory #inventoryRows td:nth-child(3),
        #inventory #inventoryRows td:nth-child(5){display:none!important}
        #inventory #inventoryRows td:nth-child(2)::before,
        #inventory #inventoryRows td:nth-child(3)::before,
        #inventory #inventoryRows td:nth-child(5)::before{display:none!important;content:none!important}

        #inventory #inventoryRows td:nth-child(4){grid-area:stock!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important}
        #inventory #inventoryRows td:nth-child(4)::before{content:'Stock présent'!important;display:block!important;position:static!important;width:auto!important;height:auto!important;margin:0!important;color:#5e7087!important;font-size:12px!important;font-weight:800!important;letter-spacing:.02em!important;text-transform:none!important}
        #inventory #inventoryRows .qty{flex:0 0 auto!important;display:grid!important;grid-template-columns:56px 64px 56px!important;height:48px!important;border-radius:12px!important;overflow:hidden!important;background:#fff!important}
        #inventory #inventoryRows .qty button{width:56px!important;height:48px!important;padding:0!important;font-size:24px!important;line-height:1!important;touch-action:manipulation!important;-webkit-tap-highlight-color:transparent!important}
        #inventory #inventoryRows .qty input{width:64px!important;height:48px!important;padding:0 4px!important;font-size:19px!important;font-weight:850!important;text-align:center!important}
      }
    `;
    document.head.appendChild(style);
  }

  function syncFlowState(){
    document.body.classList.toggle('sf73-inventory-flow-visible',isMobile()&&inventoryFlowVisible());
  }

  function syncMobileTitle(){
    if(!isMobile()||!inventoryVisible())return;
    const mobileTitle=document.getElementById('sf52MobileTitle');
    let supplier='';
    try{supplier=String(current?.supplier||'').trim()}catch{}
    if(mobileTitle)mobileTitle.textContent=supplier||'Inventaire';
  }

  function enhanceRows(){
    if(!isMobile())return;
    if(inventoryVisible()){
      document.querySelectorAll('#inventoryRows [data-minus]').forEach(button=>button.setAttribute('aria-label','Diminuer le stock'));
      document.querySelectorAll('#inventoryRows [data-plus]').forEach(button=>button.setAttribute('aria-label','Augmenter le stock'));
      document.querySelectorAll('#inventoryRows [data-stock]').forEach(input=>input.setAttribute('aria-label','Stock présent'));
      const zero=document.getElementById('setAllZero');
      if(zero)zero.setAttribute('aria-label','Mettre tous les stocks à zéro');
    }
    if(summaryVisible()){
      document.querySelectorAll('#summaryRows [data-adj-minus]').forEach(button=>button.setAttribute('aria-label','Diminuer la quantité à commander'));
      document.querySelectorAll('#summaryRows [data-adj-plus]').forEach(button=>button.setAttribute('aria-label','Augmenter la quantité à commander'));
    }
  }

  function flowAction(target){
    const control=target?.closest?.(FLOW_SELECTOR)||null;
    if(!control)return null;
    const inventory=inventoryPage();
    const summary=summaryPage();
    if(inventory?.contains(control)||summary?.contains(control))return control;
    return null;
  }

  function applyDirectAction(control){
    if(!control)return false;
    try{
      if(control.id==='setAllZero'&&inventoryVisible()){
        if(typeof activeArticles!=='function'||typeof renderInventory!=='function')return true;
        activeArticles().forEach(article=>{current.stocks[article.id]=0});
        renderInventory();
        scheduleRefresh();
        return true;
      }

      if((control.dataset.plus!==undefined||control.dataset.minus!==undefined)&&inventoryVisible()){
        const id=control.dataset.plus||control.dataset.minus;
        if(!id||typeof renderInventory!=='function')return true;
        const value=Number(current.stocks[id]??0);
        if(control.dataset.plus!==undefined)current.stocks[id]=value+1;
        else current.stocks[id]=Math.max(0,value-1);
        renderInventory();
        scheduleRefresh();
        return true;
      }

      if((control.dataset.adjPlus!==undefined||control.dataset.adjMinus!==undefined)&&summaryVisible()){
        const id=control.dataset.adjPlus||control.dataset.adjMinus;
        let base=0;
        try{
          const article=typeof activeArticles==='function'?activeArticles().find(item=>String(item.id)===String(id)):null;
          base=article&&typeof calc==='function'?Number(calc(article)||0):0;
        }catch{}
        const value=Number(current.adjustments[id]??base);
        if(control.dataset.adjPlus!==undefined)current.adjustments[id]=value+1;
        else current.adjustments[id]=Math.max(0,value-1);
        if(typeof renderSummary==='function')renderSummary();
        scheduleRefresh();
        return true;
      }
    }catch(error){
      console.warn('StopFlow 0.7.3 — commande directe inventaire mobile',error);
      return true;
    }
    return false;
  }

  function runExistingAction(control){
    if(!control)return;
    try{
      if(typeof control.onclick==='function'){
        control.onclick.call(control,new MouseEvent('click',{bubbles:false,cancelable:true,view:window}));
      }else{
        state.syntheticAction=control;
        control.click();
        state.syntheticAction=null;
      }
    }catch(error){
      state.syntheticAction=null;
      console.warn('StopFlow 0.7.3 — action parcours inventaire mobile',error);
    }
    setTimeout(scheduleRefresh,0);
    setTimeout(()=>window.stopflow070BackNavigation?.refresh?.(),30);
  }

  function activate(control){
    if(applyDirectAction(control))return;
    runExistingAction(control);
  }

  function installMobileControls(){
    document.addEventListener('pointerdown',event=>{
      if(!isMobile()||(event.button!=null&&event.button!==0))return;
      const control=flowAction(event.target);
      if(!control)return;
      state.gesture={
        control,
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
      if(Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)>MOVE_THRESHOLD)gesture.moved=true;
      if(Math.abs(window.scrollX-gesture.startScrollX)>1||Math.abs(window.scrollY-gesture.startScrollY)>1)gesture.moved=true;
    },true);

    document.addEventListener('scroll',()=>{
      if(state.gesture)state.gesture.moved=true;
    },true);

    document.addEventListener('pointerup',event=>{
      const gesture=state.gesture;
      if(!gesture||gesture.pointerId!==event.pointerId)return;
      state.gesture=null;
      const control=flowAction(event.target);
      const sameControl=control===gesture.control||gesture.control.contains(event.target);
      const tap=!gesture.moved&&sameControl&&Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)<=MOVE_THRESHOLD&&Date.now()-gesture.startedAt<1000;
      state.suppressAction=gesture.control;
      state.suppressUntil=Date.now()+900;
      if(!tap)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      activate(gesture.control);
    },true);

    document.addEventListener('pointercancel',event=>{
      const gesture=state.gesture;
      if(!gesture||gesture.pointerId!==event.pointerId)return;
      state.suppressAction=gesture.control;
      state.suppressUntil=Date.now()+900;
      state.gesture=null;
    },true);

    document.addEventListener('click',event=>{
      if(!isMobile())return;
      const control=flowAction(event.target);
      if(!control)return;
      if(state.syntheticAction===control)return;
      if(state.suppressAction===control&&Date.now()<state.suppressUntil){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    },true);
  }

  function refresh(){injectStyles();syncFlowState();syncMobileTitle();enhanceRows()}
  function scheduleRefresh(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{state.scheduled=false;refresh()});
  }
  function installObserver(){
    if(state.observer||!document.body)return;
    state.observer=new MutationObserver(scheduleRefresh);
    state.observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
  }

  window.stopflow073InventoryMobileUx={active:true,refresh:scheduleRefresh};
  installMobileControls();
  document.addEventListener('click',()=>setTimeout(scheduleRefresh,0),true);
  document.addEventListener('pointerup',()=>setTimeout(scheduleRefresh,20),true);
  window.addEventListener('resize',scheduleRefresh);
  installObserver();
  [0,100,300,700,1400,2600].forEach(delay=>setTimeout(()=>{installObserver();scheduleRefresh()},delay));
})();
