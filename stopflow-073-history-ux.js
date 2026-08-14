/* StopFlow 0.7.3 — amélioration de lisibilité de l’Historique des bons de commande. */
(function(){
  if(window.stopflow073HistoryUx?.active)return;

  const state={observer:null,scheduled:false};

  function injectStyles(){
    if(document.getElementById('sf73HistoryUxStyles'))return;
    const style=document.createElement('style');
    style.id='sf73HistoryUxStyles';
    style.textContent=`
      #historyRows .sf73-history-order-title{display:block;font-weight:800;line-height:1.25;color:var(--text,#10233b)}
      #historyRows .sf73-history-order-number{display:block;margin-top:3px;font-size:11px;line-height:1.25;color:var(--muted,#68778b);font-weight:600}
      @media(max-width:950px){
        #history table[data-sf73-mobile-layout="cards"] td.sf73-history-supplier{display:none!important}
        #historyRows .sf73-history-order-title{font-size:15px}
        #historyRows .sf73-history-order-number{font-size:11px}
      }
    `;
    document.head.appendChild(style);
  }

  function enhanceHeader(){
    const first=document.querySelector('#history thead th:first-child');
    if(first&&first.textContent.trim()!=='Commande')first.textContent='Commande';
  }

  function enhanceRows(){
    document.querySelectorAll('#historyRows tr').forEach(row=>{
      const cells=[...row.children].filter(cell=>cell.tagName==='TD');
      const detail=row.querySelector('[data-detail]');
      if(!detail||cells.length<2)return;

      const first=cells[0];
      const supplierCell=cells[1];
      const supplier=String(supplierCell.textContent||'').trim();
      const storedNumber=String(row.dataset.sf73OrderNumber||'').trim();
      const currentNumber=first.querySelector('.sf73-history-order-number')?.dataset?.number||'';
      const number=storedNumber||currentNumber||String(first.textContent||'').trim();
      if(!number)return;

      row.dataset.sf73OrderNumber=number;
      supplierCell.classList.add('sf73-history-supplier');
      const signature=`${number}|${supplier}`;
      if(first.dataset.sf73HistorySignature===signature)return;
      first.dataset.sf73HistorySignature=signature;

      first.textContent='';
      const title=document.createElement('strong');
      title.className='sf73-history-order-title';
      title.textContent=supplier?`Commande — ${supplier}`:'Commande';

      const reference=document.createElement('small');
      reference.className='sf73-history-order-number';
      reference.dataset.number=number;
      reference.textContent=`N° ${number}`;

      first.append(title,reference);
      row.setAttribute('aria-label',`Ouvrir ${title.textContent}, ${reference.textContent}`);
    });
  }

  function apply(){
    injectStyles();
    enhanceHeader();
    enhanceRows();
    window.stopflow073MobileResponsiveStandard?.relayout?.();
  }

  function schedule(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{state.scheduled=false;apply()});
  }

  function observe(){
    if(state.observer)return;
    const target=document.getElementById('history')||document.body;
    if(!target)return;
    state.observer=new MutationObserver(schedule);
    state.observer.observe(target,{subtree:true,childList:true});
  }

  window.stopflow073HistoryUx={active:true,refresh:schedule};
  observe();
  [0,100,300,800,1600,3000].forEach(delay=>setTimeout(()=>{observe();schedule()},delay));
})();
