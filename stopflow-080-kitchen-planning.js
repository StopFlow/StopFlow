/* StopFlow 0.8.0 — planning Cuisine fiable sur iPhone, sans saisie native directe sur les pages. */
(function(){
  if(window.stopflow080KitchenPlanning?.active)return;

  const S=window.SF54;
  if(!S)return;

  const esc=value=>S.esc?S.esc(value):String(value??'');
  const nav=()=>window.stopflow070CardNavigation;
  const manager=permission=>Boolean(S.manager?.()||nav()?.hasPermission?.(permission,'cuisine'));
  const MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const ui={
    month:'',
    monthYear:new Date().getFullYear(),
    monthlyDraft:'',
    weekMonday:null,
    main1:'',
    main2:'',
    search:''
  };
  let scheduled=false;
  let editorCommit=null;

  function pad(value){return String(value).padStart(2,'0')}
  function localDate(value){
    if(value instanceof Date)return new Date(value.getFullYear(),value.getMonth(),value.getDate());
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(match)return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
    const date=new Date(value);
    return Number.isNaN(date.getTime())?new Date():new Date(date.getFullYear(),date.getMonth(),date.getDate());
  }
  function ymd(date){const d=localDate(date);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
  function addDays(date,days){const d=localDate(date);d.setDate(d.getDate()+days);return d}
  function mondayOf(date){const d=localDate(date);const day=d.getDay()||7;d.setDate(d.getDate()-day+1);return d}
  function isoWeek(date){
    const d=localDate(date);d.setHours(0,0,0,0);d.setDate(d.getDate()+4-(d.getDay()||7));
    const year=d.getFullYear();
    const start=new Date(year,0,1);
    const week=Math.ceil((((d-start)/86400000)+1)/7);
    return {year,week};
  }
  function formatDate(date,withYear=false){
    return localDate(date).toLocaleDateString('fr-BE',{day:'numeric',month:'long',...(withYear?{year:'numeric'}:{})});
  }
  function periodLabel(start,end){
    if(!start)return 'Sans période';
    const a=localDate(start),b=end?localDate(end):a;
    return `${formatDate(a)} → ${formatDate(b,true)}`;
  }
  function currentMonthKey(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}`}
  function monthLabel(key){
    const match=/^(\d{4})-(\d{2})$/.exec(String(key||''));
    if(!match)return 'Choisir le mois';
    return `${MONTHS[Number(match[2])-1]} ${match[1]}`.replace(/^./,c=>c.toUpperCase());
  }
  function monthPeriod(key){
    const [year,month]=String(key).split('-').map(Number);
    const start=new Date(year,month-1,1),end=new Date(year,month,0);
    return {start:ymd(start),end:ymd(end)};
  }
  function weekLabel(monday){
    const m=localDate(monday),friday=addDays(m,4),info=isoWeek(m);
    return `Semaine ${info.week} · du ${formatDate(m)} au ${formatDate(friday,true)}`;
  }
  function contentRows(type){
    return (S.state?.content||[])
      .filter(item=>item.department==='cuisine'&&item.content_type===type)
      .slice()
      .sort((a,b)=>String(b.period_start||b.created_at||'').localeCompare(String(a.period_start||a.created_at||'')));
  }
  function bindButton(button,handler){
    if(!button||typeof handler!=='function')return;
    if(typeof window.stopflow073MobileTap?.bind==='function'){
      window.stopflow073MobileTap.bind(button,()=>handler(button));
      if(!button.dataset.sf80DesktopClick){
        button.dataset.sf80DesktopClick='1';
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
  if(!ui.weekMonday)ui.weekMonday=mondayOf(new Date());

  function injectStyles(){
    if(document.getElementById('stopflow080KitchenPlanningStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080KitchenPlanningStyles';
    style.textContent=`
      #sf54CuisineSuggestions,#sf54Lunchs{max-width:980px;padding-bottom:84px}
      .sf80-planning-form,.sf80-planning-history{margin-top:0}
      .sf80-choice-button{width:100%;min-height:50px;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left}
      .sf80-choice-button strong{font-size:15px}
      .sf80-choice-button span{color:var(--muted);font-size:13px}
      .sf80-month-panel{display:none;margin-top:10px;border:1px solid var(--line);border-radius:13px;padding:12px;background:#f8fafc}
      .sf80-month-panel.open{display:block}
      .sf80-month-year{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:8px;margin-bottom:10px}
      .sf80-month-year strong{text-align:center;font-size:16px}
      .sf80-month-year .btn{min-height:42px;padding:8px}
      .sf80-month-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .sf80-month-option{min-height:44px;border:1px solid var(--line);border-radius:10px;background:#fff;font-weight:750;color:var(--text)}
      .sf80-month-option.selected{border-color:var(--blue);background:#edf3ff;color:var(--blue)}
      .sf80-draft-card{margin-top:12px;border:1px solid var(--line);border-radius:13px;background:#fff;padding:13px}
      .sf80-draft-card.empty{border-style:dashed;color:var(--muted);background:#fbfcfe}
      .sf80-draft-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}
      .sf80-editor-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
      .sf80-planning-list{display:grid;gap:10px;margin-top:12px}
      .sf80-planning-item{border:1px solid var(--line);border-radius:13px;background:#fff;padding:14px}
      .sf80-planning-item-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
      .sf80-planning-item h3{margin:0;font-size:16px;line-height:1.25}
      .sf80-planning-period{display:block;margin-top:4px;color:var(--muted);font-size:12px}
      .sf80-planning-body{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px;line-height:1.5}
      .sf80-planning-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
      .sf80-empty{padding:16px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);background:#fbfcfe}
      .sf80-lunch-fixed{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
      .sf80-lunch-fixed>div{border:1px solid var(--line);border-radius:12px;background:#f8fafc;padding:12px}
      .sf80-lunch-fixed b{display:block;font-size:13px;margin-bottom:4px}
      .sf80-lunch-fixed span{font-size:13px;line-height:1.35;color:var(--muted)}
      .sf80-week-nav{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:8px;align-items:stretch}
      .sf80-week-nav .btn{padding:8px;min-height:50px}
      .sf80-week-current{border:1px solid var(--line);border-radius:11px;background:#fff;padding:10px 12px;text-align:center;font-weight:800;line-height:1.3}
      .sf80-lunch-main-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
      .sf80-lunch-main{border:1px solid var(--line);border-radius:13px;background:#fff;padding:13px}
      .sf80-lunch-main h3{margin:0 0 8px;font-size:15px}
      .sf80-lunch-main-value{min-height:44px;display:flex;align-items:center;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--text)}
      .sf80-lunch-main-value.empty{color:var(--muted);font-style:italic}
      .sf80-history-search{display:flex;gap:8px;align-items:stretch;margin-top:10px}
      .sf80-history-query{flex:1;border:1px solid var(--line);border-radius:11px;background:#fff;padding:12px;color:var(--muted);min-height:48px;display:flex;align-items:center;overflow-wrap:anywhere}
      .sf80-history-query.active{color:var(--text);font-weight:700}
      #sf80KitchenEditor{z-index:12050}
      #sf80KitchenEditor .modalbox{width:min(680px,100%);padding:20px}
      #sf80KitchenEditorTextarea{width:100%;min-height:190px;font-size:16px!important;line-height:1.5;resize:vertical;pointer-events:auto!important;user-select:text!important;-webkit-user-select:text!important}
      #sf80KitchenEditor .sf80-editor-footer{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
      @media(max-width:720px){
        #sf54CuisineSuggestions .card,#sf54Lunchs .card{padding:15px;margin-top:12px}
        #sf54CuisineSuggestions .sf54-page-head,#sf54Lunchs .sf54-page-head{margin-bottom:12px}
        #sf54CuisineSuggestions h2,#sf54Lunchs h2{font-size:20px;line-height:1.2}
        .sf80-month-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
        .sf80-editor-actions,.sf80-lunch-fixed,.sf80-lunch-main-grid{grid-template-columns:1fr!important}
        .sf80-planning-form .btn,.sf80-planning-history .btn{min-height:48px}
        .sf80-planning-item{padding:13px}
        .sf80-planning-item-head{display:grid;grid-template-columns:1fr auto;gap:8px}
        .sf80-planning-body{font-size:14px}
        #sf80KitchenEditor{padding:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom))}
        #sf80KitchenEditor .modalbox{margin:auto 0 0!important;max-height:calc(100dvh - env(safe-area-inset-top) - 8px)!important;border-radius:18px 18px 0 0!important}
        #sf80KitchenEditorTextarea{min-height:40vh}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureEditor(){
    let layer=document.getElementById('sf80KitchenEditor');
    if(layer)return layer;
    layer=document.createElement('div');
    layer.id='sf80KitchenEditor';
    layer.className='modal hidden';
    layer.innerHTML=`<div class="modalbox"><div class="flex between wrap"><div><h2 id="sf80KitchenEditorTitle">Saisie</h2><p class="muted" id="sf80KitchenEditorHint"></p></div></div><textarea class="input" id="sf80KitchenEditorTextarea" autocomplete="off"></textarea><div class="sf80-editor-footer"><button class="btn ghost" type="button" id="sf80KitchenEditorCancel">Annuler</button><button class="btn primary" type="button" id="sf80KitchenEditorSave">Valider</button></div></div>`;
    document.body.appendChild(layer);
    bindButton(layer.querySelector('#sf80KitchenEditorCancel'),closeEditor);
    bindButton(layer.querySelector('#sf80KitchenEditorSave'),()=>{
      const textarea=document.getElementById('sf80KitchenEditorTextarea');
      const value=String(textarea?.value||'').trim();
      const commit=editorCommit;
      closeEditor();
      if(typeof commit==='function')commit(value);
    });
    return layer;
  }
  function openEditor({title,hint='',value='',commit}){
    const layer=ensureEditor();
    editorCommit=commit;
    const titleNode=layer.querySelector('#sf80KitchenEditorTitle');
    const hintNode=layer.querySelector('#sf80KitchenEditorHint');
    const textarea=layer.querySelector('#sf80KitchenEditorTextarea');
    if(titleNode)titleNode.textContent=title;
    if(hintNode)hintNode.textContent=hint;
    if(textarea){
      textarea.value=value||'';
      textarea.setAttribute('aria-label',title);
    }
    layer.classList.remove('hidden');
    if(textarea){
      try{
        textarea.focus({preventScroll:true});
        const end=textarea.value.length;
        textarea.setSelectionRange(end,end);
      }catch{}
    }
  }
  function closeEditor(){
    const layer=document.getElementById('sf80KitchenEditor');
    layer?.classList.add('hidden');
    editorCommit=null;
  }

  function renderMonthPanel(){
    const panel=document.getElementById('sf80MonthPanel');
    if(!panel)return;
    const selectedYear=Number(String(ui.month).slice(0,4));
    const selectedMonth=Number(String(ui.month).slice(5,7));
    panel.innerHTML=`<div class="sf80-month-year"><button class="btn ghost" type="button" id="sf80MonthYearPrev" aria-label="Année précédente">‹</button><strong>${ui.monthYear}</strong><button class="btn ghost" type="button" id="sf80MonthYearNext" aria-label="Année suivante">›</button></div><div class="sf80-month-grid">${MONTHS.map((name,index)=>{const month=index+1;const selected=ui.monthYear===selectedYear&&month===selectedMonth;return `<button class="sf80-month-option${selected?' selected':''}" type="button" data-sf80-month="${month}">${name.replace(/^./,c=>c.toUpperCase())}</button>`}).join('')}</div>`;
    bindButton(panel.querySelector('#sf80MonthYearPrev'),()=>{ui.monthYear-=1;renderMonthPanel()});
    bindButton(panel.querySelector('#sf80MonthYearNext'),()=>{ui.monthYear+=1;renderMonthPanel()});
    panel.querySelectorAll('[data-sf80-month]').forEach(button=>bindButton(button,()=>{
      ui.month=`${ui.monthYear}-${pad(button.dataset.sf80Month)}`;
      panel.classList.remove('open');
      refreshSuggestionsForm();
    }));
  }
  function toggleMonthPanel(){
    const panel=document.getElementById('sf80MonthPanel');
    if(!panel)return;
    ui.monthYear=Number(String(ui.month||currentMonthKey()).slice(0,4));
    renderMonthPanel();
    panel.classList.toggle('open');
  }
  function refreshSuggestionsForm(){
    const monthButton=document.getElementById('sf80MonthlyMonthButton');
    const draft=document.getElementById('sf80MonthlyDraft');
    const edit=document.getElementById('sf80MonthlyEdit');
    const save=document.getElementById('sf80MonthlySave');
    if(monthButton)monthButton.innerHTML=`<div><strong>${esc(monthLabel(ui.month))}</strong><span>Mois des suggestions</span></div><b>⌄</b>`;
    if(draft){
      const has=Boolean(ui.monthlyDraft.trim());
      draft.classList.toggle('empty',!has);
      draft.innerHTML=has?`<div class="sf80-draft-text">${esc(ui.monthlyDraft)}</div>`:'Aucune suggestion saisie pour le moment.';
    }
    if(edit)edit.textContent=ui.monthlyDraft.trim()?'Modifier les suggestions':'Écrire les suggestions';
    if(save)save.disabled=!ui.monthlyDraft.trim()||!ui.month;
  }
  function buildSuggestions(page){
    if(page.dataset.sf80KitchenPage==='suggestions'&&page.querySelector('#sf80MonthlyList')){
      refreshSuggestionsForm();
      renderMonthlyList();
      return;
    }
    const canManage=manager('monthly_suggestions.manage');
    page.dataset.sf80KitchenPage='suggestions';
    page.innerHTML=`<div class="sf54-page-head"><div><h2>Suggestions du mois</h2><p class="muted">Choisissez le mois, écrivez les suggestions, puis enregistrez-les.</p></div></div>${canManage?`<div class="card sf80-planning-form" id="sf80MonthlyForm"><h2>Ajouter les suggestions</h2><button class="btn ghost sf80-choice-button" id="sf80MonthlyMonthButton" type="button"></button><div class="sf80-month-panel" id="sf80MonthPanel"></div><div class="sf80-draft-card empty" id="sf80MonthlyDraft"></div><div class="sf80-editor-actions"><button class="btn secondary" id="sf80MonthlyEdit" type="button">Écrire les suggestions</button><button class="btn primary" id="sf80MonthlySave" type="button">Enregistrer les suggestions</button></div></div>`:''}<div class="card sf80-planning-history"><h2>Historique des suggestions</h2><div id="sf80MonthlyList" class="sf80-planning-list"></div></div>`;
    if(canManage){
      bindButton(page.querySelector('#sf80MonthlyMonthButton'),toggleMonthPanel);
      bindButton(page.querySelector('#sf80MonthlyEdit'),()=>openEditor({title:`Suggestions — ${monthLabel(ui.month)}`,hint:'Écrivez librement les suggestions du mois.',value:ui.monthlyDraft,commit:value=>{ui.monthlyDraft=value;refreshSuggestionsForm()}}));
      bindButton(page.querySelector('#sf80MonthlySave'),saveMonthly);
      refreshSuggestionsForm();
    }
    renderMonthlyList();
  }
  async function saveMonthly(){
    const body=ui.monthlyDraft.trim();
    if(!ui.month||!body)return alert('Choisissez un mois et écrivez les suggestions.');
    const {start,end}=monthPeriod(ui.month);
    const button=document.getElementById('sf80MonthlySave');
    if(!button)return;
    button.disabled=true;button.textContent='Enregistrement…';
    try{
      await S.saveContent({id:crypto.randomUUID(),department:'cuisine',content_type:'monthly_suggestion',title:`Suggestions — ${monthLabel(ui.month)}`,content:body,period_start:start,period_end:end,active:true,created_by:session?.id||null,created_by_name:session?.name||'',created_at:new Date().toISOString()});
      ui.monthlyDraft='';
      refreshSuggestionsForm();
      renderMonthlyList();
    }catch(error){
      console.warn('StopFlow 0.8.0 — suggestions mensuelles',error);
      alert(error?.message||'Impossible d’enregistrer les suggestions.');
    }finally{
      button.disabled=false;button.textContent='Enregistrer les suggestions';
      refreshSuggestionsForm();
    }
  }
  function renderMonthlyList(){
    const holder=document.getElementById('sf80MonthlyList');if(!holder)return;
    const canManage=manager('monthly_suggestions.manage'),rows=contentRows('monthly_suggestion');
    holder.innerHTML=rows.length?rows.map(item=>`<article class="sf80-planning-item"><div class="sf80-planning-item-head"><div><h3>${esc(item.title||'Suggestions du mois')}</h3><span class="sf80-planning-period">${esc(periodLabel(item.period_start,item.period_end))}</span></div><span class="badge ${item.active===false?'cancelled':'validated'}">${item.active===false?'Archivé':'Actif'}</span></div><div class="sf80-planning-body">${esc(item.content||'')}</div>${canManage&&item.active!==false?`<div class="sf80-planning-tools"><button class="btn small ghost" type="button" data-sf80-month-archive="${esc(item.id)}">Archiver</button></div>`:''}</article>`).join(''):'<div class="sf80-empty">Aucune suggestion mensuelle enregistrée.</div>';
    holder.querySelectorAll('[data-sf80-month-archive]').forEach(button=>bindButton(button,async()=>{await S.archiveContent(button.dataset.sf80MonthArchive);renderMonthlyList()}));
  }

  function refreshLunchForm(){
    const week=document.getElementById('sf80LunchWeekCurrent');
    const value1=document.getElementById('sf80LunchMain1Value');
    const value2=document.getElementById('sf80LunchMain2Value');
    const edit1=document.getElementById('sf80LunchMain1Edit');
    const edit2=document.getElementById('sf80LunchMain2Edit');
    const save=document.getElementById('sf80LunchSave');
    if(week)week.textContent=weekLabel(ui.weekMonday);
    if(value1){value1.textContent=ui.main1||'Aucun plat défini';value1.classList.toggle('empty',!ui.main1)}
    if(value2){value2.textContent=ui.main2||'Aucun plat défini';value2.classList.toggle('empty',!ui.main2)}
    if(edit1)edit1.textContent=ui.main1?'Modifier le Plat 1':'Définir le Plat 1';
    if(edit2)edit2.textContent=ui.main2?'Modifier le Plat 2':'Définir le Plat 2';
    if(save)save.disabled=!ui.main1.trim()||!ui.main2.trim();
  }
  function shiftWeek(days){ui.weekMonday=addDays(ui.weekMonday,days);refreshLunchForm()}
  function buildLunchs(page){
    if(page.dataset.sf80KitchenPage==='lunchs'&&page.querySelector('#sf80LunchList')){
      refreshLunchForm();
      renderLunchList();
      return;
    }
    const canManage=manager('lunchs.manage');
    page.dataset.sf80KitchenPage='lunchs';
    page.innerHTML=`<div class="sf54-page-head"><div><h2>Lunchs hebdomadaires</h2><p class="muted">Une semaine = deux plats lunch préparés spécialement, avec les entrées et desserts fixes.</p></div></div>${canManage?`<div class="card sf80-planning-form" id="sf80LunchForm"><h2>Planifier une semaine</h2><div class="sf80-week-nav"><button class="btn ghost" id="sf80LunchWeekPrev" type="button" aria-label="Semaine précédente">‹</button><div class="sf80-week-current" id="sf80LunchWeekCurrent"></div><button class="btn ghost" id="sf80LunchWeekNext" type="button" aria-label="Semaine suivante">›</button></div><div class="sf80-lunch-fixed"><div><b>Entrées</b><span>2 choix de croquettes à la carte.</span></div><div><b>Desserts</b><span>Crème brûlée ou mousse au chocolat.</span></div></div><div class="sf80-lunch-main-grid"><div class="sf80-lunch-main"><h3>Plat 1</h3><div class="sf80-lunch-main-value empty" id="sf80LunchMain1Value"></div><button class="btn secondary" id="sf80LunchMain1Edit" type="button" style="width:100%;margin-top:8px">Définir le Plat 1</button></div><div class="sf80-lunch-main"><h3>Plat 2</h3><div class="sf80-lunch-main-value empty" id="sf80LunchMain2Value"></div><button class="btn secondary" id="sf80LunchMain2Edit" type="button" style="width:100%;margin-top:8px">Définir le Plat 2</button></div></div><button class="btn primary" id="sf80LunchSave" type="button" style="width:100%;margin-top:12px">Enregistrer la semaine</button></div>`:''}<div class="card sf80-planning-history"><div><h2>Historique des lunchs</h2><p class="muted">Recherchez un ingrédient ou un plat — par exemple « porc » — pour savoir quand il a été proposé la dernière fois.</p></div><div class="sf80-history-search"><div class="sf80-history-query" id="sf80LunchSearchLabel">Aucune recherche</div><button class="btn secondary" id="sf80LunchSearchButton" type="button">Rechercher</button><button class="btn ghost hidden" id="sf80LunchSearchClear" type="button">Effacer</button></div><div id="sf80LunchList" class="sf80-planning-list"></div></div>`;
    if(canManage){
      bindButton(page.querySelector('#sf80LunchWeekPrev'),()=>shiftWeek(-7));
      bindButton(page.querySelector('#sf80LunchWeekNext'),()=>shiftWeek(7));
      bindButton(page.querySelector('#sf80LunchMain1Edit'),()=>openEditor({title:'Plat 1',hint:weekLabel(ui.weekMonday),value:ui.main1,commit:value=>{ui.main1=value;refreshLunchForm()}}));
      bindButton(page.querySelector('#sf80LunchMain2Edit'),()=>openEditor({title:'Plat 2',hint:weekLabel(ui.weekMonday),value:ui.main2,commit:value=>{ui.main2=value;refreshLunchForm()}}));
      bindButton(page.querySelector('#sf80LunchSave'),saveLunch);
      refreshLunchForm();
    }
    bindButton(page.querySelector('#sf80LunchSearchButton'),()=>openEditor({title:'Rechercher dans les lunchs',hint:'Exemple : porc, poulet, saumon…',value:ui.search,commit:value=>{ui.search=value;renderLunchList()}}));
    bindButton(page.querySelector('#sf80LunchSearchClear'),()=>{ui.search='';renderLunchList()});
    renderLunchList();
  }
  async function saveLunch(){
    const main1=ui.main1.trim(),main2=ui.main2.trim();
    if(!main1||!main2)return alert('Définissez le Plat 1 et le Plat 2 de la semaine.');
    const monday=localDate(ui.weekMonday),friday=addDays(monday,4),info=isoWeek(monday);
    const body=`Entrées : 2 choix de croquettes à la carte\nPlat 1 : ${main1}\nPlat 2 : ${main2}\nDesserts : crème brûlée ou mousse au chocolat`;
    const button=document.getElementById('sf80LunchSave');
    if(!button)return;
    button.disabled=true;button.textContent='Enregistrement…';
    try{
      await S.saveContent({id:crypto.randomUUID(),department:'cuisine',content_type:'weekly_lunch',title:`Lunchs — Semaine ${info.week} · ${info.year}`,content:body,period_start:ymd(monday),period_end:ymd(friday),active:true,created_by:session?.id||null,created_by_name:session?.name||'',created_at:new Date().toISOString()});
      ui.main1='';ui.main2='';
      refreshLunchForm();
      renderLunchList();
    }catch(error){
      console.warn('StopFlow 0.8.0 — lunchs',error);
      alert(error?.message||'Impossible d’enregistrer les lunchs.');
    }finally{
      button.disabled=false;button.textContent='Enregistrer la semaine';
      refreshLunchForm();
    }
  }
  function renderLunchList(){
    const holder=document.getElementById('sf80LunchList');if(!holder)return;
    const search=ui.search.trim().toLocaleLowerCase('fr');
    const label=document.getElementById('sf80LunchSearchLabel');
    const clear=document.getElementById('sf80LunchSearchClear');
    if(label){label.textContent=search?`Recherche : ${ui.search}`:'Aucune recherche';label.classList.toggle('active',Boolean(search))}
    clear?.classList.toggle('hidden',!search);
    const canManage=manager('lunchs.manage');
    const rows=contentRows('weekly_lunch').filter(item=>!search||`${item.title||''}\n${item.content||''}`.toLocaleLowerCase('fr').includes(search));
    holder.innerHTML=rows.length?rows.map(item=>`<article class="sf80-planning-item"><div class="sf80-planning-item-head"><div><h3>${esc(item.title||'Lunchs')}</h3><span class="sf80-planning-period">${esc(periodLabel(item.period_start,item.period_end))}</span></div><span class="badge ${item.active===false?'cancelled':'validated'}">${item.active===false?'Archivé':'Actif'}</span></div><div class="sf80-planning-body">${esc(item.content||'')}</div>${canManage&&item.active!==false?`<div class="sf80-planning-tools"><button class="btn small ghost" type="button" data-sf80-lunch-archive="${esc(item.id)}">Archiver</button></div>`:''}</article>`).join(''):`<div class="sf80-empty">${search?`Aucun lunch ne correspond à « ${esc(ui.search)} ».`:'Aucun lunch enregistré.'}</div>`;
    holder.querySelectorAll('[data-sf80-lunch-archive]').forEach(button=>bindButton(button,async()=>{await S.archiveContent(button.dataset.sf80LunchArchive);renderLunchList()}));
  }

  function activeKitchenPage(){return document.querySelector('#app .page:not(.hidden)')?.id||''}
  function enhance(){
    injectStyles();
    ensureEditor();
    const id=activeKitchenPage();
    if(id==='sf54CuisineSuggestions')buildSuggestions(document.getElementById(id));
    if(id==='sf54Lunchs')buildLunchs(document.getElementById(id));
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;enhance()});
  }

  const oldRender=S.render;
  if(typeof oldRender==='function')S.render=function(){
    const id=activeKitchenPage();
    if(id==='sf54CuisineSuggestions'){
      buildSuggestions(document.getElementById(id));
      return;
    }
    if(id==='sf54Lunchs'){
      buildLunchs(document.getElementById(id));
      return;
    }
    const result=oldRender.apply(this,arguments);
    schedule();
    return result;
  };

  const oldAction=S.action;
  if(typeof oldAction==='function')S.action=function(action,department){
    if(action==='suggestions-month'){
      document.getElementById('sf52DrawerClose')?.click();
      if(typeof page==='function')page('sf54CuisineSuggestions');
      setTimeout(schedule,20);
      return;
    }
    if(action==='lunchs'){
      document.getElementById('sf52DrawerClose')?.click();
      if(typeof page==='function')page('sf54Lunchs');
      setTimeout(schedule,20);
      return;
    }
    const result=oldAction.apply(this,arguments);
    schedule();
    return result;
  };

  window.stopflow080KitchenPlanning={active:true,version:'0.8.0',refresh:schedule,renderLunchList,renderMonthlyList};
  injectStyles();
  ensureEditor();
  [100,500,1400].forEach(delay=>setTimeout(schedule,delay));
})();
