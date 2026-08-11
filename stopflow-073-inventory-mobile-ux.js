/* StopFlow 0.7.3 — inventaire mobile terrain : lecture rapide, aucun swipe horizontal. */
(function(){
  if(window.stopflow073InventoryMobileUx?.active)return;

  const MOBILE_QUERY='(max-width: 950px)';
  const state={observer:null,scheduled:false};
  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches===true;
  const inventoryPage=()=>document.getElementById('inventory');
  const inventoryVisible=()=>{
    const page=inventoryPage();
    return Boolean(page&&!page.classList.contains('hidden'));
  };

  function injectStyles(){
    if(document.getElementById('sf73InventoryMobileUxStyles'))return;
    const style=document.createElement('style');
    style.id='sf73InventoryMobileUxStyles';
    style.textContent=`
      @media(max-width:950px){
        #inventory{max-width:100%!important;overflow-x:hidden!important}
        #inventory .tablewrap{overflow:visible!important;border:0!important;border-radius:0!important;background:transparent!important}
        #inventory table{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;border-collapse:separate!important}
        #inventory thead{display:none!important}
        #inventory tbody{display:grid!important;width:100%!important;gap:10px!important}

        #inventory #inventoryMeta{display:none!important}
        #inventory > .notice{display:none!important}
        #inventory .stepper{margin:4px 0 12px!important;gap:6px!important}
        #inventory .step{font-size:12px!important;white-space:nowrap}
        #inventory .step b{width:23px!important;height:23px!important}
        #inventory .line{min-width:12px!important}
        #inventory #inventoryHeading{font-size:21px!important;margin:7px 0 3px!important}
        #inventory #articleSearch{font-size:16px!important;min-height:46px!important}
        #inventory #zeroAll{min-height:44px!important}

        #inventory #inventoryRows tr{
          display:grid!important;
          grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
          grid-template-areas:'article article' 'stock stock' 'target order'!important;
          gap:0 12px!important;
          width:100%!important;
          min-width:0!important;
          padding:13px 14px!important;
          border:1px solid var(--line)!important;
          border-radius:14px!important;
          background:#fff!important;
          box-shadow:0 4px 14px rgba(13,35,62,.05)!important;
        }
        #inventory #inventoryRows td{min-width:0!important;width:auto!important;padding:0!important;border:0!important;background:transparent!important;text-align:left!important}

        #inventory #inventoryRows td:nth-child(1){grid-area:article!important;display:block!important;padding-bottom:10px!important;margin-bottom:10px!important;border-bottom:1px solid #edf1f6!important;overflow-wrap:anywhere!important}
        #inventory #inventoryRows td:nth-child(1)::before{display:none!important;content:none!important}
        #inventory #inventoryRows td:nth-child(1) b{font-size:17px!important;line-height:1.2!important;color:var(--text)!important}
        #inventory #inventoryRows td:nth-child(1) small{display:block!important;margin-top:3px!important;font-size:12px!important}

        #inventory #inventoryRows td:nth-child(2){display:none!important}
        #inventory #inventoryRows td:nth-child(2)::before{display:none!important;content:none!important}

        #inventory #inventoryRows td:nth-child(4){grid-area:stock!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;padding-bottom:11px!important;margin-bottom:9px!important;border-bottom:1px solid #edf1f6!important}
        #inventory #inventoryRows td:nth-child(4)::before{content:'Stock présent'!important;display:block!important;position:static!important;width:auto!important;height:auto!important;margin:0!important;color:#5e7087!important;font-size:12px!important;font-weight:800!important;letter-spacing:.02em!important;text-transform:none!important}
        #inventory #inventoryRows .qty{flex:0 0 auto!important;display:grid!important;grid-template-columns:48px 58px 48px!important;height:46px!important;border-radius:12px!important;overflow:hidden!important;background:#fff!important}
        #inventory #inventoryRows .qty button{width:48px!important;height:46px!important;padding:0!important;font-size:23px!important;line-height:1!important;touch-action:manipulation!important}
        #inventory #inventoryRows .qty input{width:58px!important;height:46px!important;padding:0 4px!important;font-size:18px!important;font-weight:850!important;text-align:center!important}

        #inventory #inventoryRows td:nth-child(3),#inventory #inventoryRows td:nth-child(5){display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;min-height:25px!important;font-size:15px!important;font-weight:800!important}
        #inventory #inventoryRows td:nth-child(3){grid-area:target!important;color:#64758a!important}
        #inventory #inventoryRows td:nth-child(5){grid-area:order!important;text-align:right!important;justify-content:flex-end!important}
        #inventory #inventoryRows td:nth-child(3)::before,#inventory #inventoryRows td:nth-child(5)::before{display:inline!important;position:static!important;width:auto!important;height:auto!important;margin:0!important;font-size:11px!important;font-weight:750!important;color:#7b899a!important;text-transform:none!important;letter-spacing:0!important}
        #inventory #inventoryRows td:nth-child(3)::before{content:'Cible'!important}
        #inventory #inventoryRows td:nth-child(5)::before{content:'À commander'!important}
        #inventory #inventoryRows td:nth-child(5).order{color:var(--green)!important}
        #inventory #inventoryRows td:nth-child(5).zero{color:#98a2b0!important}
      }
    `;
    document.head.appendChild(style);
  }

  function syncMobileTitle(){
    if(!isMobile()||!inventoryVisible())return;
    const mobileTitle=document.getElementById('sf52MobileTitle');
    let supplier='';
    try{supplier=String(current?.supplier||'').trim()}catch{}
    if(mobileTitle)mobileTitle.textContent=supplier||'Inventaire';
  }

  function enhanceRows(){
    if(!isMobile()||!inventoryVisible())return;
    document.querySelectorAll('#inventoryRows [data-minus]').forEach(button=>button.setAttribute('aria-label','Diminuer le stock'));
    document.querySelectorAll('#inventoryRows [data-plus]').forEach(button=>button.setAttribute('aria-label','Augmenter le stock'));
    document.querySelectorAll('#inventoryRows [data-stock]').forEach(input=>input.setAttribute('aria-label','Stock présent'));
  }

  function refresh(){injectStyles();syncMobileTitle();enhanceRows()}
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
  document.addEventListener('click',()=>setTimeout(scheduleRefresh,0),true);
  document.addEventListener('pointerup',()=>setTimeout(scheduleRefresh,20),true);
  window.addEventListener('resize',scheduleRefresh);
  installObserver();
  [0,100,300,700,1400,2600].forEach(delay=>setTimeout(()=>{installObserver();scheduleRefresh()},delay));
})();
