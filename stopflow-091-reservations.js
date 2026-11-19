/* Reservations, part 1: real RPC persistence; no local fallback and booking agenda is provided by the isolated V1 companion. */
(function(){
  'use strict';
  if(window.stopflowReservations?.active)return;
  const state={establishments:[],establishmentId:'',roomId:'',data:{rooms:[],tables:[],layouts:[],elements:[]},loaded:false,accessError:'',message:'',error:false,busy:false,manage:false,booking:false,roomForm:false,tableForm:false,roomEdit:'',tableEdit:'',selectedTable:'',actor:'',sequence:0};
  const esc=value=>escapeHTML(value);
  const actor=()=>session?.authMode==='supabase'&&session.id&&supabaseClient?session.id:'';
  const selected=()=>state.establishments.find(e=>e.id===state.establishmentId);
  const allowed=key=>Boolean(selected()?.[key]);
  const activeRoom=()=>state.data.rooms.find(r=>r.id===state.roomId&&r.active);
  const shapeNames={round:'Ronde',square:'Carrée',rectangle:'Rectangulaire'};
  const root=()=>document.getElementById('sf91Reservations');
  const canOpen=()=>Boolean(actor()&&(state.establishments.length||state.accessError));
  const api=window.stopflowReservations={active:true,canOpen,open,refreshAccess,confirmLeave:leaveDraft,bookingContext:()=>({actor:actor(),establishmentId:state.establishmentId,roomId:state.roomId,data:state.data})};
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
    if(error?.code==='23514'&&error?.message?.includes('BOOKING_RESOURCE_IN_USE'))return 'Des réservations utilisent encore cette ressource. Déplacez-les ou annulez-les avant de réduire sa capacité ou de l’archiver.';
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
    node.addEventListener('pointerdown',pointerStart);node.addEventListener('pointermove',pointerMove);node.addEventListener('pointerup',pointerEnd);node.addEventListener('pointercancel',pointerEnd);
    node.addEventListener('keydown',event=>{const t=event.target.closest?.('[data-layout-table]');if(t&&['Enter',' '].includes(event.key)){event.preventDefault();state.selectedTable=t.dataset.layoutTable;render()}});
    return node;
  }
  function reset(){
    syntheticAction=null;clearEditor();window.stopflowBookingsV1?.reset?.();window.stopflowService?.reset?.();
    state.sequence++;state.actor=actor();state.establishments=[];state.establishmentId='';state.roomId='';state.loaded=false;state.accessError='';state.manage=false;state.booking=false;state.roomForm=false;state.tableForm=false;state.roomEdit='';state.tableEdit='';state.selectedTable='';state.busy=false;state.message='';state.error=false;
    state.data={rooms:[],tables:[],layouts:[],elements:[]};
    render();refreshNavigation();
  }
  async function refreshAccess(){
    if(state.actor!==actor())reset();
    if(!actor()||state.busy)return;
    if(editor.dirty||editor.uncertain||(window.stopflowBookingsV1?.dirty?.()||window.stopflowService?.dirty?.())){message('Le brouillon est conservé. Terminez ou annulez l’édition avant de recharger les accès.');return}
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
    if(window.stopflowService?.active){state.booking=true;state.manage=false;}
    page('sf91Reservations');
    const title=window.stopflowService?.active?'Réservations — Service':'Réservations — Plan de salle';
    document.getElementById('pageTitle').textContent=title;
    const mobile=document.getElementById('sf52MobileTitle');if(mobile)mobile.textContent=title;
    render();
    await refreshAccess();
  }
  function busy(value){
    state.busy=value;root()?.setAttribute('aria-busy',String(value));
    root()?.querySelectorAll('fieldset,select[data-filter],button[data-action]').forEach(node=>{/** @type {HTMLFieldSetElement|HTMLSelectElement|HTMLButtonElement} */(node).disabled=value||node.hasAttribute('data-layout-readonly')});
  }
  async function load(discardAfter=false){
    if(!state.establishmentId||state.busy)return;
    const sequence=++state.sequence,who=actor(),est=state.establishmentId;
    busy(true);
    try{
      const data=await rpc('reservations_read',{p_establishment_id:est});
      if(sequence!==state.sequence||who!==actor()||est!==state.establishmentId)return;
      state.data=data;state.loaded=true;state.message='';state.error=false;if(discardAfter)clearEditor();
      if(!activeRoom())state.roomId=data.rooms.find(r=>r.active)?.id||'';
      render();
    }catch(error){if(sequence===state.sequence&&who===actor())message(errorText(error),true)}
    finally{if(sequence===state.sequence){busy(false)}}
  }
  const button=(action,text,id='')=>`<button type="button" class="btn ghost" aria-label="${esc(({'zoom-in':'Agrandir le plan','zoom-out':'Réduire le plan'})[action]||text)}" data-action="${action}" data-id="${esc(id)}">${esc(text)}</button>`;
  // Plan geometry stays in world units; SVG handles mouse/touch coordinate scaling.
  const editor={draft:null,baseline:'',layoutId:'',version:0,dirty:false,zoom:1,snap:true,drag:null,uncertain:false};
  const layout=()=>state.data.layouts.find(l=>l.room_id===state.roomId&&l.status==='active');
  const roomTables=()=>state.data.tables.filter(t=>t.room_id===state.roomId&&t.active);
  function geometries(){
    const l=layout();if(!l)return [];
    return roomTables().map((t,i)=>{
      const e=state.data.elements.find(e=>e.layout_id===l.id&&e.table_id===t.id&&e.kind==='table');
      if(!e)return null;
      const w=Number(e.width),h=Number(e.height),cols=Math.max(1,Math.floor((l.width-40)/160));
      return {element_id:e.id,table_id:t.id,expected_version:e.version,x:e.x===null?null:Number(e.x),y:e.y===null?null:Number(e.y),width:w,height:h,rotation:Number(e.rotation),autoX:20+(i%cols)*160,autoY:20+Math.floor(i/cols)*140};
    }).filter(Boolean);
  }
  const geometryPayload=g=>({element_id:g.element_id,table_id:g.table_id,expected_version:g.expected_version,x:g.x,y:g.y,width:g.width,height:g.height,rotation:g.rotation});
  function inside(g,l){
    if(!['x','y','width','height','rotation'].every(k=>Number.isFinite(g[k]))||g.width<20||g.height<20||g.rotation<0||g.rotation>=360)return false;
    const a=g.rotation*Math.PI/180,ex=Math.abs(Math.cos(a))*g.width/2+Math.abs(Math.sin(a))*g.height/2,ey=Math.abs(Math.sin(a))*g.width/2+Math.abs(Math.cos(a))*g.height/2;
    return g.x>=0&&g.y>=0&&g.x+g.width/2-ex>=-1e-6&&g.y+g.height/2-ey>=-1e-6&&g.x+g.width/2+ex<=l.width+1e-6&&g.y+g.height/2+ey<=l.height+1e-6;
  }
  function clearEditor(){editor.draft=null;editor.dirty=false;editor.drag=null;editor.uncertain=false}
  function leaveDraft(){
    if(window.stopflowService?.confirmLeave?.()===false)return false;
    if(window.stopflowBookingsV1?.confirmLeave?.()===false)return false;
    if(state.busy&&editor.draft){message('Attendez le résultat de l’enregistrement avant de quitter le plan.',true);return false}
    if(editor.uncertain){message('Résultat du dernier enregistrement indéterminé. Relisez le plan avant de quitter.',true);return false}
    if(editor.dirty&&!confirm('Le plan contient des modifications non enregistrées. Les abandonner ?'))return false;
    clearEditor();return true;
  }
  function changed(){editor.dirty=JSON.stringify(editor.draft.map(geometryPayload))!==editor.baseline}
  function beginEdit(){
    const l=layout(),rows=geometries();
    if(!allowed('can_manage_layouts')||!l||rows.length!==roomTables().length)return message('Édition indisponible : droit de gestion du plan et éléments cohérents requis.',true);
    editor.baseline=JSON.stringify(rows.map(geometryPayload));editor.layoutId=l.id;editor.version=l.version;
    editor.draft=rows.map(g=>({...g,x:g.x??g.autoX,y:g.y??g.autoY}));editor.uncertain=false;changed();render();
    message('Mode édition : vos déplacements restent en brouillon.');
  }
  function chairSvg(t,w,h){
    const n=Math.min(24,Math.max(0,Number(t.capacity)||0));let svg='';
    for(let i=0;i<n;i++){
      let x,y;
      if(t.shape==='round'){const a=2*Math.PI*i/n;x=w/2+(w/2+7)*Math.cos(a);y=h/2+(h/2+7)*Math.sin(a)}
      else{const half=Math.ceil(n/2),top=i<half,idx=top?i:i-half,total=top?half:n-half;x=(idx+1)*w/(total+1);y=top?-7:h+7}
      svg+=`<rect x="${x-6}" y="${y-4}" width="12" height="8" rx="3" class="sf91-chair"/>`;
    }
    return svg;
  }
  function editorPlan(room){
    const l=layout();if(!l)return '<p class="card">Aucun plan actif pour cette salle.</p>';
    const gs=editor.draft||geometries().map(g=>({...g,x:g.x??g.autoX,y:g.y??g.autoY}));
    const t=roomTables().find(t=>t.id===state.selectedTable),g=gs.find(g=>g.table_id===t?.id);
    const unplaced=geometries().some(g=>g.x===null||g.y===null);
    const tools=editor.draft?`${editor.uncertain?button('reconcile-plan','Relire le plan'):button('save-plan','Enregistrer le plan')}${button('cancel-plan','Annuler')}`:allowed('can_manage_layouts')?button('edit-plan','Modifier le plan'):'<span class="sf91-readonly">Consultation · édition du plan non autorisée</span>';
    return `<div class="sf91-editor"><div class="sf91-editor-tools"><strong>${editor.draft?'Édition du plan':'Consultation'}</strong><span id="sf91DraftLabel">${editor.dirty?'Brouillon non enregistré':''}</span>${tools}<span class="sf91-zoom">${button('zoom-out','−') }<output aria-label="Zoom">${Math.round(editor.zoom*100)} %</output>${button('zoom-in','+')}${button('center-plan','Recentrer')}</span><label class="sf91-grid-toggle"><input type="checkbox" data-layout-grid ${editor.snap?'checked':''}> Grille 10 unités</label></div><div class="sf91-editor-body"><div class="sf91-plan-viewport" tabindex="0" aria-label="Plan de salle, défilement et zoom"><svg id="sf91PlanSvg" role="group" aria-label="Plan ${esc(room.name)}" viewBox="0 0 ${l.width} ${l.height}" style="width:${editor.zoom*100}%;min-width:${editor.zoom*100}%" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="sf91Grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="#cbd5e1" stroke-width="0.6"/></pattern></defs><rect width="${l.width}" height="${l.height}" fill="${editor.snap?'url(#sf91Grid)':'#f8fafc'}"/>${gs.map(g=>{
      const table=roomTables().find(t=>t.id===g.table_id),round=table.shape==='round';
      return `<g data-layout-table="${esc(table.id)}" class="sf91-plan-table ${state.selectedTable===table.id?'selected':''}" role="button" tabindex="0" aria-label="Table ${esc(table.label)}, ${table.capacity} couverts" transform="translate(${g.x} ${g.y}) rotate(${g.rotation} ${g.width/2} ${g.height/2})">${chairSvg(table,g.width,g.height)}${round?`<ellipse cx="${g.width/2}" cy="${g.height/2}" rx="${g.width/2}" ry="${g.height/2}" class="sf91-table-top"/>`:`<rect width="${g.width}" height="${g.height}" rx="${table.shape==='square'?4:8}" class="sf91-table-top"/>`}<text x="${g.width/2}" y="${g.height/2-3}" text-anchor="middle" class="sf91-table-label">${esc(table.label)}</text><text x="${g.width/2}" y="${g.height/2+15}" text-anchor="middle" class="sf91-table-capacity">${table.capacity} pl.</text></g>`;
    }).join('')}</svg></div><aside class="sf91-editor-sidebar"><h2>Tables <span>${roomTables().length}</span></h2><div class="sf91-table-picker">${roomTables().map(t=>`<button type="button" class="btn ${state.selectedTable===t.id?'primary':'ghost'}" data-action="select-layout-table" data-id="${esc(t.id)}" aria-pressed="${state.selectedTable===t.id}">${esc(t.label)} <small>${t.capacity} pl.</small></button>`).join('')||'<p>Aucune table active.</p>'}</div>${t&&g?`<section class="sf91-layout-properties"><h3>Table ${esc(t.label)}</h3><p>${esc(shapeNames[t.shape])} · ${t.capacity} couverts${t.capacity>24?' · chaises représentées : 24 maximum':''}</p><form id="sf91GeometryForm"><fieldset ${editor.draft&&!editor.uncertain?'':'disabled data-layout-readonly'}><legend>Position et dimensions</legend>${[['x','X'],['y','Y'],['width','Largeur'],['height','Hauteur'],['rotation','Orientation (°)']].map(([k,label])=>`<label>${label}<input class="input" type="number" name="${k}" value="${g[k]}" step="${k==='rotation'?1:0.1}" min="${['width','height'].includes(k)?20:0}" max="${k==='rotation'?359.9:Math.max(l.width,l.height)}" required></label>`).join('')}<button class="btn" type="submit">Appliquer au brouillon</button></fieldset></form></section>`:'<p>Sélectionnez une table pour voir ses propriétés.</p>'}<p class="muted">${unplaced?'Placement provisoire des tables sans position enregistrée. ':''}Aucune réservation client, disponibilité ou occupation calculée.</p></aside></div></div>`;
  }
  function onGeometrySubmit(event){
    if(event.target.id!=='sf91GeometryForm')return false;event.preventDefault();
    if(state.busy||!editor.draft||!allowed('can_manage_layouts')||editor.uncertain)return true;
    const form=event.target;if(!form.reportValidity())return true;
    const data=new FormData(form),g=editor.draft.find(g=>g.table_id===state.selectedTable);if(!g)return true;
    const next={...g};for(const k of ['x','y','width','height','rotation'])next[k]=Number(data.get(k));
    if(!inside(next,layout())){message('La table doit rester dans le plan, avec des dimensions et une orientation valides.',true);return true}
    Object.assign(g,next);changed();render();message('Brouillon modifié, non enregistré.');return true;
  }
  function point(event){
    const svg=document.getElementById('sf91PlanSvg'),p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  function pointerStart(event){
    if(editor.drag||(event.button!==undefined&&event.button!==0))return;
    const node=event.target.closest?.('[data-layout-table]');if(!node||state.busy)return;
    state.selectedTable=node.dataset.layoutTable;
    if(!editor.draft||!allowed('can_manage_layouts')||editor.uncertain){render();return}
    const p=point(event),g=editor.draft.find(g=>g.table_id===state.selectedTable);if(!g)return;
    event.preventDefault();editor.drag={id:event.pointerId,table:g.table_id,x:p.x,y:p.y,startX:g.x,startY:g.y};root().setPointerCapture(event.pointerId);render();
  }
  function pointerMove(event){
    if(!editor.drag||editor.drag.id!==event.pointerId||!editor.draft||state.busy)return;
    event.preventDefault();const p=point(event),g=editor.draft.find(g=>g.table_id===editor.drag.table),l=layout();
    const snap=v=>editor.snap?Math.round(v/10)*10:Math.round(v*10)/10;
    const next={...g,x:snap(editor.drag.startX+p.x-editor.drag.x),y:snap(editor.drag.startY+p.y-editor.drag.y)};
    if(!inside(next,l))return;Object.assign(g,next);changed();
    const node=root().querySelector(`[data-layout-table="${g.table_id}"]`);node?.setAttribute('transform',`translate(${g.x} ${g.y}) rotate(${g.rotation} ${g.width/2} ${g.height/2})`);
    const label=document.getElementById('sf91DraftLabel');if(label)label.textContent=editor.dirty?'Brouillon non enregistré':'';
  }
  function pointerEnd(event){if(editor.drag?.id===event.pointerId){editor.drag=null;render()}}
  async function savePlan(){
    if(state.busy||!editor.draft||!editor.dirty||!allowed('can_manage_layouts')||editor.uncertain)return;
    if(!editor.draft.every(g=>inside(g,layout()))){message('Corrigez les tables hors du plan avant enregistrement.',true);return}
    const est=state.establishmentId,room=state.roomId,who=actor(),sequence=++state.sequence;
    busy(true);message('Enregistrement du plan…');let accepted=false;
    try{
      const saved=await rpc('reservations_save_layout',{p_establishment_id:est,p_room_id:room,p_layout_id:editor.layoutId,p_expected_version:editor.version,p_elements:editor.draft.map(geometryPayload)});accepted=true;
      const data=await rpc('reservations_read',{p_establishment_id:est});
      if(who!==actor()||est!==state.establishmentId||room!==state.roomId||sequence!==state.sequence)return;
      const confirmed=data.layouts.find(l=>l.id===editor.layoutId);
      if(!confirmed||confirmed.version!==saved?.version||!editor.draft.every(g=>{const e=data.elements.find(e=>e.id===g.element_id&&e.table_id===g.table_id&&e.layout_id===editor.layoutId);return e&&Number(e.version)===Number(g.expected_version)+1&&['x','y','width','height','rotation'].every(k=>e[k]!==null&&Number(e[k])===g[k])}))throw {code:'40001'};
      state.data=data;clearEditor();render();message('Plan enregistré et positions relues.');
    }catch(error){
      if(who!==actor()||sequence!==state.sequence)return;
      if(accepted||!error?.code||!['40001','42501','22023','22P02','23514','42883','PGRST202'].includes(error.code))editor.uncertain=true;
      if(editor.uncertain)render();
      message(editor.uncertain?'Résultat à vérifier : relisez le plan avant toute nouvelle tentative. Votre brouillon reste disponible.':errorText(error),true);
    }finally{if(sequence===state.sequence){busy(false)}}
  }

  function management(){
    const room=activeRoom();
    let html='<div class="sf91-management" aria-label="Gestion des salles et tables">';
    if(allowed('can_manage_rooms')){
      const r=state.data.rooms.find(r=>r.id===state.roomEdit);
      html+=`<div class="card"><div class="sf91-section-heading"><h2>Salles</h2>${button('new-room','Créer une salle')}</div>${state.roomForm?`<form id="sf91RoomForm" class="sf91-form" data-id="${esc(r?.id||'')}" data-version="${esc(r?.version||'')}"><fieldset><legend>${r?'Modifier la salle':'Nouvelle salle'}</legend><label>Nom<input class="input" name="name" required maxlength="120" value="${esc(r?.name||'')}"></label><label>Description<textarea class="input" name="description" rows="2" maxlength="2000">${esc(r?.description||'')}</textarea></label><label>Ordre d’affichage<input class="input" name="sort_order" type="number" required min="0" max="10000" step="1" value="${esc(r?.sort_order??0)}"></label><div class="sf91-form-actions"><button class="btn primary" type="submit">Enregistrer la salle</button>${button('cancel-room','Annuler')}</div></fieldset></form>`:''}<ul class="sf91-list">${state.data.rooms.map(r=>`<li><span>${esc(r.name)}${r.active?'':' · archivée'}</span><div class="sf91-row-actions">${button('edit-room','Modifier',r.id)}${button('archive-room',r.active?'Archiver':'Réactiver',r.id)}</div></li>`).join('')}</ul></div>`;
    }
    if(allowed('can_manage_tables')){
      const t=state.data.tables.find(t=>t.id===state.tableEdit&&t.room_id===room?.id);
      html+=`<div class="card"><div class="sf91-section-heading"><h2>${room?`Tables — ${esc(room.name)}`:'Tables'}</h2>${room?button('new-table','Ajouter une table'):''}</div>${!room?'<p>Sélectionnez une salle active pour gérer ses tables.</p>':`${state.tableForm?`<form id="sf91TableForm" class="sf91-form" data-id="${esc(t?.id||'')}" data-version="${esc(t?.version||'')}"><fieldset><legend>${t?'Modifier la table':'Nouvelle table'}</legend><label>Numéro ou libellé<input class="input" name="label" required maxlength="40" value="${esc(t?.label||'')}"></label><div class="sf91-form-row"><label>Capacité en couverts<input class="input" name="capacity" type="number" required min="1" max="1000" step="1" value="${esc(t?.capacity??2)}"></label><label>Forme<select class="input" name="shape">${Object.entries(shapeNames).map(([key,value])=>`<option value="${key}" ${t?.shape===key?'selected':''}>${value}</option>`).join('')}</select></label></div><div class="sf91-form-actions"><button class="btn primary" type="submit">Enregistrer la table</button>${button('cancel-table','Annuler')}</div></fieldset></form>`:''}<ul class="sf91-list">${state.data.tables.filter(t=>t.room_id===room.id).map(t=>`<li><span>${esc(t.label)} · ${esc(t.capacity)} couverts · ${esc(shapeNames[t.shape])}${t.active?'':' · archivée'}</span><div class="sf91-row-actions">${button('edit-table','Modifier',t.id)}${button('archive-table',t.active?'Archiver':'Réactiver',t.id)}</div></li>`).join('')}</ul>`}</div>`;
    }
    return html+'</div>';
  }
  function viewSwitch(){
    return `<div class="sf91-views" role="group" aria-label="Vue Réservations"><button type="button" class="btn ${state.booking?'primary':'ghost'}" data-action="view-agenda">${window.stopflowService?.active?'Service':'Agenda journalier'}</button><button type="button" class="btn ${!state.manage&&!state.booking?'primary':'ghost'}" data-action="view-plan">Consulter le plan</button>${allowed('can_manage_rooms')||allowed('can_manage_tables')?`<button type="button" class="btn ${state.manage?'primary':'ghost'}" data-action="manage">Gérer les salles et les tables</button>`:''}</div>`;
  }
  function render(){
    const node=ensurePage(),viewport=node.querySelector('.sf91-plan-viewport'),scroll=viewport?{left:viewport.scrollLeft,top:viewport.scrollTop}:null;
    if(!actor()){node.innerHTML='<h1>Réservations — Plan de salle</h1><p>Une connexion Supabase authentifiée est requise. Aucune donnée de démonstration ni sauvegarde locale ne remplace la base.</p>';return}
    if(!allowed('can_manage_rooms')&&!allowed('can_manage_tables')){state.manage=false;state.roomForm=false;state.tableForm=false}
    const rooms=state.data.rooms.filter(r=>r.active);
    node.innerHTML=`<h1 class="sf91-sr-only">${state.booking?'Agenda des réservations':'Plan de salle'}</h1><div id="sf91Status" class="sf91-status" role="status" aria-live="polite"></div>${state.accessError?`<p>${esc(state.accessError)}</p>${button('access','Réessayer')}`:!state.establishments.length?'<p>Aucun établissement autorisé. Une appartenance et des droits doivent être attribués par un administrateur habilité.</p>':`<div class="card sf91-filters"><label>Établissement<select class="input" data-filter="establishment">${state.establishments.map(e=>`<option value="${esc(e.id)}" ${e.id===state.establishmentId?'selected':''}>${esc(e.name)}</option>`).join('')}</select></label>${state.booking?'':`<label>Salle ou zone<select class="input" data-filter="room"><option value="">Choisir une salle</option>${rooms.map(r=>`<option value="${esc(r.id)}" ${r.id===state.roomId?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label>`}${button('refresh','Actualiser')}${button('home','Accueil')}</div>${viewSwitch()}${!state.loaded?'<p>Les données n’ont pas encore été chargées.</p>':state.booking?(window.stopflowService?.active?'<section id="sf93Service" aria-label="Service et plan commun"></section>':'<section id="sf92Bookings" aria-label="Agenda des réservations"></section>'):state.manage?management():activeRoom()?editorPlan(activeRoom()):`<div class="card"><h2>Aucune salle active</h2><p>Créez une salle pour enregistrer ses tables.</p>${allowed('can_manage_rooms')?button('create-room','Créer une salle'):''}</div>`}`}`;
    message(state.message,state.error);busy(state.busy);if(window.stopflowService?.active)window.stopflowService.mount();else window.stopflowBookingsV1?.mount?.();
    if(scroll){const next=node.querySelector('.sf91-plan-viewport');if(next){next.scrollLeft=scroll.left;next.scrollTop=scroll.top}}
  }
  async function write(name,args){
    if(state.busy)return;
    const who=actor(),est=state.establishmentId,sequence=++state.sequence;
    busy(true);message('Enregistrement en cours…');
    let accepted=false;
    try{
      const saved=await rpc(name,{p_establishment_id:est,...args});accepted=true;
      if(who!==actor()||est!==state.establishmentId||sequence!==state.sequence)return;
      const data=await rpc('reservations_read',{p_establishment_id:est});
      if(who!==actor()||est!==state.establishmentId||sequence!==state.sequence)return;
      state.data=data;state.loaded=true;state.roomForm=false;state.tableForm=false;state.roomEdit='';state.tableEdit='';
      if(name==='reservations_save_room'&&!args.p_id&&data.rooms.some(r=>r.id===saved?.id&&r.active))state.roomId=saved.id;
      if(!activeRoom())state.roomId=data.rooms.find(r=>r.active)?.id||'';
      state.message='Enregistrement confirmé et données relues.';state.error=false;render();
      document.getElementById('sf91Status')?.scrollIntoView?.({block:'nearest'});
    }catch(error){if(who===actor()&&sequence===state.sequence)message(accepted?'Le serveur a accepté l’enregistrement, mais la relecture a échoué. Actualisez avant toute nouvelle tentative.':errorText(error),true)}
    finally{if(sequence===state.sequence)busy(false)}
  }
  function onSubmit(event){
    if(onGeometrySubmit(event))return;
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
    if(event.target.hasAttribute?.('data-layout-grid')){editor.snap=event.target.checked;render();return}
    const type=event.target.dataset.filter;if(!type)return;
    if(!leaveDraft()){event.target.value=type==='room'?state.roomId:state.establishmentId;return}
    state.roomForm=false;state.tableForm=false;state.roomEdit='';state.tableEdit='';state.selectedTable='';state.message='';
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
    if(action==='view-agenda'){if(!leaveDraft())return;state.booking=true;state.manage=false;render();return}
    if(action==='home'){if(leaveDraft())window.stopflow070CardNavigation?.openHome();return}
    if(action==='refresh'){if(leaveDraft())void load();return}
    if(action==='reconcile-plan'){if(confirm('Relire le plan enregistré et abandonner le brouillon seulement si la lecture réussit ?'))void load(true);return}
    if(action==='edit-plan'){if(window.stopflowPlanEditor&&window.stopflowService?.openEditor){if(!leaveDraft())return;state.booking=true;state.manage=false;render();void window.stopflowService.openEditor(state.roomId);return;}beginEdit();return}
    if(action==='save-plan')return void savePlan();
    if(action==='cancel-plan'){if(leaveDraft()){render();message('Brouillon annulé. Le dernier plan enregistré est affiché.')}return}
    if(action==='zoom-in'||action==='zoom-out'){editor.zoom=Math.max(0.5,Math.min(3,editor.zoom+(action==='zoom-in'?0.25:-0.25)));render();return}
    if(action==='center-plan'){editor.zoom=1;render();const viewport=root().querySelector('.sf91-plan-viewport');if(viewport){viewport.scrollLeft=0;viewport.scrollTop=0}return}
    if(action==='select-layout-table'){state.selectedTable=id;render();return}
    if(['manage','view-plan','new-room','create-room','edit-room','new-table','edit-table','archive-room','archive-table'].includes(action)&&!leaveDraft())return;
    if(action==='access')return void refreshAccess();
    if(action==='manage'&&(allowed('can_manage_rooms')||allowed('can_manage_tables'))){state.booking=false;state.manage=true;}
    if(action==='view-plan'){state.booking=false;state.manage=false;state.roomForm=false;state.tableForm=false;state.roomEdit='';state.tableEdit=''}
    if((action==='create-room'||action==='new-room')&&allowed('can_manage_rooms')){state.manage=true;state.roomForm=true;state.tableForm=false;state.roomEdit=''}
    if(action==='edit-room'&&allowed('can_manage_rooms')){state.roomForm=true;state.tableForm=false;state.roomEdit=id}
    if(action==='new-table'&&allowed('can_manage_tables')&&activeRoom()){state.tableForm=true;state.roomForm=false;state.tableEdit=''}
    if(action==='edit-table'&&allowed('can_manage_tables')&&activeRoom()){state.tableForm=true;state.roomForm=false;state.tableEdit=id}
    if(action==='cancel-room'){state.roomForm=false;state.roomEdit=''}
    if(action==='cancel-table'){state.tableForm=false;state.tableEdit=''}
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
    const formId=state.roomForm?'sf91RoomForm':state.tableForm?'sf91TableForm':null;
    if(formId&&['create-room','new-room','edit-room','new-table','edit-table'].includes(action))document.getElementById(formId)?.querySelector('input')?.focus();
    if(action==='cancel-room'||action==='cancel-table')root()?.querySelector(`[data-action="${action==='cancel-room'?'new-room':'new-table'}"]`)?.focus();
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
  window.addEventListener?.('beforeunload',event=>{if(editor.dirty||editor.uncertain||(window.stopflowBookingsV1?.dirty?.()||window.stopflowService?.dirty?.())){event.preventDefault();event.returnValue=''}});
  const originalPage=page;page=function(id){if(id!=='sf91Reservations'&&(editor.dirty||editor.uncertain||(window.stopflowBookingsV1?.dirty?.()||window.stopflowService?.dirty?.()))&&!leaveDraft())return;return originalPage.apply(this,arguments)};
  document.addEventListener?.('click',event=>{if(!editor.dirty&&!editor.uncertain&&!(window.stopflowBookingsV1?.dirty?.()||window.stopflowService?.dirty?.()))return;const target=event.target.closest?.('[data-sf70-zone],[data-sf70-card],[data-page],#logout,#home');if(target?.id==='logout'&&!editor.dirty&&!editor.uncertain){window.stopflowBookingsV1?.reset?.();window.stopflowService?.reset?.();return}if(target&&!root()?.contains(target)&&!leaveDraft()){event.preventDefault();event.stopImmediatePropagation()}},true);
  let attempts=0;
  const timer=setInterval(()=>{if(install()||++attempts>=100)clearInterval(timer)},100);
})();
