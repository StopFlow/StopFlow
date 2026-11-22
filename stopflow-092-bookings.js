/* StopFlow bookings V1. No client fallback, no customer service, no implicit service times. */
(function(){
 'use strict';if(window.stopflowBookingsV1?.active)return;
 const S={key:'',actor:'',est:'',zone:'',view:false,manage:false,day:'',room:'',rows:[],available:[],form:null,pending:null,busy:false,checking:false,checked:'',seq:0,notice:'',error:false,loading:false,loaded:false,loadError:false};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const root=()=>document.getElementById('sf92Bookings'),context=()=>window.stopflowReservations?.bookingContext?.();
 const key=()=> 'sf92-booking-intent:'+S.key;
 const issues=e=>e?.code==='23P01'?'Cette table vient d’être réservée sur ce créneau. Actualisez les disponibilités.':e?.code==='40001'?'La réservation a changé. Relisez son état avant de corriger votre saisie.':e?.code==='42501'?'Cette action ne vous est pas autorisée.':e?.code==='PGRST202'||e?.code==='42883'?'Le module agenda n’est pas installé dans cette base. Le plan existant reste disponible.':['22023','22007','22008','23514','23502','22P02'].includes(e?.code)?'Vérifiez le fuseau, les horaires, les couverts et la table. Une heure ambiguë ou inexistante est refusée.':'Résultat non confirmé. Votre intention reste conservée ; aucune répétition automatique.';
 const arrivalAllowed=value=>/^\d{4}-\d\d-\d\dT(?:0[89]|1\d|2[0-2]):(?:00|30)$/.test(value);
 function validSlot(d){return d&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(d.start)&&(arrivalAllowed(d.start)||(Boolean(d.editId)&&d.start===d.originalStart))&&(!d.end||d.end>d.start)&&Number.isInteger(Number(d.covers))&&Number(d.covers)>=1&&Number(d.covers)<=1000}
 // Arithmetic uses civil calendar values in UTC, never the browser's timezone.
 // The server still resolves establishment timezones and rejects DST ambiguity.
 function addDuration(start,minutes){const stamp=Date.parse(start+'Z'),amount=Number(minutes);if(!Number.isFinite(stamp)||!Number.isFinite(amount)||amount<=0)return '';const end=new Date(stamp+amount*60000);if(!Number.isFinite(end.getTime()))return '';const iso=end.toISOString();return iso.slice(0,16)+(iso.slice(17,23)==='00.000'?'':':'+iso.slice(17,23).replace(/0+$/,'').replace(/\.$/,''))}
 function storedDuration(start,end){return (Date.parse(end+'Z')-Date.parse(start+'Z'))/60000}
 function scheduleFields(d){
  const date=d.arrivalDate??d.start.split('T')[0],clock=d.arrivalTime??d.start.split('T')[1]??'',oldClock=(d.originalStart||'').split('T')[1];
  const slots=Array.from({length:30},(_,i)=>String(8+Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00'));
  if(d.editId&&oldClock&&!slots.includes(oldClock))slots.push(oldClock);
  const options=slots.map(t=>`<option value="${esc(t)}" ${clock===t?'selected':''}>${esc(t.slice(0,2)+' h '+t.slice(3,5)+(t.length>5?' min '+t.slice(6)+' s':''))}${t===oldClock&&!arrivalAllowed('2000-01-01T'+t)?' — horaire enregistré':''}</option>`).join('');
  return `<label>Date<input class="input" name="arrivalDate" type="date" required value="${esc(date)}"></label><label>Heure d’arrivée<select class="input" name="arrivalTime" required><option value="">Choisir une heure</option>${options}</select></label><label>Départ communiqué<input class="input" type="time" name="departure" value="${esc(d.departure||'')}"></label><p>Sans départ communiqué, l’occupation reste liée au service jusqu’à « Parti ».</p><input type="hidden" name="start" value="${esc(d.start)}"><input type="hidden" name="end" value="${esc(d.end)}">`;

 }
 function validDraft(d){return validSlot(d)&&typeof d.contact==='string'&&d.contact.trim().length>0&&d.contact.trim().length<=120}
 function signature(){const d=S.form;return d?JSON.stringify([d.start,d.end,Number(d.covers),d.targetRoom,d.editId,d.intentId]):''}
 function say(text,error=false){S.notice=text;S.error=error;const n=document.getElementById('sf92Status');if(n){n.textContent=text;n.setAttribute('role',error?'alert':'status');n.className=error?'error':''}}
 async function rpc(name,args){const c=context();if(!c?.actor||c.actor!==S.actor||c.establishmentId!==S.est)throw {code:'42501'};const {data,error}=await supabaseClient.rpc(name,args);if(error)throw error;return data}
 function time(value,full=false){try{return new Intl.DateTimeFormat('fr-BE',{timeZone:S.zone,year:full?'numeric':undefined,month:full?'2-digit':undefined,day:full?'2-digit':undefined,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value))}catch{return '—'}}
 function local(value,exact=false){if(!value)return null;const parts=new Intl.DateTimeFormat('en-CA',{timeZone:S.zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:exact?'2-digit':undefined,hourCycle:'h23'}).formatToParts(new Date(value));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));const fraction=exact?(String(value).match(/:\d\d(\.\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1]||'').replace(/0+$/,'').replace(/\.$/,''):'';return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`+(exact&&(p.second!=='00'||fraction)?`:${p.second}${fraction}`:'')}
 function tables(){return context()?.data?.tables||[]}
 function rooms(){return context()?.data?.rooms||[]}
 function render(){
  const node=root();if(!node)return;
  node.setAttribute?.('aria-busy',String(S.loading));node.setAttribute?.('data-booking-load',S.loading?'loading':S.loadError?'error':S.loaded?'loaded':'idle');
  if(!S.key){node.innerHTML='<p>Connexion Réservations requise.</p>';return}
  if(S.loading&&!S.view){node.innerHTML='<div class="card" role="status">Chargement des accès à l’agenda…</div>';return}
  if(!S.view){node.innerHTML=`<div class="card"><h2>Agenda journalier</h2><p>${esc(S.notice||'Aucun droit Agenda n’est attribué à cette appartenance. Le plan conserve ses propres droits.')}</p><button class="btn ghost" data-booking-action="reload">Réessayer la lecture</button></div>`;bind(node);return}
  if(!S.zone){node.innerHTML='<div class="card"><h2>Fuseau de l’établissement requis</h2><p>Aucun horaire implicite n’est utilisé. Le fuseau doit être configuré avant d’utiliser cet agenda. Le plan reste disponible.</p></div>';return}
  const rows=S.rows.map(b=>{const t=tables().find(t=>t.id===b.table_id),r=rooms().find(r=>r.id===b.room_id);return `<article class="sf92-row ${b.status==='cancelled'?'cancelled':''}"><div><strong>${esc(time(b.starts_at,local(b.starts_at).slice(0,10)!==S.day))} – ${b.departure_explicit===false||!b.ends_at?'départ non communiqué':esc(time(b.ends_at,local(b.ends_at).slice(0,10)!==S.day))}</strong><span>${esc(b.contact_name)}</span></div><div>${esc(b.covers)} couvert${b.covers>1?'s':''} · ${esc(t?.label||'Table archivée')} · ${esc(r?.name||'Salle archivée')}</div><span class="badge">${b.status==='cancelled'?'Annulée':'Confirmée'}</span>${S.manage&&b.status==='confirmed'?`<div class="sf92-actions"><button class="btn ghost" data-booking-action="edit" data-id="${esc(b.id)}">Modifier</button><button class="btn ghost" data-booking-action="cancel" data-id="${esc(b.id)}">Annuler la réservation</button></div>`:''}</article>`}).join('');
  const d=S.form;const options=S.available.map(t=>`<option value="${esc(t.id)}" ${d?.table===t.id?'selected':''}>${esc(t.label)} · ${esc(t.capacity)} places · ${esc(rooms().find(r=>r.id===t.room_id)?.name||'')}</option>`).join('');
  node.innerHTML=`<div class="sf92-toolbar"><h2>Agenda journalier</h2><label>Date<input class="input" type="date" data-booking-filter="day" value="${esc(S.day)}"></label><label>Salle<select class="input" data-booking-filter="room"><option value="">Toutes les salles</option>${rooms().map(r=>`<option value="${esc(r.id)}" ${r.id===S.room?'selected':''}>${esc(r.name)}${r.active?'':' (archivée)'}</option>`).join('')}</select></label><button class="btn ghost" data-booking-action="reload">Actualiser</button>${S.manage?'<button class="btn primary" data-booking-action="new">Nouvelle réservation</button>':''}</div><p class="muted">Fuseau : ${esc(S.zone)}. Une table par réservation ; occupation par service jusqu’à « Parti ». Les annulations restent visibles dans la journée concernée.</p><div id="sf92Status" class="${S.error?'error':''}" role="${S.error?'alert':'status'}" aria-live="polite">${esc(S.notice)}</div>
  ${S.pending?'<section class="sf92-recovery card"><h3>Envoi à vérifier</h3><p>Aucune nouvelle intention ne remplacera cet envoi.</p><button class="btn ghost" data-booking-action="reconcile">Relire le résultat</button><button class="btn ghost" data-booking-action="retry">Reprendre le même envoi</button></section>':''}
  ${d?`<form id="sf92Form" class="card sf92-form"><h3>${d.editId?'Modifier la réservation':'Nouvelle réservation'}</h3><label>Nom de contact<input class="input" name="contact" maxlength="120" required value="${esc(d.contact)}"></label>${scheduleFields(d)}<label>Couverts<input class="input" name="covers" type="number" min="1" max="1000" required value="${esc(d.covers)}"></label><label>Salle recherchée<select class="input" name="targetRoom"><option value="">Toutes les salles actives</option>${rooms().filter(r=>r.active||r.id===d.targetRoom).map(r=>`<option value="${esc(r.id)}" ${r.id===d.targetRoom?'selected':''}>${esc(r.name)}${r.active?'':' (archivée)'}</option>`).join('')}</select></label><button type="button" class="btn ghost" data-booking-action="available" ${S.checking?'disabled':''}>${S.checking?'Vérification…':'Vérifier les tables disponibles'}</button><label>Table<select class="input" name="table" required ${S.checked!==signature()?'disabled':''}><option value="">Choisir une table disponible</option>${options}</select></label>${S.conflict?'<button class="btn ghost" type="button" data-booking-action="rebase">Relire la version en gardant ma saisie</button>':''}<div class="sf92-actions"><button class="btn primary" type="submit" ${S.busy||S.pending||S.checked!==signature()?'disabled':''}>Enregistrer la réservation</button><button class="btn ghost" type="button" data-booking-action="close">Fermer le formulaire</button></div></form>`:''}
  <div class="sf92-list" aria-label="Réservations du jour">${S.loading?'<div class="card">Lecture de la journée en cours…</div>':S.loadError?'<div class="card">Lecture non confirmée. Réessayez la lecture.</div>':rows||(S.loaded?'<div class="card">Aucune réservation sur cette journée et cette salle.</div>':'')}</div>`;
  node.querySelectorAll('button,input,select').forEach(e=>{if(S.busy)e.disabled=true});bind(node);
 }
 function bind(node){
  node.onclick=e=>{const b=e.target.closest?.('[data-booking-action]');if(!b||!node.contains(b))return;e.preventDefault();void action(b.dataset.bookingAction,b.dataset.id)};
  const editInput=e=>{if(!S.form)return;const d=S.form;let name=e.target.name;
   if(['arrivalDate','arrivalTime','departure'].includes(name)){
    d.arrivalDate??=d.start.split('T')[0];d.arrivalTime??=d.start.split('T')[1]||'';d[name]=e.target.value;d.start=d.arrivalDate&&d.arrivalTime?d.arrivalDate+'T'+d.arrivalTime:'';d.end=d.departure?d.arrivalDate+'T'+d.departure:null;if(d.end&&d.departure<d.arrivalTime)d.end=window.stopflowServiceModel.shiftDay(d.arrivalDate,1)+'T'+d.departure;name='start';
    for(const side of ['start','end']){const input=node.querySelector('input[type="hidden"][name="'+side+'"]');if(input)input.value=d[side]}
    const label=document.getElementById('sf92CalculatedEnd');if(label)label.textContent=d.end?'Fin prévue : '+d.end.replace('T',' à '):'Choisissez une arrivée et une durée positive.';
   }else{if(!['contact','start','end','covers','table','targetRoom'].includes(name))return;d[name]=e.target.value;}
   d.dirty=true;if(['start','end','covers','targetRoom'].includes(name)){S.checked='';S.available=[];const select=node.querySelector('select[name="table"]');if(select)select.disabled=true;const save=node.querySelector('button[type="submit"]');if(save)save.disabled=true}
  };
  node.oninput=editInput;
  node.onchange=async e=>{if(['arrivalDate','arrivalTime','departure'].includes(e.target.name)){editInput(e);return}const type=e.target.dataset.bookingFilter;if(!type)return;if(!await leave()){e.target.value=type==='day'?S.day:S.room;return}S[type]=e.target.value;void refresh()};
  node.onsubmit=e=>{if(e.target.id!=='sf92Form')return;e.preventDefault();if(e.target.reportValidity())void save()};
 }
 async function leave(){
  if(S.pending){say('Relisez le résultat de l’envoi avant de quitter ou de changer de contexte.',true);return false}
  if(S.form?.dirty&&!await window.stopflowDialogs.confirm('Quitter ce brouillon de réservation non enregistré ?'))return false;
  S.form=null;S.checked='';S.available=[];return true;
 }
 function restoreIntent(){
  try{const raw=sessionStorage.getItem(key());if(!raw)return;if(raw.length>30000)throw Error();const p=JSON.parse(raw);if(p.key!==S.key||!['save','cancel'].includes(p.kind)||typeof p.args?.p_id!=='string'||p.args.p_establishment_id!==S.est)throw Error();S.pending=p;S.notice='Un envoi précédent doit être vérifié avant toute nouvelle réservation.'}catch{S.pending={invalid:true};S.notice='Reçu local inaccessible ou incompatible : aucune écriture autorisée.'}
 }
 async function mount(){
  if(!root())return;const c=context();const k=c?.actor&&c.establishmentId?JSON.stringify([c.actor,c.establishmentId]):'';
  if(k===S.key){if(S.parentRoom!==c?.roomId){S.parentRoom=c?.roomId||'';S.room=S.parentRoom;void refresh()}else render();return}
  S.seq++;Object.assign(S,{key:k,actor:c?.actor||'',est:c?.establishmentId||'',room:c?.roomId||'',parentRoom:c?.roomId||'',checking:false,zone:'',view:false,manage:false,rows:[],form:null,pending:null,busy:false,checked:'',available:[],notice:'Chargement de l’agenda…',error:false,loading:Boolean(k),loaded:false,loadError:false});const seq=S.seq;
  if(!k){render();return}
  restoreIntent();render();
  try{const data=await rpc('reservations_booking_context',{p_establishment_id:S.est});if(seq!==S.seq)return;S.zone=data.timezone;S.view=data.can_view===true;S.manage=data.can_manage===true;S.day=S.zone?local(new Date()).slice(0,10):'';S.loading=false;if(!S.pending){S.notice='';S.error=false}if(S.view&&S.zone)await refresh();else render()}catch(e){if(seq===S.seq){S.loading=false;S.loadError=true;S.notice=issues(e);render()}}
 }
 async function refresh(){
  if(!S.view||!S.zone||!S.day)return false;if(S.form){S.checked='';S.available=[]}const seq=++S.seq,est=S.est,actor=S.actor;S.loading=true;S.loaded=false;S.loadError=false;render();
  try{const data=await rpc('reservations_booking_day',{p_establishment_id:est,p_day:S.day,p_room_id:S.room||null});if(seq!==S.seq||actor!==S.actor)return;if(!Array.isArray(data?.bookings))throw Error();S.rows=data.bookings;S.loading=false;S.loaded=true;render();return true}catch(e){if(seq===S.seq){S.loading=false;S.loadError=true;say(issues(e),true);render()}return false}
 }
 async function availability(){
  if(S.busy||S.checking||S.pending||!S.form)return;
  const d=S.form;if(!validSlot(d)){say('Choisissez une arrivée entre 8 h 00 et 22 h 30, une départ éventuel après l’arrivée et les couverts. Les horaires existants inchangés sont conservés.',true);return}
  const sig=signature(),seq=S.seq,owner=S.actor,identity=S.key;S.checking=true;render();
  try{const data=await rpc('reservations_booking_available',{p_establishment_id:S.est,p_start:d.start,p_end:d.end,p_covers:Number(d.covers),p_room_id:d.targetRoom||null,p_exclude_id:d.editId||null});if(seq!==S.seq||owner!==S.actor||S.form!==d||signature()!==sig)return;if(!Array.isArray(data?.tables))throw Error();S.available=data.tables;S.checked=sig;if(!data.tables.some(t=>t.id===d.table))d.table='';say(data.tables.length?'Choisissez une table disponible, puis renseignez le contact pour enregistrer.':'Aucune table active et assez grande n’est disponible.')}catch(e){if(identity===S.key&&signature()===sig){S.checked='';say(issues(e),true)}}finally{if(identity===S.key){S.checking=false;render()}}
 }
 function persist(p){sessionStorage.setItem(key(),JSON.stringify(p));S.pending=p}
 function release(){try{sessionStorage.removeItem(key());S.pending=null;return true}catch{say('Résultat relu, mais reçu local non effaçable. Aucun nouvel envoi autorisé.',true);return false}}
 function matches(row,p){
  if(!row||row.id!==p.args.p_id||row.establishment_id!==S.est)return false;
  if(p.kind==='cancel')return row.status==='cancelled'&&row.version===p.args.p_expected_version+1;
  return row.status==='confirmed'&&row.table_id===p.args.p_table_id&&row.room_id===p.args.p_room_id&&row.contact_name===p.args.p_contact_name&&row.covers===p.args.p_covers&&local(row.starts_at,true)===p.args.p_start&&(!p.args.p_end||local(row.ends_at,true)===p.args.p_end)&&row.version===(p.args.p_expected_version===null?1:p.args.p_expected_version+1);
 }
 async function confirmed(p){
  const identity=S.key;if(p.key!==identity)throw Error('ACK_CONTEXT_CHANGED');
  const row=await rpc('reservations_booking_one',{p_establishment_id:S.est,p_id:p.args.p_id});if(identity!==S.key)throw Error('ACK_CONTEXT_CHANGED');if(!matches(row,p))throw Error('ACK_NOT_MATCHED');
  if(!release())throw Error('RECEIPT_REMOVE_FAILED');S.form=null;S.available=[];S.checked='';if(p.day)S.day=p.day;if(p.kind==='save'&&S.room&&S.room!==row.room_id)S.room=row.room_id;say(p.kind==='cancel'?'Annulation confirmée. La table est libérée.':'Réservation enregistrée et relue.');const refreshed=await refresh();if(identity===S.key&&!refreshed)say('Réservation confirmée, mais agenda non actualisé. Réessayez la lecture, pas l’enregistrement.',true);return true;
 }
 async function send(p,previous=false){
  if(S.busy||!S.manage||p.invalid)return;S.busy=true;const who=S.actor,est=S.est,identity=S.key;render();let requested=false,acknowledged=false;
  try{persist(p);requested=true;const row=await rpc(p.kind==='cancel'?'reservations_cancel_booking':'reservations_save_booking',p.args);acknowledged=true;if(who!==S.actor||est!==S.est||identity!==S.key)return;if(!matches(row,p))throw Error();await confirmed(p)}
  catch(e){if(who!==S.actor||est!==S.est||identity!==S.key)return;
   if(!requested){say('Stockage du reçu impossible : aucun envoi effectué.',true)}
   else if(!previous&&!acknowledged&&['23P01','40001','42501','22023','22007','22008','23514','23502','22P02'].includes(e?.code)){if(!release())return;S.conflict=e.code==='40001';say(issues(e),true);S.checked='';S.available=[];await refresh()}
   else say(issues(e),true);
  }finally{if(who===S.actor&&est===S.est&&identity===S.key){S.busy=false;render()}}
 }
 async function save(){
  if(S.busy||S.pending||!S.manage)return;const d=S.form;if(!validDraft(d)||S.checked!==signature())return;
  const t=S.available.find(t=>t.id===d.table);if(!t){say('Sélectionnez une table disponible.',true);return}
  const p={key:S.key,kind:'save',day:d.start.slice(0,10),args:{p_establishment_id:S.est,p_id:d.editId||d.intentId,p_expected_version:d.editId?d.version:null,p_room_id:t.room_id,p_table_id:t.id,p_contact_name:d.contact.trim(),p_start:d.start,p_end:d.end,p_covers:Number(d.covers)}};await send(p);
 }
 async function action(type,id){
  if(S.busy)return;
  if(type==='reload'){await refresh();return}
  if(type==='reconcile'){if(!S.pending||S.pending.invalid)return;const who=S.key;S.busy=true;try{await confirmed(S.pending)}catch{if(who===S.key)say('Envoi toujours non confirmé. La reprise garde le même identifiant et les mêmes valeurs.',true)}finally{if(who===S.key){S.busy=false;render()}}return}
  if(type==='retry'){if(S.pending&&!S.pending.invalid)await send(S.pending,true);return}
  if(type==='available'){await availability();return}
  if(type==='adjust-duration'&&S.form&&!S.pending){S.form.adjustDuration=!S.form.adjustDuration;render();return}
  if(type==='rebase'&&S.form?.editId&&!S.pending){S.busy=true;const who=S.key;try{const row=await rpc('reservations_booking_one',{p_establishment_id:S.est,p_id:S.form.editId});if(who!==S.key)return;if(!row||row.status!=='confirmed')throw Error();S.form.version=row.version;S.conflict=false;S.checked='';S.available=[];say('Version relue ; votre saisie est conservée. Vérifiez les disponibilités avant de confirmer.')}catch{if(who===S.key)say('Version non confirmée. Votre saisie est conservée, sans écriture.',true)}finally{if(who===S.key){S.busy=false;render()}}return}
  if(type==='close'){if(await leave())render();return}
  if(!S.manage||S.pending)return;
  if(type==='new'){if(!await leave())return;S.conflict=false;S.form={intentId:crypto.randomUUID(),editId:'',contact:'',start:'',end:'',arrivalDate:S.day,arrivalTime:'',departure:'',covers:'',table:'',targetRoom:S.room,dirty:false};S.checked='';render();root()?.querySelector('[name="contact"]')?.focus?.();return}
  const b=S.rows.find(b=>b.id===id);if(!b||b.status!=='confirmed')return;
  if(type==='edit'){if(!await leave())return;S.conflict=false;S.form={editId:b.id,version:b.version,contact:b.contact_name,start:local(b.starts_at,true),end:b.departure_explicit===false?null:local(b.ends_at,true),originalStart:local(b.starts_at,true),originalEnd:local(b.ends_at,true),departure:b.departure_explicit===false?'':(local(b.ends_at,true)||'').slice(11),covers:String(b.covers),table:b.table_id,targetRoom:S.room,dirty:false};S.checked='';S.available=[];render();return}
  if(type==='cancel'&&await leave()&&await window.stopflowDialogs.confirm('Annuler cette réservation ? Elle restera dans l’historique.'))await send({key:S.key,kind:'cancel',day:S.day,args:{p_establishment_id:S.est,p_id:b.id,p_expected_version:b.version}});
 }
 window.stopflowBookingsV1={active:true,mount,confirmLeave:leave,dirty:()=>Boolean(S.pending||S.form?.dirty),reload:refresh,diagnostics:()=>({actor_present:Boolean(S.actor),establishment_present:Boolean(S.est),timezone_present:Boolean(S.zone),can_view:S.view,can_manage:S.manage,loading:S.loading,loaded:S.loaded,load_error:S.loadError,pending:Boolean(S.pending),form_open:Boolean(S.form),row_count:S.rows.length}),reset(){S.seq++;Object.assign(S,{key:'',actor:'',est:'',zone:'',view:false,manage:false,form:null,pending:null,rows:[],busy:false,checking:false,loading:false,loaded:false,loadError:false})}};
 mount();
})();
