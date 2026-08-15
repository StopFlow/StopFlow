/* StopFlow 0.8.0 — Suggestions mensuelles + Lunchs hebdomadaires métier Cuisine. */
(function(){
  if(window.stopflow080KitchenPlanning?.active)return;

  const S=window.SF54;
  if(!S)return;

  const esc=value=>S.esc?S.esc(value):String(value??'');
  const nav=()=>window.stopflow070CardNavigation;
  const manager=permission=>Boolean(S.manager?.()||nav()?.hasPermission?.(permission,'cuisine'));
  const MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  let scheduled=false;

  function pad(value){return String(value).padStart(2,'0')}
  function localDate(value){
    if(value instanceof Date)return new Date(value.getFullYear(),value.getMonth(),value.getDate());
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(match)return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
    const d=new Date(value);
    return Number.isNaN(d.getTime())?new Date():new Date(d.getFullYear(),d.getMonth(),d.getDate());
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
  function monthLabel(key){
    const match=/^(\d{4})-(\d{2})$/.exec(String(key||''));
    if(!match)return 'Mois';
    return `${MONTHS[Number(match[2])-1]} ${match[1]}`.replace(/^./,c=>c.toUpperCase());
  }
  function currentMonthKey(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}`}
  function monthPeriod(key){
    const [year,month]=String(key).split('-').map(Number);
    const start=new Date(year,month-1,1),end=new Date(year,month,0);
    return {start:ymd(start),end:ymd(end)};
  }
  function weekOptions(){
    const nowMonday=mondayOf(new Date());
    const options=[];
    for(let offset=-26;offset<=78;offset++){
      const monday=addDays(nowMonday,offset*7),friday=addDays(monday,4),info=isoWeek(monday),value=ymd(monday);
      options.push(`<option value="${value}"${offset===0?' selected':''}>Semaine ${info.week} · du ${formatDate(monday)} au ${formatDate(friday,true)}</option>`);
    }
    return options.join('');
  }
  function contentRows(type){
    return (S.state?.content||[])
      .filter(item=>item.department==='cuisine'&&item.content_type===type)
      .slice()
      .sort((a,b)=>String(b.period_start||b.created_at||'').localeCompare(String(a.period_start||a.created_at||'')));
  }

  function injectStyles(){
    if(document.getElementById('stopflow080KitchenPlanningStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080KitchenPlanningStyles';
    style.textContent=`
      #sf54CuisineSuggestions,#sf54Lunchs{max-width:980px;padding-bottom:84px}
      .sf80-planning-form,.sf80-planning-history{margin-top:0}
      .sf80-planning-form .input,.sf80-planning-history .input{width:100%;min-height:46px}
      .sf80-planning-form textarea.input{min-height:138px;resize:vertical;line-height:1.45}
      .sf80-native-control{position:relative!important;z-index:2!important;pointer-events:auto!important;touch-action:auto!important;-webkit-user-select:text!important;user-select:text!important}
      .sf80-planning-list{display:grid;gap:10px;margin-top:12px}
      .sf80-planning-item{border:1px solid var(--line);border-radius:13px;background:#fff;padding:14px}
      .sf80-planning-item-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
      .sf80-planning-item h3{margin:0;font-size:16px;line-height:1.25}
      .sf80-planning-period{display:block;margin-top:4px;color:var(--muted);font-size:12px}
      .sf80-planning-body{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px;line-height:1.5}
      .sf80-planning-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
      .sf80-planning-search{margin-top:10px}
      .sf80-empty{padding:16px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);background:#fbfcfe}
      .sf80-lunch-fixed{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
      .sf80-lunch-fixed>div{border:1px solid var(--line);border-radius:12px;background:#f8fafc;padding:12px}
      .sf80-lunch-fixed b{display:block;font-size:13px;margin-bottom:4px}
      .sf80-lunch-fixed span{font-size:13px;line-height:1.35;color:var(--muted)}
      .sf80-lunch-main-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
      .sf80-week-preview{margin-top:7px;font-size:12px;color:var(--muted);font-weight:700}
      @media(max-width:720px){
        #sf54CuisineSuggestions .card,#sf54Lunchs .card{padding:15px;margin-top:12px}
        #sf54CuisineSuggestions .sf54-page-head,#sf54Lunchs .sf54-page-head{margin-bottom:12px}
        #sf54CuisineSuggestions h2,#sf54Lunchs h2{font-size:20px;line-height:1.2}
        .sf80-planning-form .input,.sf80-planning-history .input{font-size:16px!important;min-height:50px!important}
        .sf80-planning-form textarea.input{min-height:160px!important}
        .sf80-planning-form .btn,.sf80-planning-history .btn{width:100%;min-height:48px}
        .sf80-planning-item{padding:13px}
        .sf80-planning-item-head{display:grid;grid-template-columns:1fr auto;gap:8px}
        .sf80-planning-body{font-size:14px}
        .sf80-lunch-fixed,.sf80-lunch-main-grid{grid-template-columns:1fr!important}
      }
    `;
    document.head.appendChild(style);
  }

  function buildSuggestions(page){
    if(page.dataset.sf80KitchenPage==='suggestions'&&page.querySelector('#sf80MonthlyList')){
      renderMonthlyList();
      return;
    }
    const canManage=manager('monthly_suggestions.manage');
    page.dataset.sf80KitchenPage='suggestions';
    page.innerHTML=`
      <div class="sf54-page-head"><div><h2>Suggestions du mois</h2><p class="muted">Choisissez simplement le mois concerné puis encodez les suggestions Cuisine.</p></div></div>
      ${canManage?`<div class="card sf80-planning-form" id="sf80MonthlyForm">
        <h2>Ajouter les suggestions</h2>
        <div class="field"><label for="sf80MonthlyMonth">Mois</label><input class="input sf80-native-control" id="sf80MonthlyMonth" type="month" value="${currentMonthKey()}" autocomplete="off"></div>
        <div class="field" style="margin-top:12px"><label for="sf80MonthlyBody">Suggestions</label><textarea class="input sf80-native-control" id="sf80MonthlyBody" placeholder="Écrivez les suggestions du mois…" autocomplete="off" enterkeyhint="done"></textarea></div>
        <button class="btn primary" id="sf80MonthlySave" type="button" style="margin-top:12px">Enregistrer les suggestions</button>
      </div>`:''}
      <div class="card sf80-planning-history"><h2>Historique des suggestions</h2><div id="sf80MonthlyList" class="sf80-planning-list"></div></div>`;
    if(canManage)page.querySelector('#sf80MonthlySave')?.addEventListener('click',saveMonthly);
    renderMonthlyList();
  }

  async function saveMonthly(){
    const month=document.getElementById('sf80MonthlyMonth')?.value;
    const body=document.getElementById('sf80MonthlyBody')?.value.trim();
    if(!month||!body)return alert('Choisissez un mois et encodez les suggestions.');
    const {start,end}=monthPeriod(month);
    const button=document.getElementById('sf80MonthlySave');
    if(!button)return;
    button.disabled=true;button.textContent='Enregistrement…';
    try{
      await S.saveContent({id:crypto.randomUUID(),department:'cuisine',content_type:'monthly_suggestion',title:`Suggestions — ${monthLabel(month)}`,content:body,period_start:start,period_end:end,active:true,created_by:session?.id||null,created_by_name:session?.name||'',created_at:new Date().toISOString()});
      const textarea=document.getElementById('sf80MonthlyBody');
      if(textarea)textarea.value='';
      renderMonthlyList();
    }catch(error){
      console.warn('StopFlow 0.8.0 — suggestions mensuelles',error);
      alert(error?.message||'Impossible d’enregistrer les suggestions.');
    }finally{
      button.disabled=false;button.textContent='Enregistrer les suggestions';
    }
  }

  function renderMonthlyList(){
    const holder=document.getElementById('sf80MonthlyList');if(!holder)return;
    const canManage=manager('monthly_suggestions.manage'),rows=contentRows('monthly_suggestion');
    holder.innerHTML=rows.length?rows.map(item=>`<article class="sf80-planning-item"><div class="sf80-planning-item-head"><div><h3>${esc(item.title||'Suggestions du mois')}</h3><span class="sf80-planning-period">${esc(periodLabel(item.period_start,item.period_end))}</span></div><span class="badge ${item.active===false?'cancelled':'validated'}">${item.active===false?'Archivé':'Actif'}</span></div><div class="sf80-planning-body">${esc(item.content||'')}</div>${canManage&&item.active!==false?`<div class="sf80-planning-tools"><button class="btn small ghost" type="button" data-sf80-month-archive="${esc(item.id)}">Archiver</button></div>`:''}</article>`).join(''):'<div class="sf80-empty">Aucune suggestion mensuelle enregistrée.</div>';
    holder.querySelectorAll('[data-sf80-month-archive]').forEach(button=>button.onclick=async()=>{await S.archiveContent(button.dataset.sf80MonthArchive);renderMonthlyList()});
  }

  function updateWeekPreview(){
    const value=document.getElementById('sf80LunchWeek')?.value;
    const preview=document.getElementById('sf80LunchWeekPreview');
    if(!value||!preview)return;
    const monday=localDate(value),friday=addDays(monday,4),info=isoWeek(monday);
    preview.textContent=`Semaine ${info.week} · du ${formatDate(monday)} au ${formatDate(friday,true)}`;
  }

  function buildLunchs(page){
    if(page.dataset.sf80KitchenPage==='lunchs'&&page.querySelector('#sf80LunchList')){
      renderLunchList();
      updateWeekPreview();
      return;
    }
    const canManage=manager('lunchs.manage');
    page.dataset.sf80KitchenPage='lunchs';
    page.innerHTML=`
      <div class="sf54-page-head"><div><h2>Lunchs hebdomadaires</h2><p class="muted">Une semaine = deux plats lunch préparés spécialement, en complément des choix fixes de la carte.</p></div></div>
      ${canManage?`<div class="card sf80-planning-form" id="sf80LunchForm">
        <h2>Planifier une semaine</h2>
        <div class="field"><label for="sf80LunchWeek">Semaine</label><select class="input sf80-native-control" id="sf80LunchWeek">${weekOptions()}</select><div class="sf80-week-preview" id="sf80LunchWeekPreview"></div></div>
        <div class="sf80-lunch-fixed">
          <div><b>Entrées</b><span>2 choix de croquettes à la carte.</span></div>
          <div><b>Desserts</b><span>Crème brûlée ou mousse au chocolat.</span></div>
        </div>
        <div class="sf80-lunch-main-grid">
          <div class="field"><label for="sf80LunchMain1">Plat 1</label><input class="input sf80-native-control" id="sf80LunchMain1" type="text" placeholder="Premier plat lunch de la semaine" autocomplete="off" enterkeyhint="next"></div>
          <div class="field"><label for="sf80LunchMain2">Plat 2</label><input class="input sf80-native-control" id="sf80LunchMain2" type="text" placeholder="Deuxième plat lunch de la semaine" autocomplete="off" enterkeyhint="done"></div>
        </div>
        <button class="btn primary" id="sf80LunchSave" type="button" style="margin-top:12px">Enregistrer la semaine</button>
      </div>`:''}
      <div class="card sf80-planning-history"><div><h2>Historique des lunchs</h2><p class="muted">Tapez un ingrédient ou un plat — par exemple « porc » — pour retrouver la dernière semaine où il a été proposé.</p></div><div class="sf80-planning-search"><input class="input sf80-native-control" id="sf80LunchSearch" type="search" placeholder="Ex. porc, poulet, saumon…" autocomplete="off" enterkeyhint="search"></div><div id="sf80LunchList" class="sf80-planning-list"></div></div>`;
    if(canManage){
      page.querySelector('#sf80LunchSave')?.addEventListener('click',saveLunch);
      page.querySelector('#sf80LunchWeek')?.addEventListener('change',updateWeekPreview);
    }
    page.querySelector('#sf80LunchSearch')?.addEventListener('input',renderLunchList);
    updateWeekPreview();
    renderLunchList();
  }

  async function saveLunch(){
    const mondayValue=document.getElementById('sf80LunchWeek')?.value;
    const main1=String(document.getElementById('sf80LunchMain1')?.value||'').trim();
    const main2=String(document.getElementById('sf80LunchMain2')?.value||'').trim();
    if(!mondayValue)return alert('Choisissez une semaine.');
    if(!main1||!main2)return alert('Encodez le Plat 1 et le Plat 2 de la semaine.');
    const monday=localDate(mondayValue),friday=addDays(monday,4),info=isoWeek(monday);
    const body=`Entrées : 2 choix de croquettes à la carte\nPlat 1 : ${main1}\nPlat 2 : ${main2}\nDesserts : crème brûlée ou mousse au chocolat`;
    const button=document.getElementById('sf80LunchSave');
    if(!button)return;
    button.disabled=true;button.textContent='Enregistrement…';
    try{
      await S.saveContent({id:crypto.randomUUID(),department:'cuisine',content_type:'weekly_lunch',title:`Lunchs — Semaine ${info.week} · ${info.year}`,content:body,period_start:ymd(monday),period_end:ymd(friday),active:true,created_by:session?.id||null,created_by_name:session?.name||'',created_at:new Date().toISOString()});
      const first=document.getElementById('sf80LunchMain1'),second=document.getElementById('sf80LunchMain2');
      if(first)first.value='';
      if(second)second.value='';
      renderLunchList();
    }catch(error){
      console.warn('StopFlow 0.8.0 — lunchs',error);
      alert(error?.message||'Impossible d’enregistrer les lunchs.');
    }finally{
      button.disabled=false;button.textContent='Enregistrer la semaine';
    }
  }

  function renderLunchList(){
    const holder=document.getElementById('sf80LunchList');if(!holder)return;
    const search=String(document.getElementById('sf80LunchSearch')?.value||'').trim().toLocaleLowerCase('fr');
    const canManage=manager('lunchs.manage');
    const rows=contentRows('weekly_lunch').filter(item=>!search||`${item.title||''}\n${item.content||''}`.toLocaleLowerCase('fr').includes(search));
    holder.innerHTML=rows.length?rows.map(item=>`<article class="sf80-planning-item"><div class="sf80-planning-item-head"><div><h3>${esc(item.title||'Lunchs')}</h3><span class="sf80-planning-period">${esc(periodLabel(item.period_start,item.period_end))}</span></div><span class="badge ${item.active===false?'cancelled':'validated'}">${item.active===false?'Archivé':'Actif'}</span></div><div class="sf80-planning-body">${esc(item.content||'')}</div>${canManage&&item.active!==false?`<div class="sf80-planning-tools"><button class="btn small ghost" type="button" data-sf80-lunch-archive="${esc(item.id)}">Archiver</button></div>`:''}</article>`).join(''):`<div class="sf80-empty">${search?`Aucun lunch ne correspond à « ${esc(search)} ».`:'Aucun lunch enregistré.'}</div>`;
    holder.querySelectorAll('[data-sf80-lunch-archive]').forEach(button=>button.onclick=async()=>{await S.archiveContent(button.dataset.sf80LunchArchive);renderLunchList()});
  }

  function enhance(){
    injectStyles();
    const suggestions=document.getElementById('sf54CuisineSuggestions');
    const lunchs=document.getElementById('sf54Lunchs');
    if(suggestions&&!suggestions.classList.contains('hidden'))buildSuggestions(suggestions);
    if(lunchs&&!lunchs.classList.contains('hidden'))buildLunchs(lunchs);
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;enhance()});
  }

  const oldRender=S.render;
  if(typeof oldRender==='function')S.render=function(){const result=oldRender.apply(this,arguments);schedule();return result};
  const oldAction=S.action;
  if(typeof oldAction==='function')S.action=function(action,department){
    const result=oldAction.apply(this,arguments);
    if(action==='suggestions-month'||action==='lunchs')setTimeout(schedule,40);
    return result;
  };

  window.stopflow080KitchenPlanning={active:true,version:'0.8.0',refresh:schedule,renderLunchList,renderMonthlyList};
  injectStyles();
  [100,500,1400].forEach(delay=>setTimeout(schedule,delay));
})();
