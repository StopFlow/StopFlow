/* StopFlow 0.7.0 — températures : relevé complet + registre d'équipements. */
(function(){
  if(window.stopflow070TemperatureRefactor?.active)return;
  const S=window.SF54;
  if(!S)return;

  const nav=()=>window.stopflow070CardNavigation;
  const TYPE_LABELS={fridge:'Frigo',freezer:'Congélateur',cold_room:'Chambre froide',display:'Vitrine réfrigérée',other:'Autre'};
  const state={equipment:[],rounds:[],readings:[],view:'readings',loading:false,currentEditedUserId:null,modalObserver:null};
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const canReadings=()=>Boolean(nav()?.hasPermission?.('temperatures.readings.use','cuisine'));
  const canManage=()=>Boolean(nav()?.hasPermission?.('temperatures.equipment.manage','cuisine'));
  const dateTime=value=>{const d=new Date(value);return !value||isNaN(d)?'—':d.toLocaleString('fr-BE',{dateStyle:'short',timeStyle:'short'})};
  const sessionName=()=>String(session?.name||[session?.prenom,session?.nom].filter(Boolean).join(' ')||'').trim();

  window.stopflow070TemperatureRefactor={active:true,state,open:openTemperatures,reload:loadTemperatureData};

  function injectStyles(){
    if(document.getElementById('stopflow070TemperatureRefactorStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow070TemperatureRefactorStyles';
    style.textContent=`
      .sf70-temp-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0 15px}
      .sf70-temp-tab{min-height:38px;border:1px solid #cbd7e6;border-radius:10px;background:#fff;color:#28415c;padding:8px 12px;font-weight:800;cursor:pointer}
      .sf70-temp-tab.active{background:#2463eb;border-color:#2463eb;color:#fff}
      .sf70-temp-intro{padding:14px 16px;border:1px solid #dbe5f1;border-radius:13px;background:#f8fbff;margin-bottom:12px}
      .sf70-temp-intro h3{margin:0 0 4px;font-size:16px}.sf70-temp-intro p{margin:0}
      .sf70-temp-reading-grid{display:grid;gap:8px;margin-top:10px}
      .sf70-temp-reading-row{display:grid;grid-template-columns:minmax(180px,1.4fr) 130px minmax(150px,1fr);gap:10px;align-items:end;padding:11px 12px;border:1px solid #e1e8f0;border-radius:11px;background:#fff}
      .sf70-temp-equipment-name{font-weight:850;color:var(--text)}.sf70-temp-equipment-meta{display:block;margin-top:3px;font-size:10.5px;color:var(--muted)}
      .sf70-temp-reading-row.sf70-temp-alert{border-color:#efb0b0;background:#fff7f7}
      .sf70-temp-reading-row.sf70-temp-ok{border-color:#b9dfc8;background:#fbfffc}
      .sf70-temp-submit{margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .sf70-temp-submit-status{font-size:11px;color:var(--muted);font-weight:700}
      .sf70-temp-round-list,.sf70-temp-equipment-list{display:grid;gap:7px;margin-top:8px}
      .sf70-temp-round{border:1px solid #e1e8f0;border-radius:11px;background:#fff;overflow:hidden}
      .sf70-temp-round-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;cursor:pointer}
      .sf70-temp-round-head strong{font-size:12.5px}.sf70-temp-round-meta{font-size:10px;color:var(--muted);margin-top:3px}
      .sf70-temp-round-detail{display:none;border-top:1px solid #edf1f5;padding:5px 12px 10px}.sf70-temp-round.open .sf70-temp-round-detail{display:block}
      .sf70-temp-reading-history{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #edf1f5;font-size:11px}.sf70-temp-reading-history:last-child{border-bottom:0}
      .sf70-temp-reading-history.alert strong{color:#a12d2d}
      .sf70-temp-equipment-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 12px;border:1px solid #e1e8f0;border-radius:11px;background:#fff}
      .sf70-temp-equipment-row.inactive{opacity:.7;background:#f7f8fa}.sf70-temp-equipment-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .sf70-temp-equipment-actions button{min-height:34px}
      .sf70-temp-badge{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;font-size:9.5px;font-weight:850;background:#eaf8f1;color:#167247}.sf70-temp-badge.off{background:#eef1f5;color:#687586}.sf70-temp-badge.alert{background:#fff0f0;color:#a12d2d}
      .sf70-temp-empty{padding:17px;border:1px dashed #cdd8e5;border-radius:11px;background:#fbfcfe;color:var(--muted)}
      .sf70-temperature-permission-group{padding:4px 4px 7px;border-bottom:1px solid #e8edf4}.sf70-temperature-permission-group:last-child{border-bottom:0}
      .sf70-temperature-permission-title{padding:8px 0 4px;font-size:13px;font-weight:850;color:var(--text)}
      .sf70-temperature-permission-group .sf70-switch-row{border:0!important;margin-left:18px!important;padding:7px 4px!important;min-height:40px!important}
      @media(max-width:720px){.sf70-temp-reading-row{grid-template-columns:1fr}.sf70-temp-equipment-row{grid-template-columns:1fr}.sf70-temp-equipment-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function ensureTemperaturePage(){
    S.ensurePages?.();
    let page=document.getElementById('sf54Temperatures');
    if(!page){
      const main=document.querySelector('#app main.main');if(!main)return null;
      page=document.createElement('section');page.id='sf54Temperatures';page.className='page hidden';main.appendChild(page);
      try{STOPFLOW_STABLE_PAGES.add('sf54Temperatures')}catch{}
    }
    return page;
  }

  function setTitle(){
    const d=document.getElementById('pageTitle'),m=document.getElementById('sf52MobileTitle');
    if(d)d.textContent='Températures — Cuisine';if(m)m.textContent='Températures — Cuisine';
  }

  async function loadTemperatureData(){
    if(state.loading)return;
    state.loading=true;
    try{
      const jobs=[];
      jobs.push(supabaseClient.from('temperature_equipment').select('*').order('active',{ascending:false}).order('name'));
      if(canReadings()){
        jobs.push(supabaseClient.from('temperature_rounds').select('*').order('completed_at',{ascending:false}).limit(20));
        jobs.push(supabaseClient.from('temperature_readings').select('*').order('recorded_at',{ascending:false}).limit(160));
      }
      const results=await Promise.all(jobs);
      const first=results.shift();if(first.error)throw first.error;state.equipment=first.data||[];
      if(canReadings()){
        const rounds=results.shift(),readings=results.shift();
        if(rounds.error||readings.error)throw rounds.error||readings.error;
        state.rounds=rounds.data||[];state.readings=readings.data||[];
      }else{state.rounds=[];state.readings=[]}
    }finally{state.loading=false}
  }

  function renderShell(){
    const page=ensureTemperaturePage();if(!page)return;
    const tabs=[];
    if(canReadings())tabs.push(`<button type="button" class="sf70-temp-tab ${state.view==='readings'?'active':''}" data-temp-view="readings">Faire le relevé</button>`);
    if(canManage())tabs.push(`<button type="button" class="sf70-temp-tab ${state.view==='equipment'?'active':''}" data-temp-view="equipment">Équipements frigorifiques</button>`);
    if(!canReadings()&&canManage())state.view='equipment';
    if(canReadings()&&!canManage())state.view='readings';
    page.innerHTML=`<div class="sf54-page-head"><div><h2>Températures — Cuisine</h2><p class="muted">Le relevé utilise automatiquement la liste des équipements frigorifiques actifs.</p></div></div><div class="sf70-temp-tabs">${tabs.join('')}</div><div id="sf70TemperatureBody"></div>`;
    page.querySelectorAll('[data-temp-view]').forEach(button=>button.onclick=()=>{state.view=button.dataset.tempView;renderShell()});
    if(!canReadings()&&!canManage()){
      document.getElementById('sf70TemperatureBody').innerHTML='<div class="sf70-temp-empty">Aucun droit Températures n’est attribué à ce profil.</div>';return;
    }
    if(state.view==='equipment'&&canManage())renderEquipment();else renderReadings();
    setTitle();
  }

  function renderReadings(){
    const body=document.getElementById('sf70TemperatureBody');if(!body)return;
    const active=state.equipment.filter(e=>e.active!==false);
    const rows=active.map(e=>`<div class="sf70-temp-reading-row" data-equipment-id="${esc(e.id)}" data-min="${e.min_allowed}" data-max="${e.max_allowed}">
      <div><span class="sf70-temp-equipment-name">${esc(e.name)}</span><span class="sf70-temp-equipment-meta">${esc(TYPE_LABELS[e.equipment_type]||'Équipement')} ${e.location?'· '+esc(e.location):''} · limites ${e.min_allowed} à ${e.max_allowed} °C</span></div>
      <div class="field"><label>Température °C</label><input class="input sf70-temp-value" type="number" step="0.1" inputmode="decimal" placeholder="0,0"></div>
      <div class="field"><label>Remarque</label><input class="input sf70-temp-note" placeholder="Facultatif"></div>
    </div>`).join('');
    body.innerHTML=`<div class="sf70-temp-intro"><h3>Faire le relevé</h3><p class="muted">Encodez chaque équipement actif. L’ensemble est enregistré en une seule session.</p></div>
      <div class="card"><div class="flex between wrap"><div><h2>Relevé complet</h2><p class="muted">${active.length} équipement${active.length>1?'s':''} actif${active.length>1?'s':''}</p></div></div>
      ${active.length?`<div class="sf70-temp-reading-grid">${rows}</div><div class="sf70-temp-submit"><button type="button" class="btn primary" id="sf70SaveTemperatureRound">Enregistrer le relevé complet</button><span class="sf70-temp-submit-status" id="sf70TempSaveStatus"></span></div>`:`<div class="sf70-temp-empty">Aucun équipement frigorifique actif n’est configuré.${canManage()?' Ouvrez « Équipements frigorifiques » pour créer le premier équipement.':''}</div>`}</div>
      <div class="card"><h2>Dernières sessions de relevé</h2><div id="sf70TempRoundList" class="sf70-temp-round-list"></div></div>`;
    body.querySelectorAll('.sf70-temp-value').forEach(input=>input.addEventListener('input',()=>markReadingRow(input)));
    document.getElementById('sf70SaveTemperatureRound')?.addEventListener('click',saveRound);
    renderRounds();
  }

  function markReadingRow(input){
    const row=input.closest('.sf70-temp-reading-row');if(!row)return;
    row.classList.remove('sf70-temp-alert','sf70-temp-ok');
    if(input.value==='')return;
    const value=Number(input.value),min=Number(row.dataset.min),max=Number(row.dataset.max);
    if(!Number.isFinite(value))return;
    row.classList.add(value<min||value>max?'sf70-temp-alert':'sf70-temp-ok');
  }

  async function saveRound(){
    const rows=[...document.querySelectorAll('#sf70TemperatureBody .sf70-temp-reading-row')];
    if(!rows.length)return;
    const payload=[];let missing=null;
    rows.forEach(row=>{
      const input=row.querySelector('.sf70-temp-value'),value=Number(input.value);
      if(input.value===''||!Number.isFinite(value)){missing=missing||row;return}
      payload.push({equipment_id:row.dataset.equipmentId,temperature:value,note:row.querySelector('.sf70-temp-note')?.value.trim()||''});
    });
    if(missing){missing.scrollIntoView({behavior:'smooth',block:'center'});missing.querySelector('.sf70-temp-value')?.focus();return alert('Encodez la température de tous les équipements actifs avant d’enregistrer.');}
    const button=document.getElementById('sf70SaveTemperatureRound'),status=document.getElementById('sf70TempSaveStatus');
    button.disabled=true;if(status)status.textContent='Enregistrement…';
    try{
      const {data,error}=await supabaseClient.rpc('save_temperature_round_070',{p_readings:payload});
      if(error)throw error;
      await loadTemperatureData();renderShell();
      const count=Number(data?.anomaly_count||0);
      alert(count?`Relevé enregistré. ${count} anomalie${count>1?'s':''} détectée${count>1?'s':''}.`:'Relevé complet enregistré : toutes les températures sont conformes.');
    }catch(error){console.warn('StopFlow 0.7.0 — relevé températures',error);button.disabled=false;if(status)status.textContent='Erreur';alert(error?.message||'Impossible d’enregistrer le relevé.');}
  }

  function renderRounds(){
    const list=document.getElementById('sf70TempRoundList');if(!list)return;
    if(!state.rounds.length){list.innerHTML='<div class="sf70-temp-empty">Aucune session de relevé enregistrée.</div>';return}
    list.innerHTML=state.rounds.slice(0,12).map(round=>{
      const readings=state.readings.filter(r=>r.round_id===round.id);
      const detail=readings.map(r=>`<div class="sf70-temp-reading-history ${r.anomaly?'alert':''}"><span><strong>${esc(r.equipment)}</strong>${r.equipment_location?' · '+esc(r.equipment_location):''}</span><span><strong>${r.temperature} °C</strong> · ${r.anomaly?'Hors limite':'Conforme'}</span></div>`).join('');
      return `<div class="sf70-temp-round"><div class="sf70-temp-round-head"><div><strong>${dateTime(round.completed_at)}</strong><div class="sf70-temp-round-meta">${esc(round.performed_by_name||'—')} · ${round.equipment_count} équipement${round.equipment_count>1?'s':''}</div></div><span class="sf70-temp-badge ${round.anomaly_count?'alert':''}">${round.anomaly_count?round.anomaly_count+' anomalie'+(round.anomaly_count>1?'s':''):'Conforme'}</span></div><div class="sf70-temp-round-detail">${detail||'<span class="muted">Détail non disponible.</span>'}</div></div>`;
    }).join('');
    list.querySelectorAll('.sf70-temp-round-head').forEach(head=>head.onclick=()=>head.parentElement.classList.toggle('open'));
  }

  function renderEquipment(){
    const body=document.getElementById('sf70TemperatureBody');if(!body)return;
    const rows=state.equipment.map(e=>`<div class="sf70-temp-equipment-row ${e.active===false?'inactive':''}">
      <div><div class="flex wrap" style="align-items:center"><span class="sf70-temp-equipment-name">${esc(e.name)}</span><span class="sf70-temp-badge ${e.active===false?'off':''}">${e.active===false?'Inactif':'Actif'}</span></div><span class="sf70-temp-equipment-meta">${esc(TYPE_LABELS[e.equipment_type]||'Équipement')} ${e.location?'· '+esc(e.location):''} · limites ${e.min_allowed} à ${e.max_allowed} °C${e.deactivated_at?' · désactivé le '+dateTime(e.deactivated_at):''}</span></div>
      <div class="sf70-temp-equipment-actions"><button type="button" class="btn small ghost" data-temp-edit="${esc(e.id)}">Modifier</button><button type="button" class="btn small ${e.active===false?'secondary':'ghost'}" data-temp-toggle="${esc(e.id)}">${e.active===false?'Réactiver':'Désactiver'}</button></div>
    </div>`).join('');
    body.innerHTML=`<div class="sf70-temp-intro"><h3>Équipements frigorifiques</h3><p class="muted">Créez, modifiez, désactivez ou réactivez le matériel. Un équipement désactivé disparaît des prochains relevés mais reste dans l’historique.</p></div>
      <div class="card"><div class="flex between wrap"><div><h2>Parc frigorifique</h2><p class="muted">${state.equipment.filter(e=>e.active!==false).length} actif(s) · ${state.equipment.filter(e=>e.active===false).length} inactif(s)</p></div><button type="button" class="btn primary" id="sf70AddTempEquipment">Ajouter un équipement</button></div><div class="sf70-temp-equipment-list">${rows||'<div class="sf70-temp-empty">Aucun équipement enregistré.</div>'}</div></div>`;
    document.getElementById('sf70AddTempEquipment').onclick=()=>equipmentModal();
    body.querySelectorAll('[data-temp-edit]').forEach(button=>button.onclick=()=>equipmentModal(state.equipment.find(e=>e.id===button.dataset.tempEdit)));
    body.querySelectorAll('[data-temp-toggle]').forEach(button=>button.onclick=()=>toggleEquipment(button.dataset.tempToggle));
  }

  function equipmentModal(equipment=null){
    const modal=document.getElementById('modal'),box=document.getElementById('modalBox');if(!modal||!box)return;
    const e=equipment||{};
    box.innerHTML=`<div class="flex between"><div><h2>${equipment?'Modifier':'Ajouter'} un équipement</h2><p class="muted">Les limites enregistrées ici seront utilisées automatiquement dans les relevés.</p></div><button type="button" class="btn ghost" id="sf70CloseTempEquipment">Fermer</button></div>
      <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:14px"><div class="field"><label>Nom *</label><input id="sf70TempEquipmentName" class="input" value="${esc(e.name||'')}"></div><div class="field"><label>Emplacement</label><input id="sf70TempEquipmentLocation" class="input" value="${esc(e.location||'')}"></div></div>
      <div class="filters" style="grid-template-columns:1fr 1fr 1fr;margin-top:10px"><div class="field"><label>Type</label><select id="sf70TempEquipmentType" class="input">${Object.entries(TYPE_LABELS).map(([v,l])=>`<option value="${v}" ${e.equipment_type===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>Minimum °C</label><input id="sf70TempEquipmentMin" class="input" type="number" step="0.1" value="${e.min_allowed??0}"></div><div class="field"><label>Maximum °C</label><input id="sf70TempEquipmentMax" class="input" type="number" step="0.1" value="${e.max_allowed??4}"></div></div>
      <button type="button" class="btn primary" id="sf70SaveTempEquipment" style="margin-top:14px">Enregistrer</button>`;
    modal.classList.remove('hidden');
    document.getElementById('sf70CloseTempEquipment').onclick=()=>modal.classList.add('hidden');
    document.getElementById('sf70SaveTempEquipment').onclick=async()=>{
      const name=document.getElementById('sf70TempEquipmentName').value.trim(),location=document.getElementById('sf70TempEquipmentLocation').value.trim(),type=document.getElementById('sf70TempEquipmentType').value,min=Number(document.getElementById('sf70TempEquipmentMin').value),max=Number(document.getElementById('sf70TempEquipmentMax').value);
      if(!name||!Number.isFinite(min)||!Number.isFinite(max)||max<min)return alert('Vérifiez le nom et les limites de température.');
      const button=document.getElementById('sf70SaveTempEquipment');button.disabled=true;button.textContent='Enregistrement…';
      try{
        let query;
        if(equipment)query=supabaseClient.from('temperature_equipment').update({name,location,equipment_type:type,min_allowed:min,max_allowed:max}).eq('id',equipment.id);
        else query=supabaseClient.from('temperature_equipment').insert({department:'cuisine',name,location,equipment_type:type,min_allowed:min,max_allowed:max,active:true,created_by:session.id,created_by_name:sessionName()});
        const {error}=await query;if(error)throw error;
        modal.classList.add('hidden');await loadTemperatureData();renderShell();
      }catch(error){console.warn('StopFlow 0.7.0 — équipement température',error);button.disabled=false;button.textContent='Enregistrer';alert(error?.message||'Impossible d’enregistrer cet équipement.');}
    };
  }

  async function toggleEquipment(id){
    const equipment=state.equipment.find(e=>e.id===id);if(!equipment)return;
    const active=equipment.active===false;
    if(!active&&!confirm(`Désactiver « ${equipment.name} » ? Il ne sera plus demandé dans les prochains relevés.`))return;
    try{
      const {error}=await supabaseClient.from('temperature_equipment').update({active}).eq('id',id);if(error)throw error;
      await loadTemperatureData();renderShell();
    }catch(error){console.warn('StopFlow 0.7.0 — activation équipement',error);alert(error?.message||'Impossible de modifier cet équipement.');}
  }

  async function openTemperatures(){
    if(!canReadings()&&!canManage())return alert('Aucun droit Températures n’est attribué à ce profil.');
    if(!canReadings()&&canManage())state.view='equipment';
    ensureTemperaturePage();
    if(typeof page==='function')page('sf54Temperatures');
    setTitle();
    try{await loadTemperatureData();renderShell()}catch(error){console.warn('StopFlow 0.7.0 — chargement températures',error);const body=document.getElementById('sf70TemperatureBody');if(body)body.innerHTML='<div class="sf70-temp-empty">Impossible de charger les températures.</div>'}
  }

  function patchCore(){
    if(window.stopflow070TemperatureCorePatched)return;window.stopflow070TemperatureCorePatched=true;
    const previousAction=S.action;
    S.action=function(action,department){if(action==='temperatures')return openTemperatures();return previousAction.apply(this,arguments)};
    if(typeof S.render==='function'){
      const previousRender=S.render;
      S.render=function(){const current=document.querySelector('#app .page:not(.hidden)')?.id;if(current==='sf54Temperatures'){renderShell();return}return previousRender.apply(this,arguments)};
    }
  }

  function switchMarkup(key,label,checked){
    return `<label class="sf70-switch-row sf70-child"><span class="sf70-switch"><input type="checkbox" data-sf70-permission="${key}" data-sf70-scope="cuisine" ${checked?'checked':''}><span class="sf70-track"></span><span class="sf70-thumb"></span></span><span class="sf70-switch-label">${label}</span></label>`;
  }

  function updatePermissionCount(holder){
    const count=holder.querySelectorAll('[data-sf70-permission]:checked:not([data-sf70-temperature-alias])').length;
    const node=holder.querySelector('.sf70-permission-count');if(node)node.textContent=`${count} droit${count>1?'s':''} actif${count>1?'s':''}`;
  }

  function patchTemperaturePermissionRows(){
    const holder=document.querySelector('#modalBox .sf70-permissions-holder');if(!holder||holder.querySelector('.sf70-admin-access'))return;
    const legacy=holder.querySelector('[data-sf70-permission="temperatures.use"][data-sf70-scope="cuisine"]');
    if(!legacy||holder.querySelector('.sf70-temperature-permission-group'))return;
    const user=state.currentEditedUserId&&Array.isArray(sharedUsers)?sharedUsers.find(u=>u.id===state.currentEditedUserId):null;
    const signatures=new Set((user?.permissions||[]).map(p=>`${p.permission_key}|${p.scope}`));
    const readingChecked=signatures.has('temperatures.readings.use|cuisine')||legacy.checked;
    const manageChecked=signatures.has('temperatures.equipment.manage|cuisine');
    const oldRow=legacy.closest('.sf70-switch-row');if(!oldRow)return;
    const group=document.createElement('div');group.className='sf70-temperature-permission-group';
    group.innerHTML=`<div class="sf70-temperature-permission-title">Températures</div>${switchMarkup('temperatures.readings.use','Faire les relevés de température',readingChecked)}${switchMarkup('temperatures.equipment.manage','Gérer les équipements frigorifiques',manageChecked)}<input type="checkbox" hidden data-sf70-temperature-alias="1" data-sf70-permission="temperatures.use" data-sf70-scope="cuisine" ${readingChecked||manageChecked?'checked':''}>`;
    oldRow.replaceWith(group);
    const sync=()=>{const r=group.querySelector('[data-sf70-permission="temperatures.readings.use"]'),m=group.querySelector('[data-sf70-permission="temperatures.equipment.manage"]'),a=group.querySelector('[data-sf70-temperature-alias]');a.checked=Boolean(r.checked||m.checked);updatePermissionCount(holder)};
    group.querySelectorAll('.sf70-switch-row input').forEach(input=>input.addEventListener('change',sync));sync();
  }

  function installProfilePermissionPatch(){
    if(window.stopflow070TemperatureProfilePatch)return;window.stopflow070TemperatureProfilePatch=true;
    if(typeof showCreateUserModal==='function'){
      const previousCreate=showCreateUserModal;
      showCreateUserModal=function(){state.currentEditedUserId=null;const result=previousCreate.apply(this,arguments);setTimeout(patchTemperaturePermissionRows,0);return result};
    }
    if(typeof showEditUserModal==='function'){
      const previousEdit=showEditUserModal;
      showEditUserModal=function(id){state.currentEditedUserId=id;const result=previousEdit.apply(this,arguments);setTimeout(patchTemperaturePermissionRows,0);return result};
    }
    const box=document.getElementById('modalBox');
    if(box){
      state.modalObserver=new MutationObserver(()=>queueMicrotask(patchTemperaturePermissionRows));
      state.modalObserver.observe(box,{childList:true,subtree:true});
    }
  }

  function decorateCard(){
    document.querySelectorAll('[data-sf70-card="temperatures.use"]').forEach(card=>{const description=card.querySelector('.sf70-card-description');if(description)description.textContent='Relevés et équipements frigorifiques'});
  }

  function observeZoneCards(){
    const zone=document.getElementById('sf70ZonePage');if(!zone||zone.dataset.sf70TemperatureObserver==='1')return;
    zone.dataset.sf70TemperatureObserver='1';
    new MutationObserver(decorateCard).observe(zone,{childList:true,subtree:true});
  }

  function init(){
    injectStyles();patchCore();installProfilePermissionPatch();observeZoneCards();decorateCard();
    [100,350,900,1800].forEach(delay=>setTimeout(()=>{patchTemperaturePermissionRows();decorateCard();observeZoneCards()},delay));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
