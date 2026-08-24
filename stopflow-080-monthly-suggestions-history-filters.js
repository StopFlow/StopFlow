/* StopFlow 0.8.0 — historique mensuel filtrable des Suggestions du mois. */
(function(){
  if(window.stopflow080MonthlySuggestionsHistoryFilters?.active)return;

  const state={status:'all',observer:null,scheduled:false};
  const page=()=>document.getElementById('sf54CuisineSuggestions');
  const list=()=>document.getElementById('sf80MsList');

  function selectedMonthLabel(){
    return String(document.querySelector('#sf80MsMonthButton strong')?.textContent||'').trim()||'Mois en cours';
  }

  function normalize(value){
    return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  }

  function itemStatus(item){
    const badge=normalize(item.querySelector('.badge')?.textContent);
    if(badge.includes('refuse'))return 'rejected';
    if(badge.includes('validee'))return 'approved';
    return 'pending';
  }

  function itemMatchesMonth(item,monthLabel){
    const wanted=normalize(monthLabel);
    if(!wanted||wanted==='mois en cours')return true;
    const title=normalize(item.querySelector('h3')?.textContent);
    if(title.includes(wanted))return true;
    const period=normalize(item.querySelector('.sf80-ms-period')?.textContent);
    return period.includes(wanted);
  }

  function bindButton(button,handler){
    if(!button||button.dataset.sf80HistoryFilterBound==='1')return;
    button.dataset.sf80HistoryFilterBound='1';
    if(typeof window.stopflow073MobileTap?.bind==='function'){
      window.stopflow073MobileTap.bind(button,handler);
      return;
    }
    button.addEventListener('click',handler);
  }

  function injectStyles(){
    if(document.getElementById('stopflow080MonthlySuggestionsHistoryFiltersStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080MonthlySuggestionsHistoryFiltersStyles';
    style.textContent=`
      #sf54CuisineSuggestions #sf80MsPendingCount{display:none!important}
      #sf54CuisineSuggestions .sf80-ms-history-context{margin-top:4px;color:var(--muted);font-size:13px;font-weight:650}
      #sf54CuisineSuggestions .sf80-ms-status-filters{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 4px;overflow:visible}
      #sf54CuisineSuggestions .sf80-ms-status-filter{
        position:relative;min-height:42px;padding:9px 12px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--text);font-weight:750;line-height:1.1
      }
      #sf54CuisineSuggestions .sf80-ms-status-filter.active{border-color:var(--blue);background:#edf3ff;color:var(--blue)}
      #sf54CuisineSuggestions .sf80-ms-filter-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;margin-left:6px;padding:0 6px;border-radius:999px;background:#eef1f5;color:#5d6a79;font-size:11px;font-weight:850}
      #sf54CuisineSuggestions .sf80-ms-status-filter.active .sf80-ms-filter-count{background:#dbe7ff;color:var(--blue)}
      #sf54CuisineSuggestions .sf80-ms-pending-notice{
        position:absolute;top:-9px;right:-5px;display:none;align-items:center;justify-content:center;min-width:21px;height:21px;padding:0 6px;border:2px solid #fff;border-radius:999px;background:#d93838;color:#fff;font-size:10px;font-weight:900;box-shadow:0 2px 7px rgba(0,0,0,.16)
      }
      #sf54CuisineSuggestions .sf80-ms-pending-notice.show{display:inline-flex}
      #sf54CuisineSuggestions .sf80-ms-filtered-empty{margin-top:12px;padding:16px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);background:#fbfcfe}
      @media(max-width:620px){
        #sf54CuisineSuggestions .sf80-ms-status-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}
        #sf54CuisineSuggestions .sf80-ms-status-filter{width:100%;min-width:0;padding:9px 8px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureControls(){
    injectStyles();
    const holder=list();
    if(!holder)return null;
    const card=holder.closest('.card');
    if(!card)return null;

    let context=card.querySelector('#sf80MsHistoryContext');
    if(!context){
      context=document.createElement('div');
      context.id='sf80MsHistoryContext';
      context.className='sf80-ms-history-context';
      const head=card.querySelector('.sf80-ms-history-head');
      head?.insertAdjacentElement('afterend',context);
    }

    let filters=card.querySelector('#sf80MsStatusFilters');
    if(!filters){
      filters=document.createElement('div');
      filters.id='sf80MsStatusFilters';
      filters.className='sf80-ms-status-filters';
      filters.innerHTML=`
        <button type="button" class="sf80-ms-status-filter" data-sf80-ms-filter="all">Toutes <span class="sf80-ms-filter-count" data-sf80-count="all">0</span></button>
        <button type="button" class="sf80-ms-status-filter" data-sf80-ms-filter="pending">À valider <span class="sf80-ms-filter-count" data-sf80-count="pending">0</span><span class="sf80-ms-pending-notice" data-sf80-pending-notice>0</span></button>
        <button type="button" class="sf80-ms-status-filter" data-sf80-ms-filter="approved">Validées <span class="sf80-ms-filter-count" data-sf80-count="approved">0</span></button>
        <button type="button" class="sf80-ms-status-filter" data-sf80-ms-filter="rejected">Refusées <span class="sf80-ms-filter-count" data-sf80-count="rejected">0</span></button>`;
      context?.insertAdjacentElement('afterend',filters);
      filters.querySelectorAll('[data-sf80-ms-filter]').forEach(button=>bindButton(button,()=>{
        state.status=button.dataset.sf80MsFilter||'all';
        applyFilters();
      }));
    }
    return {card,context,filters,holder};
  }

  function applyFilters(){
    const controls=ensureControls();
    if(!controls)return;
    const {context,filters,holder}=controls;
    const monthLabel=selectedMonthLabel();
    if(context)context.textContent=`Historique pour ${monthLabel}`;

    const items=[...holder.querySelectorAll(':scope > .sf80-ms-item')];
    const monthItems=items.filter(item=>itemMatchesMonth(item,monthLabel));
    const counts={all:monthItems.length,pending:0,approved:0,rejected:0};
    monthItems.forEach(item=>{counts[itemStatus(item)]+=1});

    filters.querySelectorAll('[data-sf80-ms-filter]').forEach(button=>{
      const key=button.dataset.sf80MsFilter||'all';
      button.classList.toggle('active',key===state.status);
      const count=button.querySelector(`[data-sf80-count="${key}"]`);
      if(count)count.textContent=String(counts[key]||0);
    });

    const notice=filters.querySelector('[data-sf80-pending-notice]');
    if(notice){
      notice.textContent=String(counts.pending||0);
      notice.classList.toggle('show',counts.pending>0);
    }

    let visible=0;
    items.forEach(item=>{
      const inMonth=itemMatchesMonth(item,monthLabel);
      const status=itemStatus(item);
      const show=inMonth&&(state.status==='all'||status===state.status);
      item.hidden=!show;
      if(show)visible+=1;
    });

    holder.querySelectorAll(':scope > .sf80-ms-empty').forEach(empty=>empty.hidden=true);
    let empty=holder.querySelector(':scope > .sf80-ms-filtered-empty');
    if(!visible){
      if(!empty){
        empty=document.createElement('div');
        empty.className='sf80-ms-filtered-empty';
        holder.appendChild(empty);
      }
      const label=state.status==='pending'?'à valider':state.status==='approved'?'validée':state.status==='rejected'?'refusée':'';
      empty.textContent=label?`Aucune suggestion ${label} pour ${monthLabel}.`:`Aucune suggestion enregistrée pour ${monthLabel}.`;
      empty.hidden=false;
    }else if(empty){
      empty.hidden=true;
    }
  }

  function schedule(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{
      state.scheduled=false;
      if(page()&&!page().classList.contains('hidden'))applyFilters();
    });
  }

  function installObserver(){
    const node=page();
    if(!node||state.observer)return;
    state.observer=new MutationObserver(schedule);
    state.observer.observe(node,{childList:true,subtree:true,characterData:true});
  }

  function refresh(){
    installObserver();
    schedule();
  }

  window.stopflow080MonthlySuggestionsHistoryFilters={active:true,version:'0.8.0',refresh};
  injectStyles();
  [0,100,350,900,1800].forEach(delay=>setTimeout(refresh,delay));
})();
