/* StopFlow 0.8.0 — validation, remarques et réponse au proposant pour Suggestions et Lunchs. */
(function(){
  if(window.stopflow080ProposalReviewFlow?.active)return;

  const S=window.SF54;
  if(!S)return;
  const state={lunchFilter:'all',scheduled:false,observers:[]};
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":"&#39;"}[char]));
  const sessionNow=()=>{try{return typeof session!=='undefined'?session:null}catch{return null}};
  const canReview=()=>Boolean(S.manager?.());
  const cloud=()=>typeof S.cloud==='function'&&S.cloud()&&window.supabaseClient;
  const content=()=>Array.isArray(S.state?.content)?S.state.content:[];
  const statusOf=item=>item?.review_status==='approved'?'approved':item?.review_status==='rejected'?'rejected':'pending';
  const statusLabel=status=>status==='approved'?'Validé':status==='rejected'?'Refusé':'À valider';
  const statusClass=status=>status==='approved'?'validated':status==='rejected'?'cancelled':'pending';

  function bindButton(button,handler){
    if(!button||button.dataset.sf80ProposalBound==='1')return;
    button.dataset.sf80ProposalBound='1';
    if(typeof window.stopflow073MobileTap?.bind==='function')window.stopflow073MobileTap.bind(button,handler);
    else button.addEventListener('click',handler);
    button.addEventListener('click',event=>{
      if(window.matchMedia?.('(max-width:950px)').matches)return;
      handler(event);
    });
  }

  function injectStyles(){
    if(document.getElementById('stopflow080ProposalReviewStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080ProposalReviewStyles';
    style.textContent=`
      .sf80-proposal-response{margin-top:10px;padding:10px 12px;border-radius:10px;background:#f6f8fb;color:#526174;font-size:12px;line-height:1.45}
      .sf80-proposal-response.mine{background:#eef5ff;color:#254e83;border:1px solid #d8e7ff}
      .sf80-proposal-response strong{display:block;margin-bottom:2px;color:inherit}
      .sf80-proposal-review-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .sf80-proposal-review-actions .btn{min-height:42px}
      #sf54Lunchs .sf80-lunch-review-context{margin-top:12px;color:var(--muted);font-size:13px;font-weight:650}
      #sf54Lunchs .sf80-lunch-review-filters{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 2px;overflow:visible}
      #sf54Lunchs .sf80-lunch-review-filter{position:relative;min-height:42px;padding:9px 12px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--text);font-weight:750}
      #sf54Lunchs .sf80-lunch-review-filter.active{border-color:var(--blue);background:#edf3ff;color:var(--blue)}
      #sf54Lunchs .sf80-lunch-review-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;margin-left:5px;padding:0 6px;border-radius:999px;background:#eef1f5;color:#5d6a79;font-size:11px;font-weight:850}
      #sf54Lunchs .sf80-lunch-pending-dot{position:absolute;top:-8px;right:-4px;display:none;align-items:center;justify-content:center;min-width:21px;height:21px;padding:0 6px;border:2px solid #fff;border-radius:999px;background:#d93838;color:#fff;font-size:10px;font-weight:900}
      #sf54Lunchs .sf80-lunch-pending-dot.show{display:inline-flex}
      #sf54Lunchs .sf80-lunch-filter-empty{margin-top:12px;padding:16px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);background:#fbfcfe}
      #sf80ReviewNoteModal{z-index:13100}
      #sf80ReviewNoteModal .modalbox{width:min(620px,100%);background:#fff}
      #sf80ReviewNoteTextarea{display:block;width:100%;min-height:150px;font-size:16px!important;line-height:1.5;resize:vertical}
      #sf80ReviewNoteModal .sf80-review-note-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
      @media(max-width:620px){
        #sf54Lunchs .sf80-lunch-review-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
        #sf54Lunchs .sf80-lunch-review-filter{width:100%;min-width:0;padding:9px 7px}
        .sf80-proposal-review-actions{display:grid;grid-template-columns:1fr 1fr}
        #sf80ReviewNoteModal{padding:12px!important;align-items:flex-start!important;padding-top:max(16px,env(safe-area-inset-top))!important}
        #sf80ReviewNoteModal .modalbox{margin:0!important;max-height:calc(100dvh - 28px)!important;overflow:auto!important;border-radius:16px!important}
        #sf80ReviewNoteTextarea{min-height:130px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureNoteModal(){
    let modal=document.getElementById('sf80ReviewNoteModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='sf80ReviewNoteModal';
    modal.className='modal hidden';
    modal.innerHTML=`<div class="modalbox"><h2 id="sf80ReviewNoteTitle">Refuser la proposition</h2><p class="muted" id="sf80ReviewNoteHint">Vous pouvez expliquer la raison du refus au proposant.</p><textarea id="sf80ReviewNoteTextarea" class="input" autocomplete="off" placeholder="Remarque pour le proposant…"></textarea><div class="sf80-review-note-actions"><button type="button" class="btn ghost" id="sf80ReviewNoteCancel">Annuler</button><button type="button" class="btn danger" id="sf80ReviewNoteConfirm">Refuser</button></div></div>`;
    document.body.appendChild(modal);
    bindButton(modal.querySelector('#sf80ReviewNoteCancel'),()=>modal.classList.add('hidden'));
    bindButton(modal.querySelector('#sf80ReviewNoteConfirm'),async()=>{
      const id=modal.dataset.itemId;
      const kind=modal.dataset.kind;
      const note=String(modal.querySelector('#sf80ReviewNoteTextarea')?.value||'').trim();
      const confirm=modal.querySelector('#sf80ReviewNoteConfirm');
      confirm.disabled=true;confirm.textContent='Refus…';
      try{
        await decide(id,'rejected',note,kind);
        modal.classList.add('hidden');
      }finally{
        confirm.disabled=false;confirm.textContent='Refuser';
      }
    });
    return modal;
  }

  function openReject(id,kind,label){
    const modal=ensureNoteModal();
    modal.dataset.itemId=String(id||'');
    modal.dataset.kind=kind||'';
    modal.querySelector('#sf80ReviewNoteHint').textContent=`${label||'Cette proposition'} sera refusée. Ajoutez si nécessaire une remarque pour expliquer la décision.`;
    const textarea=modal.querySelector('#sf80ReviewNoteTextarea');
    textarea.value='';
    modal.classList.remove('hidden');
    try{textarea.focus({preventScroll:true})}catch{}
  }

  async function decide(id,status,note='',kind=''){
    if(!canReview()||!id)return;
    const item=content().find(row=>String(row.id)===String(id));
    if(!item)return;
    const s=sessionNow();
    const now=new Date().toISOString();
    const patch={review_status:status,review_note:String(note||'').trim(),reviewed_by:s?.id||null,reviewed_by_name:s?.name||'',reviewed_at:now,updated_at:now};
    try{
      if(cloud()){
        const {data,error}=await supabaseClient.from('department_content').update(patch).eq('id',id).select('*').single();
        if(error)throw error;
        Object.assign(item,data||patch);
      }else{
        Object.assign(item,patch);
        localStorage.setItem('sf54_content',JSON.stringify(content()));
      }
      if(kind==='suggestion')window.stopflow080MonthlySuggestionsFlow?.refresh?.();
      if(kind==='lunch')window.stopflow080KitchenPlanning?.renderLunchList?.();
      setTimeout(refresh,60);
    }catch(error){
      console.warn('StopFlow 0.8.0 — décision proposition',error);
      alert(error?.message||'Impossible d’enregistrer cette décision.');
      throw error;
    }
  }

  function responseMarkup(item){
    const status=statusOf(item);
    if(status==='pending')return '';
    const s=sessionNow();
    const mine=Boolean(s?.id&&String(item.created_by||'')===String(s.id));
    const reviewer=String(item.reviewed_by_name||'').trim();
    const note=String(item.review_note||'').trim();
    const date=item.reviewed_at?new Date(item.reviewed_at).toLocaleDateString('fr-BE'):'';
    const heading=mine?'Réponse à votre proposition':'Décision enregistrée';
    const decision=status==='approved'?'Validée':'Refusée';
    return `<div class="sf80-proposal-response${mine?' mine':''}"><strong>${heading} : ${decision}</strong>${reviewer?`Par ${esc(reviewer)}`:''}${date?`${reviewer?' · ':''}${esc(date)}`:''}${note?`<br>Remarque : ${esc(note)}`:''}</div>`;
  }

  function suggestionForCard(card){
    const direct=card.querySelector('[data-sf80-ms-approve],[data-sf80-ms-reject]');
    const id=direct?.dataset.sf80MsApprove||direct?.dataset.sf80MsReject;
    if(id)return content().find(row=>String(row.id)===String(id))||null;
    const title=String(card.querySelector('h3')?.textContent||'').trim();
    const body=String(card.querySelector('.sf80-ms-content')?.textContent||'').trim();
    return content().find(row=>row.content_type==='monthly_suggestion'&&String(row.title||'').trim()===title&&String(row.content||'').trim()===body)||null;
  }

  function enhanceSuggestions(){
    const page=document.getElementById('sf54CuisineSuggestions');
    if(!page||page.classList.contains('hidden'))return;
    page.querySelectorAll('.sf80-ms-item').forEach(card=>{
      const item=suggestionForCard(card);
      if(!item)return;
      card.dataset.sf80ProposalId=item.id;
      const oldApprove=card.querySelector('[data-sf80-ms-approve]');
      const oldReject=card.querySelector('[data-sf80-ms-reject]');
      if(oldApprove)oldApprove.hidden=true;
      if(oldReject)oldReject.hidden=true;
      card.querySelector('.sf80-proposal-review-actions')?.remove();
      if(canReview()&&statusOf(item)==='pending'){
        const actions=document.createElement('div');
        actions.className='sf80-proposal-review-actions';
        actions.innerHTML='<button type="button" class="btn small secondary" data-sf80-review-approve>Valider</button><button type="button" class="btn small danger" data-sf80-review-reject>Refuser</button>';
        (card.querySelector('.sf80-ms-actions')||card).appendChild(actions);
        bindButton(actions.querySelector('[data-sf80-review-approve]'),()=>decide(item.id,'approved','','suggestion'));
        bindButton(actions.querySelector('[data-sf80-review-reject]'),()=>openReject(item.id,'suggestion',item.title||'Cette suggestion'));
      }
      card.querySelector('.sf80-proposal-response')?.remove();
      const html=responseMarkup(item);
      if(html)card.insertAdjacentHTML('beforeend',html);
    });
  }

  function lunchForCard(card){
    const archive=card.querySelector('[data-sf80-lunch-archive]');
    const id=archive?.dataset.sf80LunchArchive;
    if(id)return content().find(row=>String(row.id)===String(id))||null;
    const title=String(card.querySelector('h3')?.textContent||'').trim();
    const candidates=content().filter(row=>row.content_type==='weekly_lunch'&&String(row.title||'').trim()===title);
    if(candidates.length<=1)return candidates[0]||null;
    const text=String(card.textContent||'').toLocaleLowerCase('fr');
    return candidates.find(row=>String(row.content||'').split(/\n+/).filter(line=>/^plat\s*[12]\s*:/i.test(line)).every(line=>text.includes(line.replace(/^plat\s*[12]\s*:\s*/i,'').trim().toLocaleLowerCase('fr'))))||candidates[0];
  }

  function selectedWeekKey(){
    const text=String(document.getElementById('sf80LunchWeekCurrent')?.textContent||'').trim();
    const week=/Semaine\s+(\d+)/i.exec(text)?.[1];
    const years=text.match(/\b(20\d{2})\b/g);
    const year=years?.[years.length-1];
    return week&&year?`Semaine ${Number(week)} · ${year}`:'';
  }

  function ensureLunchControls(){
    const holder=document.getElementById('sf80LunchList');
    const history=holder?.closest('.sf80-planning-history');
    if(!holder||!history)return null;
    let context=history.querySelector('#sf80LunchReviewContext');
    if(!context){
      context=document.createElement('div');
      context.id='sf80LunchReviewContext';
      context.className='sf80-lunch-review-context';
      const search=history.querySelector('.sf80-history-search');
      (search||holder).insertAdjacentElement(search?'afterend':'beforebegin',context);
    }
    let filters=history.querySelector('#sf80LunchReviewFilters');
    if(!filters){
      filters=document.createElement('div');
      filters.id='sf80LunchReviewFilters';
      filters.className='sf80-lunch-review-filters';
      filters.innerHTML=`<button type="button" class="sf80-lunch-review-filter" data-lunch-status="all">Toutes <span class="sf80-lunch-review-count" data-count="all">0</span></button><button type="button" class="sf80-lunch-review-filter" data-lunch-status="pending">À valider <span class="sf80-lunch-review-count" data-count="pending">0</span><span class="sf80-lunch-pending-dot" data-pending-dot>0</span></button><button type="button" class="sf80-lunch-review-filter" data-lunch-status="approved">Validés <span class="sf80-lunch-review-count" data-count="approved">0</span></button><button type="button" class="sf80-lunch-review-filter" data-lunch-status="rejected">Refusés <span class="sf80-lunch-review-count" data-count="rejected">0</span></button>`;
      context.insertAdjacentElement('afterend',filters);
      filters.querySelectorAll('[data-lunch-status]').forEach(button=>bindButton(button,()=>{state.lunchFilter=button.dataset.lunchStatus||'all';enhanceLunchs()}));
    }
    return {holder,history,context,filters};
  }

  function enhanceLunchCard(card,item){
    if(!item)return;
    card.dataset.sf80ProposalId=item.id;
    const status=statusOf(item);
    const badge=card.querySelector('.badge');
    if(badge){
      badge.classList.remove('validated','cancelled','pending');
      badge.classList.add(statusClass(status));
      badge.textContent=statusLabel(status);
    }
    card.querySelector('.sf80-proposal-review-actions')?.remove();
    if(canReview()&&status==='pending'){
      let tools=card.querySelector('.sf80-planning-tools');
      if(!tools){tools=document.createElement('div');tools.className='sf80-planning-tools';card.appendChild(tools);}
      const actions=document.createElement('div');
      actions.className='sf80-proposal-review-actions';
      actions.innerHTML='<button type="button" class="btn small secondary" data-sf80-review-approve>Valider</button><button type="button" class="btn small danger" data-sf80-review-reject>Refuser</button>';
      tools.prepend(actions);
      bindButton(actions.querySelector('[data-sf80-review-approve]'),()=>decide(item.id,'approved','','lunch'));
      bindButton(actions.querySelector('[data-sf80-review-reject]'),()=>openReject(item.id,'lunch',item.title||'Ce lunch'));
    }
    card.querySelector('.sf80-proposal-response')?.remove();
    const html=responseMarkup(item);
    if(html)card.insertAdjacentHTML('beforeend',html);
  }

  function enhanceLunchs(){
    const page=document.getElementById('sf54Lunchs');
    if(!page||page.classList.contains('hidden'))return;
    const controls=ensureLunchControls();
    if(!controls)return;
    const {holder,context,filters}=controls;
    const searching=/^Recherche\s*:/i.test(String(document.getElementById('sf80LunchSearchLabel')?.textContent||'').trim());
    const weekKey=selectedWeekKey();
    context.textContent=searching?'Résultats dans tout l’historique':weekKey?`Historique pour ${weekKey}`:'Historique de la semaine sélectionnée';

    const cards=[...holder.querySelectorAll(':scope > .sf80-planning-item')];
    const entries=cards.map(card=>({card,item:lunchForCard(card)})).filter(entry=>entry.item);
    entries.forEach(({card,item})=>enhanceLunchCard(card,item));
    const contextual=entries.filter(({item})=>searching||!weekKey||String(item.title||'').includes(weekKey));
    const counts={all:contextual.length,pending:0,approved:0,rejected:0};
    contextual.forEach(({item})=>counts[statusOf(item)]+=1);

    filters.querySelectorAll('[data-lunch-status]').forEach(button=>{
      const key=button.dataset.lunchStatus||'all';
      button.classList.toggle('active',key===state.lunchFilter);
      const count=button.querySelector(`[data-count="${key}"]`);if(count)count.textContent=String(counts[key]||0);
    });
    const dot=filters.querySelector('[data-pending-dot]');
    if(dot){dot.textContent=String(counts.pending||0);dot.classList.toggle('show',canReview()&&counts.pending>0);}

    let visible=0;
    entries.forEach(({card,item})=>{
      const inContext=searching||!weekKey||String(item.title||'').includes(weekKey);
      const status=statusOf(item);
      const show=inContext&&(state.lunchFilter==='all'||state.lunchFilter===status);
      card.hidden=!show;
      if(show)visible+=1;
    });
    holder.querySelectorAll(':scope > .sf80-empty').forEach(empty=>empty.hidden=entries.length>0);
    let empty=holder.querySelector(':scope > .sf80-lunch-filter-empty');
    if(!visible){
      if(!empty){empty=document.createElement('div');empty.className='sf80-lunch-filter-empty';holder.appendChild(empty);}
      const label=state.lunchFilter==='pending'?'à valider':state.lunchFilter==='approved'?'validé':state.lunchFilter==='rejected'?'refusé':'';
      empty.textContent=searching?(label?`Aucun lunch ${label} dans cette recherche.`:'Aucun résultat.'):(label?`Aucun lunch ${label} pour cette semaine.`:'Aucun lunch enregistré pour cette semaine.');
      empty.hidden=false;
    }else if(empty)empty.hidden=true;
  }

  function enhance(){
    injectStyles();
    ensureNoteModal();
    enhanceSuggestions();
    enhanceLunchs();
  }

  function schedule(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{state.scheduled=false;enhance()});
  }

  function installObservers(){
    ['sf54CuisineSuggestions','sf54Lunchs'].forEach(id=>{
      const node=document.getElementById(id);
      if(!node||node.dataset.sf80ReviewObserved==='1')return;
      node.dataset.sf80ReviewObserved='1';
      const observer=new MutationObserver(schedule);
      observer.observe(node,{childList:true,subtree:true,characterData:true});
      state.observers.push(observer);
    });
  }

  function refresh(){installObservers();schedule()}
  window.stopflow080ProposalReviewFlow={active:true,version:'0.8.0',refresh};
  injectStyles();
  ensureNoteModal();
  [0,100,350,900,1800].forEach(delay=>setTimeout(refresh,delay));
})();
