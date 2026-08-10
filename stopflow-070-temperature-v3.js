/* StopFlow 0.7.0 — Températures V3 isolée : aucun S.action, S.render ou MutationObserver. */
(function(){
  if(window.stopflow070TemperatureV3?.active)return;

  const TYPE_LABELS={fridge:'Frigo',freezer:'Congélateur',cold_room:'Chambre froide',display:'Vitrine réfrigérée',other:'Autre'};
  const state={equipment:[],rounds:[],readings:[],view:'readings',error:'',loading:false,loadSeq:0,lastCardOpen:0,editUserId:null,permissionSnapshot:null};
  const nav=()=>window.stopflow070CardNavigation;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const has=(key)=>Boolean(nav()?.hasPermission?.(key,'cuisine'));
  const canRead=()=>has('temperatures.readings.use')||has('temperatures.use');
  const canManage=()=>has('temperatures.equipment.manage');
  const dateTime=value=>{const d=new Date(value);return !value||Number.isNaN(d.getTime())?'—':d.toLocaleString('fr-BE',{dateStyle:'short',timeStyle:'short'})};
  const sessionName=()=>String(session?.name||[session?.prenom,session?.nom].filter(Boolean).join(' ')||'').trim()||'Utilisateur StopFlow';

  const api=window.stopflow070TemperatureV3={active:true,state,open:openTemperature,reload:loadDashboard,setView};

  function injectStyles(){
    if(document.getElementById('sf70TemperatureV3Styles'))return;
    const style=document.createElement('style');
    style.id='sf70TemperatureV3Styles';
    style.textContent=`
      #sf70TemperatureV3{max-width:1180px}
      .sf70-tv3-back{border:0;background:transparent;color:var(--blue);font-weight:800;padding:4px 0 10px}
      .sf70-tv3-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px}.sf70-tv3-head h2{margin:0 0 4px}
      .sf70-tv3-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 15px}.sf70-tv3-tab{min-height:42px;border:1px solid #cbd7e6;border-radius:10px;background:#fff;color:#28415c;padding:9px 13px;font-weight:800;touch-action:manipulation}.sf70-tv3-tab.active{background:#2463eb;border-color:#2463eb;color:#fff}
      .sf70-tv3-notice{padding:11px 13px;border:1px solid #f1cf8a;background:#fff8e7;color:#765100;border-radius:11px;margin-bottom:12px}.sf70-tv3-loading{font-size:12px;color:var(--muted);font-weight:700}
      .sf70-tv3-empty{padding:17px;border:1px dashed #cdd8e5;border-radius:11px;background:#fbfcfe;color:var(--muted)}
      .sf70-tv3-list{display:grid;gap:8px;margin-top:10px}.sf70-tv3-equipment{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid #e1e8f0;border-radius:12px;padding:12px;background:#fff}.sf70-tv3-equipment.inactive{opacity:.68;background:#f7f8fa}.sf70-tv3-actions{display:flex;gap:6px;flex-wrap:wrap}
      .sf70-tv3-badge{display:inline-flex;padding:3px 7px;border-radius:999px;font-size:10px;font-weight:850;background:#eaf8f1;color:#167247;margin-left:6px}.sf70-tv3-badge.off{background:#eef1f5;color:#687586}.sf70-tv3-badge.alert{background:#fff0f0;color:#a12d2d}
      .sf70-tv3-reading{display:grid;grid-template-columns:minmax(190px,1.4fr) 130px minmax(150px,1fr);gap:10px;align-items:end;padding:12px;border:1px solid #e1e8f0;border-radius:12px;background:#fff}.sf70-tv3-reading.ok{border-color:#b9dfc8;background:#fbfffc}.sf70-tv3-reading.alert{border-color:#efb0b0;background:#fff7f7}
      .sf70-tv3-name{font-weight:850}.sf70-tv3-meta{display:block;color:var(--muted);font-size:11px;margin-top:3px}.sf70-tv3-round{border:1px solid #e1e8f0;border-radius:11px;background:#fff;overflow:hidden}.sf70-tv3-round-head{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;align-items:center}.sf70-tv3-round-detail{display:none;border-top:1px solid #edf1f5;padding:8px 12px}.sf70-tv3-round.open .sf70-tv3-round-detail{display:block}.sf70-tv3-history-line{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #edf1f5;font-size:11px}.sf70-tv3-history-line:last-child{border-bottom:0}
      .sf70-tv3-overlay{position:fixed;inset:0;z-index:100;background:rgba(3,16,30,.56);display:grid;place-items:center;padding:18px}.sf70-tv3-dialog{width:min(680px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;padding:22px;box-shadow:0 20px 70px rgba(0,0,0,.25)}
      .sf70-tv3-formgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.sf70-tv3-formgrid.three{grid-template-columns:1fr 1fr 1fr}
      .sf70-tv3-permission-group{padding:4px 4px 7px;border-bottom:1px solid #e8edf4}.sf70-tv3-permission-title{padding:7px 0 3px;font-size:13px;font-weight:850}.sf70-tv3-permission-group .sf70-switch-row{border:0!important;margin-left:18px!important;padding:7px 4px!important;min-height:40px!important}
      @media(max-width:720px){.sf70-tv3-reading,.sf70-tv3-equipment,.sf70-tv3-formgrid,.sf70-tv3-formgrid.three{grid-template-columns:1fr}.sf70-tv3-actions{justify-content:flex-start}.sf70-tv3-tab{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function ensurePage(){
    let pageNode=document.getElementById('sf70TemperatureV3');
    if(pageNode)return pageNode;
    const main=document.querySelector('#app main.main');if(!main)return null;
    pageNode=document.createElement('section');pageNode.id='sf70TemperatureV3';pageNode.className='page hidden';main.appendChild(pageNode);
    bindPage(pageNode);return pageNode;
  }

  function showPage(){
    const own=ensurePage();if(!own)return;
    document.querySelectorAll('#app .page').forEach(node=>node.classList.add('hidden'));
    own.classList.remove('hidden');
    const desktop=document.getElementById('pageTitle'),mobile=document.getElementById('sf52MobileTitle');
    if(desktop)desktop.textContent='Températures — Cuisine';if(mobile)mobile.textContent='Températures — Cuisine';
  }

  function errorHtml(){return state.error?`<div class="sf70-tv3-notice"><b>Chargement incomplet.</b> ${esc(state.error)}<br><span style="font-size:11px">La navigation reste disponible ; réessayez avec le bouton Actualiser.</span></div>`:''}

  function render(){
    const pageNode=ensurePage();if(!pageNode)return;
    if(!canRead()&&canManage())state.view='equipment';
    if(canRead()&&!canManage())state.view='readings';
    const tabs=[];
    if(canRead())tabs.push(`<button type="button" class="sf70-tv3-tab ${state.view==='readings'?'active':''}" data-tv3-action="view" data-view="readings">Faire le relevé</button>`);
    if(canManage())tabs.push(`<button type="button" class="sf70-tv3-tab ${state.view==='equipment'?'active':''}" data-tv3-action="view" data-view="equipment">Équipements frigorifiques</button>`);
    pageNode.innerHTML=`<button type="button" class="sf70-tv3-back" data-tv3-action="back">← Retour à Cuisine</button><div class="sf70-tv3-head"><div><h2>Températures — Cuisine</h2><div class="muted">Relevés basés sur la liste des équipements frigorifiques actifs.</div></div>${state.loading?'<span class="sf70-tv3-loading">Actualisation…</span>':'<button type="button" class="btn ghost small" data-tv3-action="reload">Actualiser</button>'}</div><div class="sf70-tv3-tabs">${tabs.join('')}</div>${errorHtml()}<div id="sf70Tv3Body"></div>`;
    if(!canRead()&&!canManage())return document.getElementById('sf70Tv3Body').innerHTML='<div class="sf70-tv3-empty">Aucun droit Températures n’est attribué à ce profil.</div>';
    state.view==='equipment'&&canManage()?renderEquipment():renderReadings();
  }

  function renderEquipment(){
    const body=document.getElementById('sf70Tv3Body');if(!body)return;
    const rows=state.equipment.map(e=>`<div class="sf70-tv3-equipment ${e.active===false?'inactive':''}"><div><span class="sf70-tv3-name">${esc(e.name)}</span><span class="sf70-tv3-badge ${e.active===false?'off':''}">${e.active===false?'Inactif':'Actif'}</span><span class="sf70-tv3-meta">${esc(TYPE_LABELS[e.equipment_type]||'Équipement')}${e.location?' · '+esc(e.location):''} · ${e.min_allowed} à ${e.max_allowed} °C${e.deactivated_at?' · désactivé '+dateTime(e.deactivated_at):''}</span></div><div class="sf70-tv3-actions"><button type="button" class="btn ghost small" data-tv3-action="edit-equipment" data-id="${esc(e.id)}">Modifier</button><button type="button" class="btn ${e.active===false?'secondary':'ghost'} small" data-tv3-action="toggle-equipment" data-id="${esc(e.id)}">${e.active===false?'Réactiver':'Désactiver'}</button></div></div>`).join('');
    body.innerHTML=`<div class="card" style="margin-top:0"><div class="flex between wrap"><div><h2>Parc frigorifique</h2><p class="muted">${state.equipment.filter(e=>e.active!==false).length} actif(s) · ${state.equipment.filter(e=>e.active===false).length} inactif(s)</p></div><button type="button" class="btn primary" data-tv3-action="add-equipment">Ajouter un équipement</button></div><div class="sf70-tv3-list">${rows||'<div class="sf70-tv3-empty">Aucun équipement enregistré.</div>'}</div></div>`;
  }

  function renderReadings(){
    const body=document.getElementById('sf70Tv3Body');if(!body)return;
    const active=state.equipment.filter(e=>e.active!==false);
    const rows=active.map(e=>`<div class="sf70-tv3-reading" data-equipment-id="${esc(e.id)}" data-min="${e.min_allowed}" data-max="${e.max_allowed}"><div><span class="sf70-tv3-name">${esc(e.name)}</span><span class="sf70-tv3-meta">${esc(TYPE_LABELS[e.equipment_type]||'Équipement')}${e.location?' · '+esc(e.location):''} · limites ${e.min_allowed} à ${e.max_allowed} °C</span></div><div class="field"><label>Température °C</label><input class="input sf70-tv3-value" type="number" step="0.1" inputmode="decimal" placeholder="0,0"></div><div class="field"><label>Remarque</label><input class="input sf70-tv3-note" placeholder="Facultatif"></div></div>`).join('');
    const rounds=state.rounds.slice(0,12).map(round=>{const detail=state.readings.filter(r=>r.round_id===round.id).map(r=>`<div class="sf70-tv3-history-line"><span><strong>${esc(r.equipment)}</strong>${r.equipment_location?' · '+esc(r.equipment_location):''}</span><span><strong>${r.temperature} °C</strong> · ${r.anomaly?'Hors limite':'Conforme'}</span></div>`).join('');return `<div class="sf70-tv3-round"><button type="button" class="sf70-tv3-round-head" style="width:100%;border:0;background:#fff;text-align:left" data-tv3-action="toggle-round"><span><strong>${dateTime(round.completed_at)}</strong><span class="sf70-tv3-meta">${esc(round.performed_by_name||'—')} · ${round.equipment_count} équipement${round.equipment_count>1?'s':''}</span></span><span class="sf70-tv3-badge ${round.anomaly_count?'alert':''}">${round.anomaly_count?round.anomaly_count+' anomalie'+(round.anomaly_count>1?'s':''):'Conforme'}</span></button><div class="sf70-tv3-round-detail">${detail||'<span class="muted">Détail non disponible.</span>'}</div></div>`}).join('');
    body.innerHTML=`<div class="card" style="margin-top:0"><div><h2>Relevé complet</h2><p class="muted">${active.length} équipement${active.length>1?'s':''} actif${active.length>1?'s':''}</p></div>${active.length?`<div class="sf70-tv3-list">${rows}</div><button type="button" class="btn primary" style="margin-top:12px" data-tv3-action="save-round">Enregistrer le relevé complet</button>`:`<div class="sf70-tv3-empty">Aucun équipement frigorifique actif n’est configuré.${canManage()?' Utilisez « Équipements frigorifiques » pour créer le premier équipement.':''}</div>`}</div><div class="card"><h2>Dernières sessions</h2><div class="sf70-tv3-list">${rounds||'<div class="sf70-tv3-empty">Aucune session de relevé enregistrée.</div>'}</div></div>`;
  }

  function setView(view){
    if(view==='readings'&&!canRead())return;
    if(view==='equipment'&&!canManage())return;
    state.view=view;render();
  }

  async function loadDashboard(){
    const seq=++state.loadSeq;state.loading=true;state.error='';render();
    try{
      const {data,error}=await supabaseClient.rpc('load_temperature_dashboard_070');
      if(error)throw error;if(seq!==state.loadSeq)return;
      state.equipment=Array.isArray(data?.equipment)?data.equipment:[];state.rounds=Array.isArray(data?.rounds)?data.rounds:[];state.readings=Array.isArray(data?.readings)?data.readings:[];
    }catch(error){if(seq!==state.loadSeq)return;console.warn('StopFlow 0.7.0 — Températures V3 chargement',error);state.error=error?.message||'Impossible de récupérer les données.'}
    finally{if(seq===state.loadSeq){state.loading=false;render()}}
  }

  async function openTemperature(){
    if(!canRead()&&!canManage())return alert('Aucun droit Températures n’est attribué à ce profil.');
    showPage();render();loadDashboard();
  }

  function modalNode(){
    let overlay=document.getElementById('sf70Tv3Overlay');if(overlay)return overlay;
    overlay=document.createElement('div');overlay.id='sf70Tv3Overlay';overlay.className='sf70-tv3-overlay hidden';overlay.innerHTML='<div class="sf70-tv3-dialog" id="sf70Tv3Dialog"></div>';document.body.appendChild(overlay);
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeModal()});return overlay;
  }
  function closeModal(){document.getElementById('sf70Tv3Overlay')?.classList.add('hidden')}

  function openEquipmentModal(equipment=null){
    const overlay=modalNode(),dialog=document.getElementById('sf70Tv3Dialog'),e=equipment||{};
    dialog.innerHTML=`<div class="flex between"><div><h2>${equipment?'Modifier':'Ajouter'} un équipement</h2><p class="muted">Cet équipement alimentera automatiquement les futurs relevés lorsqu’il est actif.</p></div><button type="button" class="btn ghost" data-tv3-modal="close">Fermer</button></div><div class="sf70-tv3-formgrid"><div class="field"><label>Nom *</label><input class="input" id="sf70Tv3Name" value="${esc(e.name||'')}"></div><div class="field"><label>Emplacement</label><input class="input" id="sf70Tv3Location" value="${esc(e.location||'')}"></div></div><div class="sf70-tv3-formgrid three"><div class="field"><label>Type</label><select class="input" id="sf70Tv3Type">${Object.entries(TYPE_LABELS).map(([value,label])=>`<option value="${value}" ${e.equipment_type===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label>Minimum °C</label><input class="input" id="sf70Tv3Min" type="number" step="0.1" value="${e.min_allowed??0}"></div><div class="field"><label>Maximum °C</label><input class="input" id="sf70Tv3Max" type="number" step="0.1" value="${e.max_allowed??4}"></div></div><button type="button" class="btn primary" style="margin-top:14px" data-tv3-modal="save" data-id="${esc(e.id||'')}">Enregistrer</button>`;
    overlay.classList.remove('hidden');
    dialog.querySelector('[data-tv3-modal="close"]').onclick=closeModal;
    dialog.querySelector('[data-tv3-modal="save"]').onclick=()=>saveEquipment(equipment);
    setTimeout(()=>document.getElementById('sf70Tv3Name')?.focus(),30);
  }

  async function saveEquipment(equipment){
    const name=document.getElementById('sf70Tv3Name')?.value.trim()||'',location=document.getElementById('sf70Tv3Location')?.value.trim()||'',equipment_type=document.getElementById('sf70Tv3Type')?.value||'fridge',min_allowed=Number(document.getElementById('sf70Tv3Min')?.value),max_allowed=Number(document.getElementById('sf70Tv3Max')?.value);
    if(!name||!Number.isFinite(min_allowed)||!Number.isFinite(max_allowed)||max_allowed<min_allowed)return alert('Vérifiez le nom et les limites de température.');
    try{
      const query=equipment?supabaseClient.from('temperature_equipment').update({name,location,equipment_type,min_allowed,max_allowed}).eq('id',equipment.id):supabaseClient.from('temperature_equipment').insert({department:'cuisine',name,location,equipment_type,min_allowed,max_allowed,active:true,created_by:session.id,created_by_name:sessionName()});
      const {error}=await query;if(error)throw error;closeModal();await loadDashboard();state.view='equipment';render();
    }catch(error){console.warn('StopFlow 0.7.0 — Températures V3 équipement',error);alert(error?.message||'Impossible d’enregistrer cet équipement.')}
  }

  async function toggleEquipment(id){
    const equipment=state.equipment.find(e=>e.id===id);if(!equipment)return;
    const active=equipment.active===false;if(!active&&!confirm(`Désactiver « ${equipment.name} » ? Il disparaîtra des prochains relevés.`))return;
    try{const {error}=await supabaseClient.from('temperature_equipment').update({active}).eq('id',id);if(error)throw error;await loadDashboard()}catch(error){console.warn('StopFlow 0.7.0 — Températures V3 activation',error);alert(error?.message||'Impossible de modifier cet équipement.')}
  }

  async function saveRound(){
    const rows=[...document.querySelectorAll('#sf70TemperatureV3 .sf70-tv3-reading')];if(!rows.length)return;
    const readings=[];let missing=null;
    rows.forEach(row=>{const input=row.querySelector('.sf70-tv3-value'),temperature=Number(input.value);if(input.value===''||!Number.isFinite(temperature)){missing=missing||row;return}readings.push({equipment_id:row.dataset.equipmentId,temperature,note:row.querySelector('.sf70-tv3-note')?.value.trim()||''})});
    if(missing){missing.scrollIntoView({behavior:'smooth',block:'center'});missing.querySelector('.sf70-tv3-value')?.focus();return alert('Encodez la température de tous les équipements actifs avant d’enregistrer.')}
    try{const {data,error}=await supabaseClient.rpc('save_temperature_round_070',{p_readings:readings});if(error)throw error;await loadDashboard();const count=Number(data?.anomaly_count||0);alert(count?`Relevé enregistré : ${count} anomalie${count>1?'s':''}.`:'Relevé complet enregistré : toutes les températures sont conformes.')}catch(error){console.warn('StopFlow 0.7.0 — Températures V3 relevé',error);alert(error?.message||'Impossible d’enregistrer le relevé.')}
  }

  function markReading(input){
    const row=input.closest('.sf70-tv3-reading');if(!row)return;row.classList.remove('ok','alert');if(input.value==='')return;
    const value=Number(input.value),min=Number(row.dataset.min),max=Number(row.dataset.max);if(!Number.isFinite(value))return;row.classList.add(value<min||value>max?'alert':'ok');
  }

  function performAction(button){
    const action=button.dataset.tv3Action;
    if(action==='back')return nav()?.openZone?.('cuisine');
    if(action==='reload')return loadDashboard();
    if(action==='view')return setView(button.dataset.view);
    if(action==='add-equipment')return openEquipmentModal();
    if(action==='edit-equipment')return openEquipmentModal(state.equipment.find(e=>e.id===button.dataset.id));
    if(action==='toggle-equipment')return toggleEquipment(button.dataset.id);
    if(action==='save-round')return saveRound();
    if(action==='toggle-round')return button.closest('.sf70-tv3-round')?.classList.toggle('open');
  }

  function bindPage(pageNode){
    let last={button:null,at:0};
    pageNode.addEventListener('pointerdown',event=>{if(event.button!=null&&event.button!==0)return;const button=event.target.closest?.('[data-tv3-action]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();last={button,at:Date.now()};performAction(button)},true);
    pageNode.addEventListener('click',event=>{const button=event.target.closest?.('[data-tv3-action]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(last.button!==button||Date.now()-last.at>700)performAction(button)},true);
    pageNode.addEventListener('input',event=>{if(event.target.classList?.contains('sf70-tv3-value'))markReading(event.target)},true);
  }

  function installCardBridge(){
    const app=document.getElementById('app');if(!app||app.dataset.sf70TemperatureV3Bridge==='1')return false;app.dataset.sf70TemperatureV3Bridge='1';
    let lastAt=0;
    const findCard=event=>event.target.closest?.('#sf70ZonePage [data-sf70-card="temperatures.use"]');
    app.addEventListener('pointerdown',event=>{if(event.button!=null&&event.button!==0)return;const card=findCard(event);if(!card||card.closest('.sf70-personalizing'))return;event.preventDefault();event.stopImmediatePropagation();lastAt=Date.now();openTemperature()},true);
    app.addEventListener('click',event=>{const card=findCard(event);if(!card||card.closest('.sf70-personalizing'))return;event.preventDefault();event.stopImmediatePropagation();if(Date.now()-lastAt>700)openTemperature()},true);
    return true;
  }

  function permissionSignaturesFromModal(){return new Set([...document.querySelectorAll('#modalBox .sf70-permissions-holder [data-sf70-permission]:checked')].map(i=>`${i.dataset.sf70Permission}|${i.dataset.sf70Scope}`))}
  function updatePermissionCount(holder){const count=[...holder.querySelectorAll('[data-sf70-permission]:checked')].filter(i=>i.dataset.sf70LegacyAlias!=='1').length;const node=holder.querySelector('.sf70-permission-count');if(node)node.textContent=`${count} droit${count>1?'s':''} actif${count>1?'s':''}`}

  function patchPermissionRows(preferred=null){
    const holder=document.querySelector('#modalBox .sf70-permissions-holder');if(!holder||holder.querySelector('.sf70-admin-access')||holder.querySelector('.sf70-tv3-permission-group'))return;
    const legacy=holder.querySelector('[data-sf70-permission="temperatures.use"][data-sf70-scope="cuisine"]');if(!legacy)return;
    const set=preferred||(()=>{const user=state.editUserId&&Array.isArray(sharedUsers)?sharedUsers.find(u=>u.id===state.editUserId):null;return new Set((user?.permissions||[]).map(p=>`${p.permission_key}|${p.scope}`))})();
    const reading=set.has('temperatures.readings.use|cuisine')||legacy.checked,manage=set.has('temperatures.equipment.manage|cuisine');
    const row=legacy.closest('.sf70-switch-row');if(!row)return;
    const group=document.createElement('div');group.className='sf70-tv3-permission-group';group.innerHTML=`<div class="sf70-tv3-permission-title">Températures</div><label class="sf70-switch-row sf70-child"><span class="sf70-switch"><input type="checkbox" data-sf70-permission="temperatures.readings.use" data-sf70-scope="cuisine" ${reading?'checked':''}><span class="sf70-track"></span><span class="sf70-thumb"></span></span><span class="sf70-switch-label">Faire les relevés de température</span></label><label class="sf70-switch-row sf70-child"><span class="sf70-switch"><input type="checkbox" data-sf70-permission="temperatures.equipment.manage" data-sf70-scope="cuisine" ${manage?'checked':''}><span class="sf70-track"></span><span class="sf70-thumb"></span></span><span class="sf70-switch-label">Gérer les équipements frigorifiques</span></label><input type="checkbox" hidden data-sf70-permission="temperatures.use" data-sf70-scope="cuisine" data-sf70-legacy-alias="1" ${reading||manage?'checked':''}>`;
    row.replaceWith(group);
    const sync=()=>{const r=group.querySelector('[data-sf70-permission="temperatures.readings.use"]'),m=group.querySelector('[data-sf70-permission="temperatures.equipment.manage"]'),alias=group.querySelector('[data-sf70-legacy-alias]');alias.checked=Boolean(r.checked||m.checked);updatePermissionCount(holder)};
    group.querySelectorAll('.sf70-switch-row input').forEach(i=>i.addEventListener('change',sync));sync();
  }

  function installPermissionHooks(){
    if(window.stopflow070TemperatureV3PermissionHooks)return true;
    if(typeof showCreateUserModal!=='function'||typeof showEditUserModal!=='function')return false;
    window.stopflow070TemperatureV3PermissionHooks=true;
    const create=showCreateUserModal,edit=showEditUserModal;
    showCreateUserModal=function(){state.editUserId=null;state.permissionSnapshot=null;const result=create.apply(this,arguments);setTimeout(()=>patchPermissionRows(),0);return result};
    showEditUserModal=function(id){state.editUserId=id;state.permissionSnapshot=null;const result=edit.apply(this,arguments);setTimeout(()=>patchPermissionRows(),0);return result};
    const box=document.getElementById('modalBox');
    if(box&&!box.dataset.sf70TemperatureV3Roles){box.dataset.sf70TemperatureV3Roles='1';box.addEventListener('change',event=>{if(!/UserRole$/.test(event.target?.id||''))return;state.permissionSnapshot=permissionSignaturesFromModal();setTimeout(()=>patchPermissionRows(state.permissionSnapshot),0)},true)}
    return true;
  }

  function init(){
    injectStyles();ensurePage();modalNode();
    let attempts=0;const timer=setInterval(()=>{const card=installCardBridge(),permissions=installPermissionHooks();if((card&&permissions)||++attempts>=60)clearInterval(timer)},100);
    [0,250,700,1600].forEach(delay=>setTimeout(()=>{installCardBridge();installPermissionHooks()},delay));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
