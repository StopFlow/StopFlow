/* Photo + durable capture + associated versioned human control. No OCR or OneDrive call. */
(function(){'use strict';const O=window.stopflowOperationsModel,TARGET='https://mmrdpyhoawwoplbzqwag.supabase.co';let H;
const C={running:false,capture:null,picking:false,pendingPDF:null,objects:[]};
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const captureKey=()=>`stopflow-receipt-capture:${H.S.actor}:${H.S.dep}`,pdfKey=()=>`stopflow-receipt-pdf:${H.S.actor}:${H.S.dep}`;
const uuid=()=>crypto.randomUUID(),same=(a,d)=>H.scopeStill(a,d);
function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('stopflow-receipt-photos',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('PHOTO_RESCUE_UNAVAILABLE'));});}
async function photo(action,key,value){if(action==='put')value={bytes:await value.arrayBuffer(),name:value.name,type:value.type,lastModified:value.lastModified};const database=await db();try{const result=await new Promise((resolve,reject)=>{const t=database.transaction('photos',action==='get'?'readonly':'readwrite'),o=t.objectStore('photos'),r=action==='get'?o.get(key):action==='put'?o.put(value,key):o.delete(key);let result;r.onsuccess=()=>result=r.result;t.oncomplete=()=>resolve(result);t.onerror=()=>reject(Error('PHOTO_RESCUE_UNAVAILABLE'));t.onabort=()=>reject(Error('PHOTO_RESCUE_UNAVAILABLE'));});return action==='get'&&result?.bytes instanceof ArrayBuffer?new File([result.bytes],result.name,{type:result.type,lastModified:result.lastModified}):result;}finally{database.close();}}
async function hash(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function storeCapture(){if(C.capture)localStorage.setItem(captureKey(),JSON.stringify(C.capture));else localStorage.removeItem(captureKey());}
function sync(){C.capture=JSON.parse(localStorage.getItem(captureKey())||'null');C.pendingPDF=new O.Intent(localStorage,pdfKey());C.picking=false;}
async function rpc(action,payload={},request=null){H.verify();const {data,error}=await supabaseClient.rpc('pilot_receipt_controls',{p_action:action,p_request:request,p_payload:{department:H.S.dep,...payload}});if(error)throw error;return data;}
async function write(action,payload,request=uuid()){
 const S=H.S,a=S.actor,d=S.dep,epoch=S.epoch,i=S.intent;let intention;S.busy=true;H.render();
 try{intention=i.begin('control:'+action,{department:d,...structuredClone(payload)},request);const out=await rpc(action,intention.payload,intention.id);same(a,d);
 if(['start','save','correct'].includes(action)){const fresh=await H.api('read',{id:out.id});same(a,d);if(fresh.revision!==out.revision)throw Object.assign(Error('READ_CHANGED'),{code:'40001'});S.doc=fresh;if(epoch===S.epoch){H.currentData(fresh);S.dirty=false;localStorage.removeItem(H.key());}}
 i.clear();await H.refreshList();H.status('Enregistrement confirmé et relu.');return out;
 }catch(e){if(intention){if(['23505','22007','22008','23502','22003'].includes(e.code)&&!i.current?.uncertain)i.clear();else i.fail(e);}throw e;}finally{S.busy=false;H.render();}
}
async function select(file,mode='new'){
 if(C.running||!file)return;C.running=true;H.render();const S=H.S,a=S.actor,d=S.dep;
 try{
 if(S.intent.current||C.pendingPDF.current)throw Error('RECONCILIATION_REQUIRED');
 if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>15728640)throw Object.assign(Error('FILE'),{code:'22023'});
 const quality=await window.stopflowReceiptReading?.quality(file);const sha=await hash(file);same(a,d);
 if(C.capture){if(C.capture.payload.sha256!==sha)throw Error('CAPTURE_ALREADY_PENDING');await photo('put',C.capture.blobKey,file);H.status('Photo retrouvée. Reprenez le même enregistrement.');return;}
 const id=mode==='append'?S.doc.id:uuid();const key=`${a}:${d}:${id}:${uuid()}`;
 // Persist the bytes before creating any server folder. No success claim if this rescue is refused.
 await photo('put',key,file);same(a,d);
 C.capture={quality,actor:a,department:d,mode,request_id:uuid(),start_id:uuid(),blobKey:key,stage:'selected',flow:mode==='append'?'append':null,payload:{id,file_id:uuid(),version:mode==='append'?S.doc.revision:null,kind:C.intakeKind||'delivery',name:file.name,mime:file.type,bytes:file.size,sha256:sha}};storeCapture();C.picking=false;
 }finally{C.running=false;H.render();}
 if(mode==='append'&&!H.S.busy)await execute('append');
}
async function privateBytes(file){const r=await supabaseClient.storage.from('pilot-receipts-private').download(file.path);if(r.error)throw r.error;if(r.data.size!==file.bytes||await hash(r.data)!==file.sha256)throw Error('ORIGINAL_HASH_MISMATCH');return r.data;}
async function execute(flow){
 if(C.running||H.S.busy||!C.capture||C.capture.quality?.accepted===false)return;C.running=true;H.render();const S=H.S,a=S.actor,d=S.dep,cap=C.capture;
 try{
 if(cap.actor!==a||cap.department!==d)throw Error('ACTOR_CHANGED');cap.flow=cap.flow||flow;storeCapture();
 H.status('Enregistrement de l’original privé…');
 if(cap.stage==='selected'){
 if(!cap.started){if(S.dirty){if(!await stopflowDialogs.confirm('Enregistrer le brouillon actuel avant cette photo ?'))return;await H.save();}if(cap.mode==='append')cap.payload.version=S.doc.revision;cap.started=true;storeCapture();}
 const result=await write(cap.mode==='append'?'append':'capture',cap.payload,cap.request_id);same(a,d);cap.result=result;cap.stage='registered';storeCapture();
 }
 const file=cap.result.file,blob=await photo('get',cap.blobKey);same(a,d);
 if(blob){if(await hash(blob)!==file.sha256)throw Error('ORIGINAL_HASH_MISMATCH');const r=await Promise.race([supabaseClient.storage.from('pilot-receipts-private').upload(file.path,new Uint8Array(await blob.arrayBuffer()),{contentType:file.mime,upsert:false}),new Promise((_,reject)=>setTimeout(()=>reject(Error('ORIGINAL_UPLOAD_UNCONFIRMED')),30000))]);if(r.error){try{await privateBytes(file);}catch{throw r.error;}}}
 const privateOriginal=await privateBytes(file);same(a,d);cap.stage='uploaded';storeCapture();
 let fresh=await H.api('read',{id:cap.result.document_id});same(a,d);S.tab='receipt';H.currentData(fresh);S.dirty=false;if(file.mime.startsWith('image/')){if(S.objectUrl)URL.revokeObjectURL(S.objectUrl);S.objectUrl=URL.createObjectURL(privateOriginal);S.previewName=file.name;}
 if(window.stopflowReceiptReading&&['start','catalogue','append'].includes(cap.flow)){const readable=await window.stopflowReceiptReading.readAll();if(cap.flow==='start'&&readable!==false)await window.stopflowReceiptReading.start();else if(cap.flow==='catalogue')window.stopflowReceiptReading.mode='catalogue';fresh=S.doc;}
 else if(cap.flow==='start'&&fresh.receipt_state==='awaiting_control'){
 if(!cap.start_payload){cap.start_payload={id:fresh.id,version:fresh.revision};storeCapture();}
 await write('start',cap.start_payload,cap.start_id);
 if(!S.data.lines.length)S.data.lines=[window.stopflowReceiptsModel.line(d)];
 }
 if(cap.flow==='only'){S.doc=null;S.data=null;S.tab='documents';await H.refreshList();H.status(fresh.receipt_state==='complete'?'Document déjà enregistré : son contrôle terminé est conservé. Aucun dossier en double.':'Original enregistré — À contrôler. La réception et sa fiche restent disponibles dans les documents enregistrés.');}
 else if(cap.flow==='append')H.status('Page ajoutée explicitement à ce document. Aucun autre dossier créé.');
 else if(fresh.receipt_state==='complete')H.status('Document déjà enregistré : fiche et contrôle terminé conservés, sans doublon.');else H.status('Document associé ouvert. Vérifiez les lignes proposées ; quantité reçue, température et conformité restent à renseigner. Le contrôle n’est pas terminé.');
 await photo('delete',cap.blobKey);same(a,d);C.capture=null;storeCapture();C.picking=false;
 }catch(e){H.status(message(e),true);throw e;}finally{C.running=false;H.render();}
}
function message(e){return ({PHOTO_RESCUE_UNAVAILABLE:'La photo ne peut pas être conservée dans ce navigateur. Aucun nouveau dossier n’est créé. Gardez cet onglet ouvert et réessayez.',CAPTURE_ALREADY_PENDING:'Une autre photo attend sa reprise. Reprenez-la avant de créer un nouveau dossier.',ORIGINAL_HASH_MISMATCH:'L’empreinte de l’original diffère. Aucun contrôle terminé n’est annoncé.',ORIGINAL_UPLOAD_UNCONFIRMED:'Transfert non confirmé. La photo et le dossier de reprise sont conservés ; reprenez le même enregistrement.',RECONCILIATION_REQUIRED:'Un envoi reste à vérifier. Reprenez-le avant une nouvelle intention.',CONTROL_PDF_UNCONFIRMED:'PDF non confirmé. Le brouillon, les originaux et le même identifiant d’envoi sont conservés.',ORIGINAL_IMAGE_UNREADABLE:'Photo non lisible pour le PDF. L’original et le brouillon sont conservés.',ORIGINAL_PDF_UNREADABLE:'PDF original illisible ou protégé. Le brouillon reste disponible.',CONTROL_PDF_SIZE_LIMIT:'Le bon dépasse la taille autorisée. Les originaux et la fiche sont conservés ; aucun contrôle terminé n’est annoncé.',ANNEX_PAGE_LIMIT:'Trop de pages pour ce bon. Les originaux et le brouillon sont conservés.',ORIGINAL_TOTAL_LIMIT:'Les originaux dépassent la taille du traitement. Ils restent conservés, sans contrôle déclaré terminé.'})[e?.status||e?.message]||H.errorText(e);}
function intake(){if(window.stopflowReceiptReading)return window.stopflowReceiptReading.intake();const cap=C.capture;return `<section class="sf102-intake"><h2>${cap?'Document sélectionné':'Photographier ou importer un document'}</h2><p>Chaque nouveau document possède sa réception et sa fiche. Les pages d’un même bon sont ajoutées uniquement avec « Ajouter une page à ce document ».</p>${cap?`<p><strong>${escape(cap.payload.name)}</strong> · ${Math.ceil(cap.payload.bytes/1024)} Ko</p><p>Photo conservée pour la reprise. Aucune reconnaissance automatique de produits.</p><div class="sf102-actions">${cap.flow?'<button type="button" class="btn primary" data-receipt="capture-resume">Reprendre le même enregistrement</button>':'<button type="button" class="btn ghost" data-receipt="capture-only">Enregistrer seulement</button><button type="button" class="btn primary" data-receipt="capture-start">Créer la fiche de contrôle</button>'}${cap.stage==='selected'&&!H.S.intent.current?'<button type="button" class="btn ghost" data-receipt="capture-cancel">Annuler</button>':''}</div>`:`<label class="sf102-upload">Photo ou document PDF / image<input type="file" data-capture-file accept="application/pdf,image/jpeg,image/png,image/webp"></label><p>Un document à la fois, jusqu’à 15 Mo. Un PDF multipage reste un seul document.</p><button type="button" class="btn ghost" data-receipt="capture-cancel">Retour</button>`}</section>`;}
function controls(){const S=H.S,items=S.doc?.controls||[];return `<section class="sf102-control-history"><h2>Bons de contrôle et versions</h2>${items.filter(v=>v.status==='completed'||v.status==='legacy').map(v=>`<article><strong>Contrôle v${v.version}</strong><span>${escape(v.operator_label||'Opérateur enregistré')} · ${escape(v.completed_at?new Date(v.completed_at).toLocaleString('fr-BE'):'')}</span>${v.pdf_file_id?`<button type="button" class="btn ghost" data-receipt="control-open" data-id="${v.pdf_file_id}">Ouvrir le bon de contrôle v${v.version}</button>`:'<span>Contrôle antérieur conservé ; aucun PDF n’avait été produit.</span>'}<details><summary>Originaux associés (${v.originals.length})</summary>${v.originals.map(f=>`<button type="button" class="btn ghost" data-receipt="original" data-id="${f.id}">${escape(f.name)}</button>`).join('')}</details></article>`).join('')||'<p>Aucun bon terminé. Créer ou enregistrer une fiche ne termine pas le contrôle.</p>'}</section>`;}
async function saveControl(){if(C.pendingPDF.current)throw Error('RECONCILIATION_REQUIRED');const S=H.S,data=structuredClone(S.data);if(data.received_at&&!/[zZ]|[+-]\d\d:\d\d$/.test(data.received_at))data.received_at=new Date(data.received_at).toISOString();return write('save',{id:S.doc.id,version:S.doc.revision,control:data});}
async function generate(replay=false){
 if(C.running||H.S.busy)return;C.running=true;H.render();const S=H.S,a=S.actor,d=S.dep,receipt=C.pendingPDF;let i;
 try{
 if(!replay){if(receipt.current)throw Error('RECONCILIATION_REQUIRED');if(!await stopflowDialogs.confirm('Valider ce contrôle humain et produire le bon PDF avec ses originaux en annexe ?'))return;if(S.dirty)await H.save();const id=uuid();i=receipt.begin('pdf',{department:d,id:S.doc.id,version:S.doc.revision,request_id:id},id);}else{i=receipt.current;if(!i)return;}
 H.status('Production et enregistrement du bon de contrôle… Les originaux restent inchangés.');
 const auth=await supabaseClient.auth.getSession();same(a,d);const token=auth.data?.session?.access_token;if(!token)throw Error('CONTROL_PDF_UNCONFIRMED');
 const response=await fetch('/api/receipt-control-pdf',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(i.payload),signal:AbortSignal.timeout(60000)});let out;try{out=await response.json();}catch{throw Error('CONTROL_PDF_UNCONFIRMED');}same(a,d);
 if(!response.ok){if(out.previous_attempt_obsolete===true){receipt.clear();H.status('Cette génération a été rendue obsolète par une correction. Relisez la fiche ; les saisies récentes restent disponibles.',true);return;}throw Object.assign(Error(out.status||'CONTROL_PDF_UNCONFIRMED'),out);}
 if(out.status!=='CONTROL_CONFIRMED')throw Error('CONTROL_PDF_UNCONFIRMED');const fresh=await H.api('read',{id:i.payload.id});same(a,d);const version=fresh.controls.find(v=>v.id===out.control_id&&v.status==='completed'&&v.pdf_file_id===out.pdf_file_id);if(!version)throw Error('CONTROL_PDF_UNCONFIRMED');
 receipt.clear();if(!S.dirty){H.currentData(fresh);localStorage.removeItem(H.key());}else{S.doc=fresh;H.touch();}await H.refreshList();H.status('Contrôle terminé — bon PDF v'+version.version+' enregistré et relu. Les originaux sont conservés.');
 }catch(e){if(i)receipt.fail(e);H.status(message(e),true);}finally{C.running=false;H.render();}
}
async function openPDF(id){const S=H.S,a=S.actor,d=S.dep,file=S.doc.files.find(f=>f.id===id&&f.purpose==='control_pdf');if(!file)return;const popup=window.open('about:blank','_blank');try{const blob=await privateBytes(file);same(a,d);const url=URL.createObjectURL(blob);C.objects.push(url);if(popup)popup.location.href=url;H.status('Bon PDF prêt : consultation ou téléchargement demandé.');const n=document.querySelector('#sf102Receipts [data-receipt-status]'),link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.download=file.name;link.textContent='Ouvrir / télécharger le bon de contrôle';n.append(link);}catch(e){popup?.close();throw e;}}
async function action(a,b){
 if(window.stopflowReceiptReading&&await window.stopflowReceiptReading.action(a,b))return true;
 if(a==='capture-new'||a==='new-delivery'||a==='new-invoice'){if(H.S.dirty){if(!await stopflowDialogs.confirm('Enregistrer le brouillon actuel avant un nouveau document ?'))return true;await H.save();}H.S.tab='receipt';C.picking=true;C.intakeKind=a==='new-invoice'?'invoice':'delivery';H.render();return true;}
 if(a==='capture-only'||a==='capture-start'||a==='capture-catalogue'||a==='capture-resume'){await execute(a==='capture-only'?'only':a==='capture-catalogue'?'catalogue':'start');return true;}
 if(a==='capture-cancel'){if(C.capture){if(C.capture.stage!=='selected'||H.S.intent.current)return true;await photo('delete',C.capture.blobKey);C.capture=null;storeCapture();}C.picking=false;H.render();return true;}
 if(a==='control-start'||a==='control-correct'){if(a==='control-correct'&&!await stopflowDialogs.confirm('Créer une correction ? Les contrôles et PDF précédents seront conservés.'))return true;const local=H.S.dirty?structuredClone(H.S.data):null;await write(a==='control-start'?'start':'correct',{id:H.S.doc.id,version:H.S.doc.revision});if(local){H.S.data=local;H.touch();}if(a==='control-correct'&&H.S.doc.reading&&window.stopflowReceiptReading)await window.stopflowReceiptReading.save();if(!H.S.data.lines?.length)H.S.data.lines=[window.stopflowReceiptsModel.line(H.S.dep)];H.render();return true;}
 if(a==='control-finish'){await generate();return true;}if(a==='control-retry'){await generate(true);return true;}if(a==='control-open'){await openPDF(b.dataset.id);return true;}
 return false;
}
function bind(h){H=h;return C;}
window.stopflowReceiptControl={host:()=>H,photo,privateBytes,bind,sync,select,execute,write,rpc,saveControl,action,intake,controls,message,state:C,hasPending:()=>Boolean(C.capture||C.pendingPDF?.current)};
})();
