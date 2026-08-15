/* StopFlow 0.8.0 — Suggestions du mois + Lunchs hebdomadaires adaptés au calendrier. */
(function(){
  if(window.stopflow080KitchenPlanning?.active)return;

  const S=window.SF54;
  if(!S)return;

  const esc=value=>S.esc?S.esc(value):String(value??'');
  const nav=()=>window.stopflow070CardNavigation;
  const manager=permission=>Boolean(S.manager?.()||nav()?.hasPermission?.(permission,'cuisine'));
  const MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
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
    const year=d.getFullYear();const start=new Date(year,0,1);const week=Math.ceil((((d-start)/86400000)+1)/7);
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
  function monthOptions(){
    const now=new Date(),options=[];
    for(let year=now.getFullYear()-1;year<=now.getFullYear()+1;year++){
      for(let month=1;month<=12;month++){
        const value=`${year}-${pad(month)}`;
        options.push(`<option value="${value}" ${value===currentMonthKey()?'selected':''}>${esc(monthLabel(value))}</option>`);
      }
    }
    return options.join('');
  }
  function weekOptions(){
    const nowMonday=mondayOf(new Date());
    const options=[];
    for(let offset=-26;offset<=78;offset++){
      const monday=addDays(nowMonday,offset*7),friday=addDays(monday,4),info=isoWeek(monday),value=ymd(monday);
      const selected=offset===0?' selected':'';
      options.push(`<option value="${value}"${selected}>Semaine ${info.week} · ${formatDate(monday)} → ${formatDate(friday,true)}</option>`);
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
      .sf80-planning-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .sf80-planning-form .input,.sf80-planning-history .input{width:100%;min-height:46px}
      .sf80-planning-form textarea.input{min-height:138px;resize:vertical;line-height:1.45}
      .sf80-planning-form input,.sf80-planning-form textarea,.sf80-planning-form select,.sf80-planning-history input{
        position:relative;z-index:1;pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text;user-select:text
      }
      .sf80-planning-form button,.sf80-planning-history button{pointer-events:auto!important;touch-action:manipulation!important}
      .sf80-lunch-days{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-top:12px}
      .sf80-lunch-days .field:last-child:nth-child(odd){grid-column:1/-1}
      .sf80-planning-list{display:grid;gap:10px;margin-top:12px}
      .sf80-planning-item{border:1px solid var(--line);border-radius:13px;background:#fff;padding:14px}
      .sf80-planning-item-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
      .sf80-planning-item h3{margin:0;font-size:16px;line-height:1.25}
      .sf80-planning-period{display:block;margin-top:4px;color:var(--muted);font-size:12px}
      .sf80-planning-body{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px;line-height:1.5}
      .sf80-planning-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
      .sf80-planning-search{margin-top:10px}
      .sf80-empty{padding:16px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);background:#fbfcfe}
      @media(max-width:720px){
        .sf80-planning-grid,.sf80-lunch-days{grid-template-columns:1fr!important}
        .sf80-lunch-days .field:last-child:nth-child(odd){grid-column:auto}
        #sf54CuisineSuggestions .card,#sf54Lunchs .card{padding:15px;margin-top:12px}
        #sf54CuisineSuggestions .sf54-page-head,#sf54Lunchs .sf54-page-head{margin-bottom:12px}
        #sf54CuisineSuggestions h2,#sf54Lunchs h2{font-size:20px;line-height:1.2}
        .sf80-planning-form .input,.sf80-planning-history .input{font-size:16px!important;min-height:48px!important}
        .sf80-planning-form textarea.input{min-height:150px!important}
        .sf80-planning-form .btn,.sf80-planning-history .btn{width:100%;min-height:48px}
        .sf80-planning-item{padding:13px}
        .sf80-planning-item-head{display:grid;grid-template-columns:1fr auto;gap:8px}
        .sf80-planning-body{font-size:14px}
      }
    `;
    document.head.appendChild(style);
  }

  function suggestionsShell(page){
    const canManage=manager('monthly_suggestions.manage');
    page.innerHTML=`
      <div class="sf54-page-head"><div><h2>Suggestions du mois</h2><p class="muted">Une période = un mois. Choisissez le mois puis encodez les suggestions Cuisine.</p></div></div>
      ${canManage?`<div class="card sf80-planning-form" id="sf80MonthlyForm">
        <h2>Ajouter les suggestions</h2>
        <div class="field"><label>Mois</label><select class="input" id="sf80MonthlyMonth">${monthOptions()}</select></div>
        <div class="field" style="margin-top:12px"><label>Suggestions</label><textarea class="input" id="sf80MonthlyBody" placeholder="Écrivez les suggestions du mois…"></textarea></div>
        <button class="btn primary" id="sf80MonthlySave" type="button" style="margin-top:12px">Enregistrer les suggestions</button>
      </div>`:''}
      <div class="card sf80-planning-history"><h2>Historique des suggestions</h2><div id="sf80MonthlyList" class="sf80-planning-list"></div></div>`;
    if(canManage)page.querySelector('#sf80MonthlySave').onclick=saveMonthly;
    renderMonthlyList();
  }

  async function saveMonthly(){
    const month=document.getElementById('sf80MonthlyMonth')?.value;
    const body=document.getElementById('sf80MonthlyBody')?.value.trim();
    if(!month||!body)return alert('Choisissez un mois et encodez les suggestions.');
    const {start,end}=monthPeriod(month);
    const button=document.getElementById('sf80MonthlySave');
    button.disabled=true;button.textContent='Enregistrement…';
    try{
      await S.saveContent({id:crypto.randomUUID(),department:'cuisine',content_type:'monthly_suggestion',title:`Suggestions — ${monthLabel(month)}`,content:body,period_start:start,period_end:end,active:true,created_by:session?.id||null,created_by_name:session?.name||'',created_at:new Date().toISOString()});
      document.getElementById('sf80MonthlyBody').value='';
      renderMonthlyList();
    }catch(error){console.warn('StopFlow 0.8.0 — suggestions mensuelles',error);alert(error?.message||'Impossible d’enregistrer les suggestions.');}
    finally{button.disabled=false;button.textContent='Enregistrer les suggestions'}
  }

  function renderMonthlyList(){
    const holder=document.getElementById('sf80MonthlyList');if(!holder)return;
    const canManage=manager('monthly_suggestions.manage'),rows=contentRows('monthly_suggestion');
    holder.innerHTML=rows.length?rows.map(item=>`<article class="sf80-planning-item"><div class="sf80-planning-item-head"><div><h3>${esc(item.title||'Suggestions du mois')}</h3><span class="sf80-planning-period">${esc(periodLabel(item.period_start,item.period_end))}</span></div><span class="badge ${item.active===false?'cancelled':'validated'}">${item.active===false?'Archivé':'Actif'}</span></div><div class="sf80-planning-body">${esc(item.content||'')}</div>${canManage&&item.active!==false?`<div class="sf80-planning-tools"><button class="btn small ghost" type="button" data-sf80-month-archive="${esc(item.id)}">Archiver</button></div>`:''}</article>`).join(''):'<div class="sf80-empty">Aucune suggestion mensuelle enregistrée.</div>';
    holder.querySelectorAll('[data-sf80-month-archive]').forEach(button=>button.onclick=async()=>{await S.archiveContent(button.dataset.sf80MonthArchive);renderMonthlyList()});
  }

  function lunchShell(page){
    const canManage=manager('lunchs.manage');
    page.innerHTML=`
      <div class="sf54-page-head"><div><h2>Lunchs hebdomadaires</h2><p class="muted">Chaque lunch correspond à une semaine du calendrier, du lundi au vendredi.</p></div></div>
      ${canManage?`<div class="card sf80-planning-form" id="sf80LunchForm">
        <h2>Planifier une semaine</h2>
        <div class="field"><label>Semaine</label><select class="input" id="sf80LunchWeek">${weekOptions()}</select></div>
        <div class="sf80-lunch-days">${DAYS.map((day,index)=>`<div class="field"><label>${day}</label><input class="input" id="sf80LunchDay${index}" placeholder="Lunch du ${day.toLowerCase()}"></div>`).join('')}</div>
        <button class="btn primary" id="sf80LunchSave" type="button" style="margin-top:12px">Enregistrer la semaine</button>
      </div>`:''}
      <div class="card sf80-planning-history"><div><h2>Historique des lunchs</h2><p class="muted">Recherchez un ingrédient ou un plat pour retrouver quand il a été proposé.</p></div><div class="sf80-planning-search"><input class="input" id="sf80LunchSearch" type="search" placeholder="Ex. porc, poulet, saumon…" autocomplete="off" enterkeyhint="search"></div><div id="sf80LunchList" class="sf80-planning-list"></div></div>`;
    if(canManage)page.querySelector('#sf80LunchSave').onclick=saveLunch;
    page.querySelector('#sf80LunchSearch').addEventListener('input',renderLunchList);
    renderLunchList();
  }

  async function saveLunch(){
    const mondayValue=document.getElementById('sf80LunchWeek')?.value;
    if(!mondayValue)return alert('Choisissez une semaine.');
    const monday=localDate(mondayValue),friday=addDays(monday,4),info=isoWeek(monday);
    const values=DAYS.map((day,index)=>String(document.getElementById(`sf80LunchDay${index}`)?.value||'').trim());
    if(!values.some(Boolean))return alert('Encodez au moins un lunch dans la semaine.');
    const body=DAYS.map((day,index)=>`${day} : ${values[index]||'—'}`).join('\n');
    const button=document.getElementById('sf80LunchSave');
    button.disabled=true;button.textContent='Enregistrement…';
    try{
      await S.saveContent({id:crypto.randomUUID(),department:'cuisine',content_type:'weekly_lunch',title:`Lunchs — Semaine ${info.week} · ${info.year}`,content:body,period_start:ymd(monday),period_end:ymd(friday),active:true,created_by:session?.id||null,created_by_name:session?.name||'',created_at:new Date().toISOString()});
      DAYS.forEach((day,index)=>{const input=document.getElementById(`sf80LunchDay${index}`);if(input)input.value=''});
      renderLunchList();
    }catch(error){console.warn('StopFlow 0.8.0 — lunchs',error);alert(error?.message||'Impossible d’enregistrer les lunchs.');}
    finally{button.disabled=false;button.textContent='Enregistrer la semaine'}
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
    if(suggestions&&!suggestions.classList.contains('hidden'))suggestionsShell(suggestions);
    if(lunchs&&!lunchs.classList.contains('hidden'))lunchShell(lunchs);
  }
  function schedule(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;enhance()});
  }

  const oldRender=S.render;
  if(typeof oldRender==='function')S.render=function(){const result=oldRender.apply(this,arguments);schedule();return result};
  const oldAction=S.action;
  if(typeof oldAction==='function')S.action=function(action,department){const result=oldAction.apply(this,arguments);if(action==='suggestions-month'||action==='lunchs')[0,80,250].forEach(delay=>setTimeout(schedule,delay));return result};

  window.stopflow080KitchenPlanning={active:true,version:'0.8.0',refresh:schedule,renderLunchList,renderMonthlyList};
  injectStyles();
  [100,400,1000,2200].forEach(delay=>setTimeout(schedule,delay));
})();
