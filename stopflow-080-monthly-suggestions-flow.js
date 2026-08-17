/* StopFlow 0.8.0 — Suggestions du mois : saisie directe + validation responsable. */
(function(){
  if(window.stopflow080MonthlySuggestionsFlow?.active)return;

  const S=window.SF54;
  if(!S)return;

  const MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const ui={month:'',year:new Date().getFullYear(),draft:''};
  let scheduled=false;

  const esc=value=>S.esc?S.esc(value):String(value??'');
  const nav=()=>window.stopflow070CardNavigation;
  const canSubmit=()=>Boolean(S.manager?.()||nav()?.hasPermission?.('monthly_suggestions.manage','cuisine'));
  const canReview=()=>Boolean(S.manager?.());
  const isCloud=()=>typeof S.cloud==='function'&&S.cloud();
  const pad=value=>String(value).padStart(2,'0');

  function currentMonthKey(){
    const date=new Date();
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}`;
  }
  function monthLabel(key){
    const match=/^(\d{4})-(\d{2})$/.exec(String(key||''));
    if(!match)return 'Choisir le mois';
    const label=`${MONTHS[Number(match[2])-1]} ${match[1]}`;
    return label.replace(/^./,letter=>letter.toUpperCase());
  }
  function ymd(date){
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  }
  function monthPeriod(key){
    const [year,month]=String(key).split('-').map(Number);
    return {start:ymd(new Date(year,month-1,1)),end:ymd(new Date(year,month,0))};
  }
  function formatPeriod(start,end){
    if(!start)return '';
    const a=new Date(`${start}T12:00:00`);
    const b=end?new Date(`${end}T12:00:00`):a;
    const first=a.toLocaleDateString('fr-BE',{day:'numeric',month:'long'});
    const second=b.toLocaleDateString('fr-BE',{day:'numeric',month:'long',year:'numeric'});
    return `${first} → ${second}`;
  }
  function statusOf(item){
    if(item.review_status==='approved')return 'approved';
    if(item.review_status==='rejected')return 'rejected';
    return 'pending';
  }
  function statusLabel(status){
    return status==='approved'?'Validée':status==='rejected'?'Refusée':'À valider';
  }
  function statusClass(status){
    return status==='approved'?'validated':status==='rejected'?'cancelled':'pending';
  }
  function rows(){
    return (S.state?.content||[])
      .filter(item=>item.department==='cuisine'&&item.content_type==='monthly_suggestion')
      .slice()
      .sort((a,b)=>{
        const ap=statusOf(a)==='pending'?0:1;
        const bp=statusOf(b)==='pending'?0:1;
        if(ap!==bp)return ap-bp;
        return String(b.period_start||b.created_at||'').localeCompare(String(a.period_start||a.created_at||''));
      });
  }
  function bindButton(button,handler){
    if(!button||typeof handler!=='function')return;
    if(typeof window.stopflow073MobileTap?.bind==='function'){
      window.stopflow073MobileTap.bind(button,()=>handler(button));
      if(!button.dataset.sf80MonthlyDesktopClick){
        button.dataset.sf80MonthlyDesktopClick='1';
        button.addEventListener('click',event=>{
          if(window.matchMedia?.('(max-width: 950px)').matches)return;
          handler(button,event);
        });
      }
      return;
    }
    button.addEventListener('click',event=>handler(button,event));
  }

  if(!ui.month)ui.month=currentMonthKey();

  function injectStyles(){
    if(document.getElementById('stopflow080MonthlySuggestionsFlowStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080MonthlySuggestionsFlowStyles';
    style.textContent=`
      #sf54CuisineSuggestions{max-width:980px;padding-bottom:84px}
      #sf54CuisineSuggestions .sf80-ms-form{margin-top:0}
      #sf54CuisineSuggestions .sf80-ms-month-button{width:100%;min-height:50px;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left}
      #sf54CuisineSuggestions .sf80-ms-month-button strong{font-size:16px}
      #sf54CuisineSuggestions .sf80-ms-month-button span{display:block;margin-top:2px;color:var(--muted);font-size:12px;font-weight:600}
      #sf54CuisineSuggestions .sf80-ms-month-panel{display:none;margin-top:10px;border:1px solid var(--line);border-radius:13px;padding:12px;background:#f8fafc}
      #sf54CuisineSuggestions .sf80-ms-month-panel.open{display:block}
      #sf54CuisineSuggestions .sf80-ms-year{display:grid;grid-template-columns:44px 1fr 44px;gap:8px;align-items:center;margin-bottom:10px}
      #sf54CuisineSuggestions .sf80-ms-year strong{text-align:center;font-size:16px}
      #sf54CuisineSuggestions .sf80-ms-year .btn{min-height:42px;padding:8px}
      #sf54CuisineSuggestions .sf80-ms-month-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      #sf54CuisineSuggestions .sf80-ms-month-option{min-height:44px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--text);font-weight:750}
      #sf54CuisineSuggestions .sf80-ms-month-option.selected{border-color:var(--blue);background:#edf3ff;color:var(--blue)}
      #sf54CuisineSuggestions .sf80-ms-text-wrap{margin-top:14px}
      #sf54CuisineSuggestions .sf80-ms-textarea{
        display:block!important;
        width:100%!important;
        min-height:180px!important;
        padding:14px!important;
        border:1px solid var(--line)!important;
        border-radius:12px!important;
        background:#fff!important;
        color:var(--text)!important;
        font-size:16px!important;
        line-height:1.5!important;
        resize:vertical!important;
        outline:none!important;
        position:relative!important;
        z-index:2!important;
        pointer-events:auto!important;
        touch-action:auto!important;
        user-select:text!important;
        -webkit-user-select:text!important;
        -webkit-appearance:none!important;
      }
      #sf54CuisineSuggestions .sf80-ms-textarea::placeholder{color:#98a2b3;font-style:italic;opacity:1}
      #sf54CuisineSuggestions .sf80-ms-textarea:focus{border-color:#7aa4ff!important;box-shadow:0 0 0 3px #e7efff!important}
      #sf54CuisineSuggestions .sf80-ms-save{width:100%;min-height:50px;margin-top:12px}
      #sf54CuisineSuggestions .sf80-ms-feedback{display:none;margin-top:10px;padding:10px 12px;border-radius:10px;background:#e6f7ef;color:#0f7f50;font-size:13px;font-weight:700}
      #sf54CuisineSuggestions .sf80-ms-feedback.show{display:block}
      #sf54CuisineSuggestions .sf80-ms-history-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
      #sf54CuisineSuggestions .sf80-ms-list{display:grid;gap:10px;margin-top:12px}
      #sf54CuisineSuggestions .sf80-ms-item{border:1px solid var(--line);border-radius:13px;background:#fff;padding:14px}
      #sf54CuisineSuggestions .sf80-ms-item-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
      #sf54CuisineSuggestions .sf80-ms-item h3{margin:0;font-size:16px;line-height:1.25}
      #sf54CuisineSuggestions .sf80-ms-period{display:block;margin-top:4px;color:var(--muted);font-size:12px}
      #sf54CuisineSuggestions .sf80-ms-content{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px;line-height:1.5}
      #sf54CuisineSuggestions .sf80-ms-meta{margin-top:8px;color:var(--muted);font-size:12px}
      #sf54CuisineSuggestions .sf80-ms-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      #sf54CuisineSuggestions .sf80-ms-empty{padding:16px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);background:#fbfcfe}
      @media(max-width:620px){
        #sf54CuisineSuggestions .card{margin-top:12px;padding:15px}
        #sf54CuisineSuggestions .card:first-of-type{margin-top:0}
        #sf54CuisineSuggestions .sf54-page-head{margin-bottom:12px}
        #sf54CuisineSuggestions h2{font-size:20px;line-height:1.2}
        #sf54CuisineSuggestions .sf80-ms-textarea{min-height:165px!important}
        #sf54CuisineSuggestions .sf80-ms-item{padding:13px}
        #sf54CuisineSuggestions .sf80-ms-item-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start}
        #sf54CuisineSuggestions .sf80-ms-actions .btn{flex:1;min-height:44px}
      }
    `;
    document.head.appendChild(style);
  }

  function renderMonthPanel(){
    const panel=document.getElementById('sf80MsMonthPanel');
    if(!panel)return;
    const selectedYear=Number(String(ui.month).slice(0,4));
    const selectedMonth=Number(String(ui.month).slice(5,7));
    panel.innerHTML=`<div class="sf80-ms-year"><button class="btn ghost" id="sf80MsYearPrev" type="button" aria-label="Année précédente">‹</button><strong>${ui.year}</strong><button class="btn ghost" id="sf80MsYearNext" type="button" aria-label="Année suivante">›</button></div><div class="sf80-ms-month-grid">${MONTHS.map((name,index)=>{const month=index+1;const selected=ui.year===selectedYear&&month===selectedMonth;return `<button class="sf80-ms-month-option${selected?' selected':''}" type="button" data-sf80-ms-month="${month}">${name.replace(/^./,c=>c.toUpperCase())}</button>`}).join('')}</div>`;
    bindButton(panel.querySelector('#sf80MsYearPrev'),()=>{ui.year-=1;renderMonthPanel()});
    bindButton(panel.querySelector('#sf80MsYearNext'),()=>{ui.year+=1;renderMonthPanel()});
    panel.querySelectorAll('[data-sf80-ms-month]').forEach(button=>bindButton(button,()=>{
      ui.month=`${ui.year}-${pad(button.dataset.sf80MsMonth)}`;
      panel.classList.remove('open');
      refreshMonthButton();
    }));
  }

  function refreshMonthButton(){
    const button=document.getElementById('sf80MsMonthButton');
    if(button)button.innerHTML=`<div><strong>${esc(monthLabel(ui.month))}</strong><span>Mois des suggestions</span></div><b>⌄</b>`;
  }

  function toggleMonthPanel(){
    const panel=document.getElementById('sf80MsMonthPanel');
    if(!panel)return;
    ui.year=Number(String(ui.month||currentMonthKey()).slice(0,4));
    renderMonthPanel();
    panel.classList.toggle('open');
  }

  function renderPage(){
    injectStyles();
    const page=document.getElementById('sf54CuisineSuggestions');
    if(!page)return;
    const submit=canSubmit();
    page.dataset.sf80MonthlySuggestionsFlow='1';
    page.innerHTML=`
      <div class="sf54-page-head"><div><h2>Suggestions du mois</h2><p class="muted">Choisissez le mois, écrivez les suggestions directement, puis enregistrez-les.</p></div></div>
      ${submit?`<div class="card sf80-ms-form">
        <h2>Ajouter les suggestions</h2>
        <button class="btn ghost sf80-ms-month-button" id="sf80MsMonthButton" type="button"></button>
        <div class="sf80-ms-month-panel" id="sf80MsMonthPanel"></div>
        <div class="field sf80-ms-text-wrap"><label for="sf80MsTextarea">Suggestions</label><textarea class="input sf80-ms-textarea" id="sf80MsTextarea" rows="7" autocomplete="off" placeholder="Écrivez vos suggestions du mois…"></textarea></div>
        <button class="btn primary sf80-ms-save" id="sf80MsSave" type="button">Enregistrer les suggestions</button>
        <div class="sf80-ms-feedback" id="sf80MsFeedback" aria-live="polite">Suggestions envoyées pour validation.</div>
      </div>`:''}
      <div class="card"><div class="sf80-ms-history-head"><div><h2>Historique des suggestions</h2><p class="muted">Les nouvelles propositions restent visibles avec leur état de validation.</p></div><span class="badge pending hidden" id="sf80MsPendingCount"></span></div><div class="sf80-ms-list" id="sf80MsList"></div></div>`;

    if(submit){
      const textarea=page.querySelector('#sf80MsTextarea');
      if(textarea){
        textarea.value=ui.draft;
        textarea.addEventListener('input',()=>{ui.draft=textarea.value});
      }
      bindButton(page.querySelector('#sf80MsMonthButton'),toggleMonthPanel);
      bindButton(page.querySelector('#sf80MsSave'),saveSuggestion);
      refreshMonthButton();
    }
    renderList();
  }

  async function saveSuggestion(){
    const textarea=document.getElementById('sf80MsTextarea');
    const body=String(textarea?.value||ui.draft||'').trim();
    if(!ui.month)return alert('Choisissez un mois.');
    if(!body)return alert('Écrivez au moins une suggestion.');
    const button=document.getElementById('sf80MsSave');
    if(!button)return;
    const {start,end}=monthPeriod(ui.month);
    button.disabled=true;
    button.textContent='Enregistrement…';
    try{
      await S.saveContent({
        id:crypto.randomUUID(),
        department:'cuisine',
        content_type:'monthly_suggestion',
        title:`Suggestions — ${monthLabel(ui.month)}`,
        content:body,
        period_start:start,
        period_end:end,
        active:true,
        review_status:'pending',
        reviewed_by:null,
        reviewed_by_name:'',
        reviewed_at:null,
        created_by:session?.id||null,
        created_by_name:session?.name||'',
        created_at:new Date().toISOString()
      });
      ui.draft='';
      if(textarea)textarea.value='';
      const feedback=document.getElementById('sf80MsFeedback');
      feedback?.classList.add('show');
      setTimeout(()=>feedback?.classList.remove('show'),2600);
      renderList();
    }catch(error){
      console.warn('StopFlow 0.8.0 — suggestion mensuelle',error);
      alert(error?.message||'Impossible d’enregistrer les suggestions.');
    }finally{
      button.disabled=false;
      button.textContent='Enregistrer les suggestions';
    }
  }

  async function reviewSuggestion(id,status){
    if(!canReview())return;
    const item=(S.state?.content||[]).find(row=>String(row.id)===String(id));
    if(!item)return;
    const now=new Date().toISOString();
    const patch={review_status:status,reviewed_by:session?.id||null,reviewed_by_name:session?.name||'',reviewed_at:now,updated_at:now};
    try{
      if(isCloud()){
        const {data,error}=await supabaseClient.from('department_content').update(patch).eq('id',id).select('*').single();
        if(error)throw error;
        Object.assign(item,data||patch);
      }else{
        Object.assign(item,patch);
        localStorage.setItem('sf54_content',JSON.stringify(S.state.content||[]));
      }
      renderList();
    }catch(error){
      console.warn('StopFlow 0.8.0 — validation suggestion mensuelle',error);
      alert(error?.message||'Impossible de modifier le statut de cette suggestion.');
    }
  }

  function renderList(){
    const holder=document.getElementById('sf80MsList');
    if(!holder)return;
    const data=rows();
    const pending=data.filter(item=>statusOf(item)==='pending').length;
    const count=document.getElementById('sf80MsPendingCount');
    if(count){
      count.textContent=`${pending} à valider`;
      count.classList.toggle('hidden',!canReview()||pending===0);
    }
    holder.innerHTML=data.length?data.map(item=>{
      const status=statusOf(item);
      const reviewer=item.reviewed_by_name?` · ${esc(item.reviewed_by_name)}`:'';
      const reviewed=item.reviewed_at?` · ${new Date(item.reviewed_at).toLocaleDateString('fr-BE')}`:'';
      return `<article class="sf80-ms-item"><div class="sf80-ms-item-head"><div><h3>${esc(item.title||'Suggestions du mois')}</h3><span class="sf80-ms-period">${esc(formatPeriod(item.period_start,item.period_end))}</span></div><span class="badge ${statusClass(status)}">${statusLabel(status)}</span></div><div class="sf80-ms-content">${esc(item.content||'')}</div><div class="sf80-ms-meta">Proposé par ${esc(item.created_by_name||'—')}${status!=='pending'?` · Décision${reviewer}${reviewed}`:''}</div>${canReview()&&status==='pending'?`<div class="sf80-ms-actions"><button class="btn small secondary" type="button" data-sf80-ms-approve="${esc(item.id)}">Valider</button><button class="btn small danger" type="button" data-sf80-ms-reject="${esc(item.id)}">Refuser</button></div>`:''}</article>`;
    }).join(''):'<div class="sf80-ms-empty">Aucune suggestion mensuelle enregistrée.</div>';

    holder.querySelectorAll('[data-sf80-ms-approve]').forEach(button=>bindButton(button,()=>reviewSuggestion(button.dataset.sf80MsApprove,'approved')));
    holder.querySelectorAll('[data-sf80-ms-reject]').forEach(button=>bindButton(button,()=>reviewSuggestion(button.dataset.sf80MsReject,'rejected')));
  }

  function activePage(){
    return document.querySelector('#app .page:not(.hidden)')?.id||'';
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      if(activePage()==='sf54CuisineSuggestions')renderPage();
    });
  }

  const previousRender=S.render;
  if(typeof previousRender==='function'){
    S.render=function(){
      if(activePage()==='sf54CuisineSuggestions'){
        renderPage();
        return;
      }
      return previousRender.apply(this,arguments);
    };
  }

  const previousAction=S.action;
  if(typeof previousAction==='function'){
    S.action=function(action,department){
      if(action==='suggestions-month'){
        document.getElementById('sf52DrawerClose')?.click();
        if(typeof page==='function')page('sf54CuisineSuggestions');
        setTimeout(renderPage,30);
        return;
      }
      return previousAction.apply(this,arguments);
    };
  }

  window.stopflow080MonthlySuggestionsFlow={active:true,version:'0.8.0',refresh:schedule,render:renderPage};
  injectStyles();
  [150,600,1600].forEach(delay=>setTimeout(schedule,delay));
})();
