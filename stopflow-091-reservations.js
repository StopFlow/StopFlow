/* Reservations, part 1: real RPC persistence; no local fallback and no booking engine. */
(function(){
  'use strict';
  if(window.stopflowReservations?.active)return;
  const state={establishments:[],establishmentId:'',roomId:'',data:{rooms:[],tables:[],layouts:[],elements:[]},loaded:false,accessError:'',message:'',error:false,busy:false,manage:false,roomEdit:'',tableEdit:'',selectedTable:'',actor:'',sequence:0};
  const esc=value=>escapeHTML(value);
  const actor=()=>session?.authMode==='supabase'&&session.id&&supabaseClient?session.id:'';
  const selected=()=>state.establishments.find(e=>e.id===state.establishmentId);
  const allowed=key=>Boolean(selected()?.[key]);
  const activeRoom=()=>state.data.rooms.find(r=>r.id===state.roomId&&r.active);
  const shapeNames={round:'Ronde',square:'Carrée',rectangle:'Rectangulaire'};
  const root=()=>document.getElementById('sf91Reservations');
  const canOpen=()=>Boolean(actor()&&(state.establishments.length||state.accessError));
  const api=window.stopflowReservations={active:true,canOpen,open,refreshAccess};
  let syntheticAction=null;
  function refreshNavigation(){
    const nav=window.stopflow070CardNavigation;
    if(nav?.runtime.currentZone==='home')nav.refresh();else nav?.refreshMenus();
  }

  function message(value,error=false){
    state.message=value;state.error=error;
    const node=document.getElementById('sf91Status');
    if(node){node.textContent=value;node.classList.toggle('error',error);node.setAttribute('role',error?'alert':'status')}
  }
  function errorText(error){
    if(error?.code==='40001')return 'Une autre personne a modifié ces données. Actualisez avant de réessayer ; votre saisie est conservée.';
    if(error?.code==='23505')return 'Ce nom ou numéro existe déjà dans cet espace.';
    if(['23514','23502','22023','22P02'].includes(error?.code))return 'Vérifiez les champs, les limites numériques et la forme de la table.';
    if(error?.code==='42501')return 'Cette opération ou cet établissement ne vous est pas autorisé.';
    if(error?.code==='PGRST202'||error?.code==='42883')return 'Module Réservations non installé dans cette base. Son installation doit être validée sur un environnement isolé.';
    return error?.message||'Connexion impossible. Aucune sauvegarde confirmée ; votre saisie est conservée.';
  }
  async function rpc(name,args={}){
    if(!actor())throw {code:'42501'};
    const {data,error}=await supabaseClient.rpc(name,args);
    if(error)throw error;
    return data;
  }
  function ensurePage(){
    if(root())return root();
    const node=document.createElement('section');node.id='sf91Reservations';node.className='page hidden';
    document.querySelector('#app main.main')?.appendChild(node);
    try{STOPFLOW_STABLE_PAGES.add(node.id)}catch{}
    node.addEventListener('click',onClick);
    node.addEventListener('submit',onSubmit);
    node.addEventListener('change',onChange);
    return node;
  }
  function reset(){
    syntheticAction=null;
    state.sequence++;state.actor=actor();state.establishments=[];state.establishmentId='';state.roomId='';state.loaded=false;state.accessError='';state.manage=false;state.roomEdit='';state.tableEdit='';state.selectedTable='';state.busy=false;state.message='';state.error=false;
    state.data={rooms:[],tables:[],layouts:[],elements:[]};
    render();refreshNavigation();
  }
  async function refreshAccess(){
    if(state.actor!==actor())reset();
    if(!actor()||state.busy)return;
    const sequence=++state.sequence,who=actor();
    try{
      const data=await rpc('reservations_context');
      if(sequence!==state.sequence||who!==actor())return;
      state.establishments=data.establishments||[];state.accessError='';
      if(!state.establishments.some(e=>e.id===state.establishmentId)){state.establishmentId=state.establishments[0]?.id||'';state.loaded=false;state.data={rooms:[],tables:[],layouts:[],elements:[]}}
    }catch(error){if(sequence!==state.sequence||who!==actor())return;state.establishments=[];state.establishmentId='';state.roomId='';state.accessError=errorText(error);state.loaded=false;state.data={rooms:[],tables:[],layouts:[],elements:[]}}
    refreshNavigation();
    if(root()&&!root().classList.contains('hidden')){render();if(state.establishmentId)await load()}
  }
  async function open(){
    ensurePage();
    if(state.actor!==actor())reset();
    if(!actor()){render();return}
    if(window.stopflow070CardNavigation)window.stopflow070CardNavigation.runtime.currentZone='reservations';
    page('sf91Reservations');
    const title='Réservations — Plan de salle';
    document.getElementById('pageTitle').textContent=title;
    const mobile=document.getElementById('sf52MobileTitle');if(mobile)mobile.textContent=title;
    render();
    await refreshAccess();
  }
  function busy(value){
    state.busy=value;root()?.setAttribute('aria-busy',String(value));
    root()?.querySelectorAll('fieldset,select[data-filter],button[data-action]').forEach(node=>{/** @type {HTMLFieldSetElement|HTMLSelectElement|HTMLButtonElement} */(node).disabled=value});
  }
  async function load(){
    if(!state.establishmentId||state.busy)return;
    const sequence=++state.sequence,who=actor(),est=state.establishmentId;
    busy(true);
    try{
      const data=await rpc('reservations_read',{p_establishment_id:est});
      if(sequence!==state.sequence||who!==actor()||est!==state.establishmentId)return;
      state.data=data;state.loaded=true;state.message='';state.error=false;
      if(!activeRoom())state.roomId=data.rooms.find(r=>r.active)?.id||'';
      render();
    }catch(error){if(sequence===state.sequence&&who===actor())message(errorText(error),true)}
    finally{if(sequence===state.sequence){busy(false)}}
  }
  const button=(action,text,id='')=>`<button type="button" class="btn ghost" data-action="${action}" data-id="${esc(id)}">${esc(text)}</button>`;
  function tableButton(table,style=''){
    const shape=Object.hasOwn(shapeNames,table.shape)?table.shape:'rectangle';
    return `<button type="button" class="sf91-table ${shape}" data-action="properties" data-id="${esc(table.id)}" ${style?`style="${style}"`:''} aria-label="${esc('Table '+table.label+', '+table.capacity+' couverts')}"><b>${esc(table.label)}</b><span>${esc(table.capacity)} couverts</span></button>`;
  }
  function plan(room){
    const tables=state.data.tables.filter(t=>t.room_id===room.id&&t.active);
    const layout=state.data.layouts.find(l=>l.room_id===room.id&&l.status==='active');
    const elements=state.data.elements.filter(e=>e.layout_id===layout?.id&&e.kind==='table');
    const positioned=[],unplaced=[];
    tables.forEach(t=>{const e=elements.find(e=>e.table_id===t.id);(e&&e.x!==null&&e.y!==null?positioned:unplaced).push({table:t,element:e})});
    const dimension=(value,fallback)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
    const width=dimension(layout?.width,1000),height=dimension(layout?.height,700);
    const saved=positioned.length?`<div class="sf91-canvas" style="aspect-ratio:${width}/${height}" aria-label="Positions enregistrées">${positioned.map(({table,element:e})=>tableButton(table,`left:${Math.max(0,Number(e.x)||0)/width*100}%;top:${Math.max(0,Number(e.y)||0)/height*100}%;width:${dimension(e.width,80)/width*100}%;height:${dimension(e.height,80)/height*100}%;transform:rotate(${Number(e.rotation)||0}deg)`)).join('')}</div>`:'';
    const grid=unplaced.length?`<p class="sf91-provisional">Disposition automatique provisoire — aucune position enregistrée pour ces tables. Ceci n’est pas le plan réel de l’établissement.</p><div class="sf91-grid">${unplaced.map(({table})=>tableButton(table)).join('')}</div>`:'';
    const selectedTable=tables.find(t=>t.id===state.selectedTable);
    return `<div class="card"><h2>${esc(room.name)}</h2><p>${esc(room.description)}</p><p><b>${tables.reduce((sum,t)=>sum+Number(t.capacity),0)} couverts théoriques</b> · ${tables.length} table(s) active(s)</p><p class="muted">Aucune disponibilité ni occupation n’est calculée.</p>${saved}${grid}${!tables.length?'<p>Aucune table enregistrée dans cette salle.</p>':''}${selectedTable?`<aside class="sf91-properties" aria-label="Propriétés de la table"><h3>Table ${esc(selectedTable.label)}</h3><p>${esc(selectedTable.capacity)} couverts · ${esc(shapeNames[selectedTable.shape])}</p>${button('close-properties','Fermer les propriétés')}</aside>`:''}</div>`;
  }
  function management(){
    if(!state.manage)return '';
    let html='';
    if(allowed('can_manage_rooms')){
      const r=state.data.rooms.find(r=>r.id===state.roomEdit);
      html+=`<div class="card"><h2>Gestion des salles</h2><ul class="sf91-list">${state.data.rooms.map(r=>`<li><span>${esc(r.name)} · ordre ${esc(r.sort_order)}${r.active?'':' · archivée'}</span>${button('edit-room','Modifier',r.id)}${button('archive-room',r.active?'Archiver':'Réactiver',r.id)}</li>`).join('')}</ul>${button('new-room','Créer une salle')}<form id="sf91RoomForm" data-id="${esc(r?.id||'')}" data-version="${esc(r?.version||'')}"><fieldset><legend>${r?'Modifier la salle':'Nouvelle salle'}</legend><label>Nom<input class="input" name="name" required maxlength="120" value="${esc(r?.name||'')}"></label><label>Description<textarea class="input" name="description" maxlength="2000">${esc(r?.description||'')}</textarea></label><label>Ordre d’affichage<input class="input" name="sort_order" type="number" required min="0" max="10000" step="1" value="${esc(r?.sort_order??0)}"></label><button class="btn primary" type="submit">Enregistrer la salle</button></fieldset></form></div>`;
    }
    const room=activeRoom();
    if(allowed('can_manage_tables')&&room){
      const t=state.data.tables.find(t=>t.id===state.tableEdit&&t.room_id===room.id);
      html+=`<div class="card"><h2>Tables — ${esc(room.name)}</h2><ul class="sf91-list">${state.data.tables.filter(t=>t.room_id===room.id).map(t=>`<li><span>${esc(t.label)} · ${esc(t.capacity)} couverts · ${esc(shapeNames[t.shape])}${t.active?'':' · archivée'}</span>${button('edit-table','Modifier',t.id)}${button('archive-table',t.active?'Archiver':'Réactiver',t.id)}</li>`).join('')}</ul>${button('new-table','Ajouter une table')}<form id="sf91TableForm" data-id="${esc(t?.id||'')}" data-version="${esc(t?.version||'')}"><fieldset><legend>${t?'Modifier la table':'Nouvelle table'}</legend><label>Numéro ou libellé<input class="input" name="label" required maxlength="40" value="${esc(t?.label||'')}"></label><label>Capacité en couverts<input class="input" name="capacity" type="number" required min="1" max="1000" step="1" value="${esc(t?.capacity??2)}"></label><label>Forme<select class="input" name="shape">${Object.entries(shapeNames).map(([key,value])=>`<option value="${key}" ${t?.shape===key?'selected':''}>${value}</option>`).join('')}</select></label><button class="btn primary" type="submit">Enregistrer la table</button></fieldset></form></div>`;
    }
    return html;
  }
  function render(){
    const node=ensurePage();
    if(!actor()){node.innerHTML='<h1>Réservations — Plan de salle</h1><p>Une connexion Supabase authentifiée est requise. Aucune donnée de démonstration ni sauvegarde locale ne remplace la base.</p>';return}
    const rooms=state.data.rooms.filter(r=>r.active);
    node.innerHTML=`<div class="sf91-heading"><h1>Réservations — Plan de salle</h1>${button('home','Retour à l’accueil')}</div><div id="sf91Status" class="sf91-status" role="status" aria-live="polite"></div>${state.accessError?`<p>${esc(state.accessError)}</p>${button('access','Réessayer')}`:!state.establishments.length?'<p>Aucun établissement autorisé. Une appartenance et des droits doivent être attribués par un administrateur habilité.</p>':`<div class="card sf91-filters"><label>Établissement<select class="input" data-filter="establishment">${state.establishments.map(e=>`<option value="${esc(e.id)}" ${e.id===state.establishmentId?'selected':''}>${esc(e.name)}</option>`).join('')}</select></label><label>Salle ou zone<select class="input" data-filter="room"><option value="">Choisir une salle</option>${rooms.map(r=>`<option value="${esc(r.id)}" ${r.id===state.roomId?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label>${button('refresh','Actualiser')}${allowed('can_manage_rooms')||allowed('can_manage_tables')?button('manage',state.manage?'Fermer la gestion':'Gérer les salles et les tables'):''}</div>${!state.loaded?'<p>Les données n’ont pas encore été chargées.</p>':activeRoom()?plan(activeRoom()):`<div class="card"><h2>Aucune salle active</h2><p>Créez une salle pour enregistrer ses tables.</p>${allowed('can_manage_rooms')?button('create-room','Créer une salle'):''}</div>`}${state.loaded?management():''}`}`;
    message(state.message,state.error);busy(state.busy);
  }
  async function write(name,args){
    if(state.busy)return;
    const who=actor(),est=state.establishmentId,sequence=++state.sequence;
    busy(true);message('Enregistrement en cours…');
    let accepted=false;
    try{
      await rpc(name,{p_establishment_id:est,...args});accepted=true;
      if(who!==actor()||est!==state.establishmentId||sequence!==state.sequence)return;
      const data=await rpc('reservations_read',{p_establishment_id:est});
      if(who!==actor()||est!==state.establishmentId||sequence!==state.sequence)return;
      state.data=data;state.loaded=true;state.roomEdit='';state.tableEdit='';
      if(!activeRoom())state.roomId=data.rooms.find(r=>r.active)?.id||'';
      state.message='Enregistrement confirmé et données relues.';state.error=false;render();
    }catch(error){if(who===actor()&&sequence===state.sequence)message(accepted?'Le serveur a accepté l’enregistrement, mais la relecture a échoué. Actualisez avant toute nouvelle tentative.':errorText(error),true)}
    finally{if(sequence===state.sequence)busy(false)}
  }
  function onSubmit(event){
    const form=event.target;if(!['sf91RoomForm','sf91TableForm'].includes(form.id))return;
    event.preventDefault();if(state.busy||!form.reportValidity())return;
    const data=new FormData(form),id=form.dataset.id||null,version=id?Number(form.dataset.version):null;
    if(form.id==='sf91RoomForm'){
      if(!allowed('can_manage_rooms'))return;
      const r=state.data.rooms.find(r=>r.id===id);
      void write('reservations_save_room',{p_id:id,p_expected_version:version,p_name:String(data.get('name')).trim(),p_description:String(data.get('description')),p_sort_order:Number(data.get('sort_order')),p_active:r?.active??true});
    }else{
      if(!allowed('can_manage_tables')||!activeRoom())return;
      const t=state.data.tables.find(t=>t.id===id);
      void write('reservations_save_table',{p_room_id:state.roomId,p_id:id,p_expected_version:version,p_label:String(data.get('label')).trim(),p_capacity:Number(data.get('capacity')),p_shape:String(data.get('shape')),p_active:t?.active??true});
    }
  }
  function onChange(event){
    if(state.busy)return;
    const type=event.target.dataset.filter;if(!type)return;
    state.roomEdit='';state.tableEdit='';state.selectedTable='';state.message='';
    if(type==='establishment'){state.establishmentId=event.target.value;state.roomId='';state.loaded=false;state.data={rooms:[],tables:[],layouts:[],elements:[]};render();void load()}
    if(type==='room'){state.roomId=event.target.value;render()}
  }
  function onClick(event){
    const target=event.target.closest?.('button[data-action]');if(!target||!root().contains(target))return;
    const {action,id}=target.dataset;
    const key=action+':'+(id||'');
    // The existing mobile owner calls .click(); its later native compatibility
    // click may target a rebuilt button. Deduplicate here, never globally.
    if(event.isTrusted&&event.detail>0&&window.matchMedia('(max-width:950px)').matches&&syntheticAction?.key===key&&Date.now()-syntheticAction.at<800){syntheticAction=null;event.preventDefault();return}
    if(state.busy)return;
    if(!event.isTrusted)syntheticAction={key,at:Date.now()};
    if(action==='home')return window.stopflow070CardNavigation?.openHome();
    if(action==='refresh')return void load();
    if(action==='access')return void refreshAccess();
    if(action==='manage')state.manage=!state.manage;
    if(action==='create-room'||action==='new-room'){state.manage=true;state.roomEdit=''}
    if(action==='edit-room'&&allowed('can_manage_rooms'))state.roomEdit=id;
    if(action==='new-table')state.tableEdit='';
    if(action==='edit-table'&&allowed('can_manage_tables'))state.tableEdit=id;
    if(action==='properties')state.selectedTable=id;
    if(action==='close-properties')state.selectedTable='';
    if(action==='archive-room'&&allowed('can_manage_rooms')){
      const r=state.data.rooms.find(r=>r.id===id);if(!r||!confirm(r.active?'Archiver cette salle sans supprimer ses tables ?':'Réactiver cette salle ?'))return;
      return void write('reservations_save_room',{p_id:r.id,p_expected_version:r.version,p_name:r.name,p_description:r.description,p_sort_order:r.sort_order,p_active:!r.active});
    }
    if(action==='archive-table'&&allowed('can_manage_tables')){
      const t=state.data.tables.find(t=>t.id===id);if(!t||!confirm(t.active?'Archiver cette table ?':'Réactiver cette table ?'))return;
      return void write('reservations_save_table',{p_room_id:t.room_id,p_id:t.id,p_expected_version:t.version,p_label:t.label,p_capacity:t.capacity,p_shape:t.shape,p_active:!t.active});
    }
    render();
  }
  function install(){
    if(!window.stopflow070CardNavigation?.active)return false;
    ensurePage();
    const previous=showApp;
    showApp=function(){const result=previous.apply(this,arguments);void refreshAccess();return result};
    document.getElementById('logout')?.addEventListener('click',reset);
    new MutationObserver(()=>{if(document.getElementById('app').classList.contains('hidden'))reset()}).observe(document.getElementById('app'),{attributes:true,attributeFilter:['class']});
    void refreshAccess();return true;
  }
  let attempts=0;
  const timer=setInterval(()=>{if(install()||++attempts>=100)clearInterval(timer)},100);
})();
