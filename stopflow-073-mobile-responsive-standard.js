/* StopFlow 0.7.3 — standard global responsive + tactile pour smartphone/tablette. */
(function(){
  if(window.stopflow073MobileResponsiveStandard?.active)return;

  const VERSION='0.7.3';
  const MOBILE_QUERY='(max-width: 950px)';
  const MOVE_THRESHOLD=12;
  const state={observer:null,scheduled:false,gesture:null,synthetic:null,suppress:null,suppressUntil:0};

  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches===true;

  function updateViewport(){
    const root=document.documentElement;
    const viewport=window.visualViewport;
    const width=Math.max(1,Math.round(viewport?.width||root.clientWidth||window.innerWidth||1));
    const height=Math.max(1,Math.round(viewport?.height||root.clientHeight||window.innerHeight||1));
    root.style.setProperty('--sf73-viewport-width',`${width}px`);
    root.style.setProperty('--sf73-viewport-height',`${height}px`);
    root.classList.toggle('sf73-mobile-viewport',isMobile());
  }

  function injectStyles(){
    if(document.getElementById('sf73MobileResponsiveStandardStyles'))return;
    const style=document.createElement('style');
    style.id='sf73MobileResponsiveStandardStyles';
    style.textContent=`
      @media(max-width:950px){
        html,body{width:100%;max-width:100%;overflow-x:hidden!important}
        body{min-width:0!important}
        #app,.shell,.main,.page,#app>.main{width:100%;max-width:100%;min-width:0!important}
        #app>.main{overflow-x:hidden!important}
        #app .page>*{max-width:100%;min-width:0}
        #app .card,#app .stat,#app .notice,#app .filters,#app .kpis,#app .grid4,
        #app .supplier-grid,#app .rules,#app .tablewrap,#app .stepper,#app .flex,
        body>.modal .modalbox,#app .modalbox,.print-screen,.print-toolbar,.print-sheet{
          max-width:100%;min-width:0!important
        }
        #app img,#app svg,#app canvas,#app video,.modalbox img,.modalbox svg,.modalbox canvas,.modalbox video{
          max-width:100%;height:auto
        }
        #app input,#app select,#app textarea,.modalbox input,.modalbox select,.modalbox textarea{
          max-width:100%;min-width:0
        }
        #app .btn,#app button,#app [role="button"],.modalbox .btn,.modalbox button,.modalbox [role="button"]{
          touch-action:manipulation;-webkit-tap-highlight-color:transparent
        }
        #app .btn,.modalbox .btn{min-height:44px}

        body>.modal,#app .modal{
          padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));
          align-items:flex-start;overflow:auto;overscroll-behavior:contain
        }
        body>.modal .modalbox,#app .modalbox{
          width:100%!important;
          max-width:min(720px,100%)!important;
          max-height:calc(var(--sf73-viewport-height,100dvh) - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 20px)!important;
          margin:auto!important;
          overflow-x:hidden!important;
          overflow-y:auto!important;
          -webkit-overflow-scrolling:touch
        }
        body>.modal .modalbox *,#app .modalbox *{min-width:0}
        body>.modal .modalbox .flex,#app .modalbox .flex,#app .page .flex.between{
          max-width:100%;flex-wrap:wrap
        }

        .tablewrap:has(table[data-sf73-mobile-layout="cards"]){
          overflow:visible!important;border:0!important;background:transparent!important
        }
        table[data-sf73-mobile-layout="cards"]{
          display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;
          border-collapse:separate!important;border-spacing:0!important
        }
        table[data-sf73-mobile-layout="cards"] thead{display:none!important}
        table[data-sf73-mobile-layout="cards"] tbody{
          display:grid!important;width:100%!important;max-width:100%!important;gap:10px!important
        }
        table[data-sf73-mobile-layout="cards"] tbody>tr{
          display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;
          padding:4px 12px!important;background:#fff!important;border:1px solid var(--line,#dde5ef)!important;
          border-radius:14px!important;box-shadow:0 4px 14px rgba(13,35,62,.05)!important;overflow:hidden!important
        }
        table[data-sf73-mobile-layout="cards"] tbody>tr>td{
          display:grid!important;grid-template-columns:minmax(105px,38%) minmax(0,1fr)!important;
          align-items:start!important;gap:10px!important;width:100%!important;max-width:100%!important;min-width:0!important;
          padding:10px 0!important;border:0!important;border-bottom:1px solid var(--line,#dde5ef)!important;
          text-align:right!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important
        }
        table[data-sf73-mobile-layout="cards"] tbody>tr>td:last-child{border-bottom:0!important}
        table[data-sf73-mobile-layout="cards"] tbody>tr>td::before{
          content:attr(data-sf73-label);display:block;min-width:0;color:#68778b;font-size:10px;font-weight:800;
          line-height:1.25;letter-spacing:.045em;text-transform:uppercase;text-align:left;overflow-wrap:anywhere
        }
        table[data-sf73-mobile-layout="cards"] tbody>tr>td[data-sf73-label=""]{
          display:block!important;text-align:left!important
        }
        table[data-sf73-mobile-layout="cards"] tbody>tr>td[data-sf73-label=""]::before{display:none!important}
        table[data-sf73-mobile-layout="cards"] tbody>tr>td>*{
          justify-self:end;max-width:100%!important;min-width:0!important;white-space:normal!important;overflow-wrap:anywhere
        }
        table[data-sf73-mobile-layout="cards"] tbody>tr>td>.btn,
        table[data-sf73-mobile-layout="cards"] tbody>tr>td>button{
          width:100%;justify-self:stretch
        }
        table[data-sf73-mobile-layout="cards"] tbody>tr>td[colspan]{display:block!important;text-align:left!important}
        table[data-sf73-mobile-layout="cards"] tbody>tr>td[colspan]::before{display:none!important}

        #historyRows tr[data-sf73-history-id]{width:100%!important;max-width:100%!important}
        #historyRows tr[data-sf73-history-id] td{overflow-wrap:anywhere}

        .sf73-no-horizontal-scroll{max-width:100%!important;min-width:0!important;overflow-x:hidden!important}
        pre{max-width:100%;overflow:auto}
      }

      @media(max-width:520px){
        #app>.main{padding-left:max(10px,env(safe-area-inset-left));padding-right:max(10px,env(safe-area-inset-right))}
        body>.modal,#app .modal{padding-left:max(8px,env(safe-area-inset-left));padding-right:max(8px,env(safe-area-inset-right))}
        body>.modal .modalbox,#app .modalbox{border-radius:16px!important}
        table[data-sf73-mobile-layout="cards"] tbody>tr>td{
          grid-template-columns:minmax(92px,36%) minmax(0,1fr)!important;gap:8px!important
        }
      }
    `;
    document.head.appendChild(style);
  }

  function tableEligible(table){
    if(!table||!isMobile())return false;
    if(table.closest('#printArea'))return false;
    if(table.matches('.sf73-keep-table,[data-sf73-keep-table="1"]'))return false;
    if(table.closest('.sf73-keep-table,[data-sf73-keep-table="1"]'))return false;
    return Boolean(table.closest('#app,.modalbox,.print-screen'));
  }

  function labelTable(table){
    if(!tableEligible(table))return;
    table.dataset.sf73MobileLayout='cards';
    const headers=[...table.querySelectorAll('thead th')].map((th,index)=>String(th.textContent||'').trim()||`Information ${index+1}`);
    table.querySelectorAll('tbody tr').forEach(row=>{
      [...row.children].filter(cell=>cell.tagName==='TD').forEach((cell,index)=>{
        if(cell.colSpan>1){cell.dataset.sf73Label='';return}
        if(!cell.dataset.sf73Label)cell.dataset.sf73Label=headers[index]||`Information ${index+1}`;
      });
    });
  }

  function fitContainers(){
    if(!isMobile())return;
    document.querySelectorAll('#app .page,#app .card,#app .tablewrap,#app .modalbox,body>.modal .modalbox,.print-screen').forEach(node=>{
      node.classList.add('sf73-no-horizontal-scroll');
    });
    document.querySelectorAll('#app table,.modalbox table,.print-screen table').forEach(labelTable);
  }

  const OWNED_SELECTOR=[
    '[data-sf73-common-tap="1"]',
    '.sf70-action-card[data-sf70-card]',
    '#sf70TemperatureV3 [data-tv3-action]',
    '#inventory button',
    '#summary button',
    '#sf73InventoryComplete button'
  ].join(',');

  function genericAction(target){
    if(!isMobile()||!target?.closest)return null;
    const action=target.closest('#app button:not([disabled]),#app a[href],#app [role="button"],body>.modal button:not([disabled]),body>.modal a[href],body>.modal [role="button"]');
    if(!action)return null;
    if(action.closest('.sf70-personalizing'))return null;
    if(action.matches(OWNED_SELECTOR)||action.closest(OWNED_SELECTOR))return null;
    return action;
  }

  function installGenericTapOwner(){
    if(document.documentElement.dataset.sf73GenericTapOwner==='1')return;
    document.documentElement.dataset.sf73GenericTapOwner='1';

    window.addEventListener('pointerdown',event=>{
      if(!isMobile()||event.pointerType==='mouse'||(event.button!=null&&event.button!==0))return;
      const action=genericAction(event.target);
      if(!action)return;
      state.gesture={action,id:event.pointerId,x:event.clientX,y:event.clientY,startedAt:Date.now(),moved:false};
      event.stopPropagation();
      event.stopImmediatePropagation();
    },true);

    window.addEventListener('pointermove',event=>{
      const gesture=state.gesture;
      if(!gesture||gesture.id!==event.pointerId)return;
      if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>MOVE_THRESHOLD)gesture.moved=true;
      event.stopPropagation();
      event.stopImmediatePropagation();
    },true);

    window.addEventListener('pointerup',event=>{
      const gesture=state.gesture;
      if(!gesture||gesture.id!==event.pointerId)return;
      state.gesture=null;
      event.stopPropagation();
      event.stopImmediatePropagation();
      const action=genericAction(event.target);
      const tap=!gesture.moved&&action===gesture.action&&Date.now()-gesture.startedAt<1500;
      if(!tap)return;
      event.preventDefault();
      state.synthetic=gesture.action;
      state.suppress=gesture.action;
      state.suppressUntil=Date.now()+1100;
      gesture.action.click();
      state.synthetic=null;
    },true);

    window.addEventListener('pointercancel',event=>{
      if(state.gesture?.id!==event.pointerId)return;
      state.gesture=null;
      event.stopPropagation();
      event.stopImmediatePropagation();
    },true);

    window.addEventListener('click',event=>{
      const action=genericAction(event.target);
      if(!action)return;
      if(state.synthetic===action)return;
      if(state.suppress===action&&Date.now()<state.suppressUntil){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    },true);

    if(!window.PointerEvent){
      let touchGesture=null;
      window.addEventListener('touchstart',event=>{
        if(!isMobile()||event.touches?.length!==1)return;
        const action=genericAction(event.target);
        if(!action)return;
        const touch=event.touches[0];
        touchGesture={action,x:touch.clientX,y:touch.clientY,startedAt:Date.now(),moved:false};
        event.stopPropagation();
        event.stopImmediatePropagation();
      },{capture:true,passive:true});
      window.addEventListener('touchmove',event=>{
        if(!touchGesture||!event.touches?.length)return;
        const touch=event.touches[0];
        if(Math.hypot(touch.clientX-touchGesture.x,touch.clientY-touchGesture.y)>MOVE_THRESHOLD)touchGesture.moved=true;
      },{capture:true,passive:true});
      window.addEventListener('touchend',event=>{
        const gesture=touchGesture;
        touchGesture=null;
        if(!gesture)return;
        event.stopPropagation();
        event.stopImmediatePropagation();
        if(gesture.moved||Date.now()-gesture.startedAt>1500)return;
        event.preventDefault();
        state.synthetic=gesture.action;
        state.suppress=gesture.action;
        state.suppressUntil=Date.now()+1100;
        gesture.action.click();
        state.synthetic=null;
      },{capture:true,passive:false});
    }
  }

  function refresh(){
    updateViewport();
    injectStyles();
    fitContainers();
  }

  function scheduleRefresh(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{state.scheduled=false;refresh()});
  }

  function installObserver(){
    if(state.observer||!document.body)return;
    state.observer=new MutationObserver(scheduleRefresh);
    state.observer.observe(document.body,{subtree:true,childList:true});
  }

  window.stopflow073MobileResponsiveStandard={
    active:true,
    version:VERSION,
    refresh:scheduleRefresh,
    viewport:updateViewport,
    relayout:fitContainers
  };

  installGenericTapOwner();
  installObserver();
  window.addEventListener('resize',scheduleRefresh,{passive:true});
  window.addEventListener('orientationchange',scheduleRefresh,{passive:true});
  window.visualViewport?.addEventListener?.('resize',scheduleRefresh,{passive:true});
  window.visualViewport?.addEventListener?.('scroll',scheduleRefresh,{passive:true});
  [0,80,200,500,1000,2000,4000].forEach(delay=>setTimeout(()=>{installObserver();scheduleRefresh()},delay));
})();
