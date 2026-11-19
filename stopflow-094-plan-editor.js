/* Shared physical-plan editor. RPCs, permissions and identities stay authoritative. */
(function(root){'use strict';
const copy=x=>structuredClone(x), fields=['x','y','width','height','rotation'];
const meta=t=>[t.label,t.capacity,t.shape,t.active], geo=e=>fields.map(k=>e[k]).concat(e.kind,JSON.stringify(Object.fromEntries(Object.entries(e.properties||{}).sort())));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const need=(ok,code='22023')=>{if(!ok)throw {code};};
let resizeCurrent=null;root.addEventListener?.('resize',()=>resizeCurrent?.());
function bounds(e,l){
 const w=Number(e.width),h=Number(e.height),a=Number(e.rotation)*Math.PI/180;
 const ex=(Math.abs(w*Math.cos(a))+Math.abs(h*Math.sin(a)))/2,ey=(Math.abs(w*Math.sin(a))+Math.abs(h*Math.cos(a)))/2;
 return {minX:Math.max(0,ex-w/2),minY:Math.max(0,ey-h/2),maxX:Math.min(l.width-w,l.width-w/2-ex),maxY:Math.min(l.height-h,l.height-h/2-ey)};
}
function constrain(e,l,x,y,snap=false){const b=bounds(e,l);need(b.maxX>=b.minX&&b.maxY>=b.minY);return {x:Math.max(b.minX,Math.min(b.maxX,snap?Math.round(x/10)*10:x)),y:Math.max(b.minY,Math.min(b.maxY,snap?Math.round(y/10)*10:y))};}
function reframe(e){const data=e.draft.data;e.placements=[];
 let offset=0;for(const room of data.rooms.filter(r=>r.active)){const l=data.layouts.find(l=>l.room_id===room.id&&l.status==='active');if(!l)continue;
  const f=root.stopflowServiceModel.frame(data.elements.filter(x=>x.layout_id===l.id)),width=Math.max(360,f.width+80),height=Math.max(300,f.height+80);
  e.placements.push({id:room.id,layout:l.id,originX:offset-f.x+(width-f.width)/2,originY:56-f.y+35,x:offset,width,height:height+56});offset+=width+36;}
 e.fit={x:-12,y:-12,width:Math.max(360,offset-12),height:Math.max(380,...e.placements.map(p=>p.height))+24};e.view=copy(e.fit);
}
function create(data,groups,identity){
 const draft={data:copy(data),groups:copy(groups)},base=copy(draft);
 const e={identity,base,draft,selected:'',selection:[],multi:false,pan:false,grid:true,snap:false,room:data.rooms.find(r=>r.active)?.id||'',dirty:false,busy:false,pending:null,message:'',error:false,add:false,groupId:'',groupName:'',groupActive:true,placements:[],view:null};
 reframe(e);return e;
}
function dirty(e){const semantic=s=>[s.data.tables.map(t=>[t.id,t.room_id,meta(t)]).sort(),s.data.elements.map(x=>[x.id,x.layout_id,x.table_id,geo(x)]).sort(),s.groups.map(g=>[g.id,g.room_id,g.name,g.active,[...g.table_ids].sort()]).sort()];return !eq(semantic(e.base),semantic(e.draft));}
function key(e){return 'sf94-plan:'+e.identity;}
function persist(e,storage){e.dirty=dirty(e);storage.setItem(key(e),JSON.stringify({...e,busy:false}));}
function restore(fresh,storage){const raw=storage.getItem(key(fresh));if(!raw)return fresh;const e=JSON.parse(raw);need(e.identity===fresh.identity&&e.base?.data&&e.draft?.data&&e.placements&&e.view,'DRAFT_INVALID');if(!dirty(e)&&!e.pending&&!e.groupEditing){storage.removeItem(key(fresh));return fresh;}e.busy=false;e.message=e.pending?'Un envoi reste à vérifier. Aucun nouvel envoi automatique.':'Brouillon local retrouvé.';return e;}
function select(e,id){const item=e.draft.data.elements.find(x=>x.id===id);if(!item)return;e.selected=id;e.room=item.room_id;
 if(e.multi&&item.table_id){e.selection=e.selection.includes(item.table_id)?e.selection.filter(x=>x!==item.table_id):[...e.selection,item.table_id];e.groupEditing=true;}
 else if(!e.multi)e.selection=item.table_id?[item.table_id]:[];}
function zoom(e,factor,anchor){const v=e.view,p=anchor||{x:v.x+v.width/2,y:v.y+v.height/2},w=Math.max(e.fit.width/5,Math.min(e.fit.width*3,v.width/factor)),r=w/v.width;e.view={x:p.x-(p.x-v.x)*r,y:p.y-(p.y-v.y)*r,width:w,height:v.height*r};}
const label=e=>e.properties?.label||({wall:'Mur',door:'Porte',plant:'Plante',bar:'Bar',label:'Cuisine'})[e.kind]||'Repère';
function tableList(e){return `<details class="sf94-tables"><summary>Tables du plan (${e.draft.data.tables.filter(t=>t.active).length})</summary>${e.draft.data.tables.filter(t=>t.active).map(t=>{const el=e.draft.data.elements.find(x=>x.table_id===t.id);return `<button type="button" class="sf94-table-choice" data-plan-action="select-item" data-id="${esc(el?.id||'')}" ${el?'':'disabled'}><strong>${esc(t.label)} · ${t.capacity} places</strong><span>${esc(e.draft.data.rooms.find(r=>r.id===t.room_id)?.name)}${el?.x==null?' · À placer':''}</span></button>`;}).join('')}</details>`;}
function add(e,kind,access,id){need(access.can_manage_layouts,'42501');const d=e.draft.data,l=d.layouts.find(l=>l.room_id===e.room&&l.status==='active');need(l);
 const shapes=['square','rectangle','round'],table=shapes.includes(kind);if(table)need(access.can_manage_tables,'42501');
 const selected=d.elements.find(x=>x.id===e.selected&&x.room_id===e.room),w=kind==='wall'?160:kind==='rectangle'?120:80,h=kind==='wall'?12:kind==='label'?60:80;
 const el={id,layout_id:l.id,room_id:e.room,establishment_id:l.establishment_id,table_id:null,kind:table?'table':kind,width:w,height:h,rotation:0,version:null,properties:table?{}:{label:({wall:'Mur',door:'Porte',plant:'Plante',bar:'Bar',label:'Cuisine'})[kind]}};
 Object.assign(el,constrain(el,l,selected?Number(selected.x)+30:140,selected?Number(selected.y)+30:150));
 if(table){let n=1;while(d.tables.some(t=>t.room_id===e.room&&t.label.toLocaleLowerCase()===String(n)))n++;
  el.table_id='new:'+id;d.tables.push({id:el.table_id,room_id:e.room,establishment_id:l.establishment_id,label:String(n),capacity:kind==='rectangle'?4:2,shape:kind,active:true,version:null});}
 d.elements.push(el);e.selected=id;e.selection=table?[el.table_id]:[];e.add=false;e.dirty=true;reframe(e);}
function properties(e){const d=e.draft.data,item=d.elements.find(x=>x.id===e.selected),t=d.tables.find(t=>t.id===item?.table_id),selected=e.selection.map(id=>d.tables.find(t=>t.id===id)).filter(Boolean);
 const input=(name,title,value,type='number',extra='')=>`<label>${title}<input class="input" data-plan-field="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
 return `<div class="sf94-property-head"><h3>${e.multi?'Jumelage':t?'Table '+esc(t.label):item?esc(label(item)):'Propriétés'}</h3><span>${item?esc(d.rooms.find(r=>r.id===item.room_id)?.name):'Touchez un objet du plan'}</span></div>${e.multi?`<p class="sf94-selection-summary">${selected.length} tables · ${selected.reduce((n,t)=>n+Number(t.capacity),0)} places</p><p>${selected.map(t=>esc(t.label)).join(' + ')||'Touchez au moins deux tables de la même salle.'}</p>${input('groupName','Nom du jumelage',e.groupName,'text','maxlength="120"')}<label class="sf94-check"><input type="checkbox" data-plan-field="groupActive" ${e.groupActive?'checked':''}>Actif</label><button type="button" data-plan-action="stage-group" class="btn">Ajouter au brouillon</button>`:item?`${t?`<fieldset ${e.access.can_manage_tables?'':'disabled'}>${input('label','Numéro / nom',t.label,'text','maxlength="80"')}${input('capacity','Couverts',t.capacity,'number','min="1" max="1000" step="1"')}<label>Forme<select class="input" data-plan-field="shape">${[['square','Carrée'],['rectangle','Rectangulaire'],['round','Ronde']].map(([v,n])=>`<option value="${v}" ${t.shape===v?'selected':''}>${n}</option>`).join('')}</select></label></fieldset>`:input('markLabel','Libellé',label(item),'text','maxlength="120"')}
 ${item.x==null?'<p>Cette table n’a pas de position.</p><button type="button" class="btn" data-plan-action="place">Placer au centre</button>':`<div class="sf94-numbers">${[['x','Position X'],['y','Position Y'],['width','Largeur'],['height','Hauteur'],['rotation','Orientation (°)']].map(([k,n])=>input(k,n,Math.round(Number(item[k])*100)/100,'number',k==='rotation'?'min="0" max="359.99" step="0.1"':k==='width'||k==='height'?'min="20" step="1"':'min="0" step="0.1"')).join('')}</div>`}${!t?'<button type="button" class="btn" data-plan-action="remove-mark">Retirer ce repère</button>':''}`:'<p>Déplacez une table ou un repère au doigt. Utilisez « Déplacer la vue » pour parcourir le plan.</p>'}
 ${tableList(e)}<section class="sf94-combinations"><h3>Combinaisons possibles</h3>${e.draft.groups.filter(g=>g.active).map(g=>`<button type="button" class="sf94-combo ${g.id===e.groupId?'selected':''}" data-plan-action="group" data-id="${esc(g.id)}"><strong>${esc(g.name)}</strong><span>${g.table_ids.map(id=>esc(d.tables.find(t=>t.id===id)?.label)).join(' + ')} · ${g.table_ids.reduce((n,id)=>n+Number(d.tables.find(t=>t.id===id)?.capacity||0),0)} places</span></button>`).join('')||'<p>Aucun jumelage.</p>'}<p class="sf94-help">Une table peut appartenir à plusieurs combinaisons. Les disponibilités restent contrôlées par table physique.</p></section>`;
}
function svg(e){let html='';const d=e.draft.data;
 for(const p of e.placements){const room=d.rooms.find(r=>r.id===p.id);html+=`<g><rect class="sf94-zone" x="${p.x}" y="0" width="${p.width}" height="${p.height}" rx="18"/><text class="sf94-zone-name" x="${p.x+20}" y="30">${esc(room.name)}</text><g transform="translate(${p.originX} ${p.originY})">`;
  for(const el of d.elements.filter(el=>el.room_id===p.id&&el.x!=null&&el.y!=null)){
   const t=d.tables.find(t=>t.id===el.table_id);if(el.table_id&&(!t||!t.active))continue;
   const w=Number(el.width),h=Number(el.height),selected=el.id===e.selected||e.selection.includes(el.table_id);let seats='';
   if(t)for(let i=0;i<Math.min(16,t.capacity);i++){const a=(i+.5)*Math.PI*2/Math.min(16,t.capacity);seats+=`<circle class="sf94-chair" cx="${w/2+Math.cos(a)*(w/2+8)}" cy="${h/2+Math.sin(a)*(h/2+8)}" r="8"/>`;}
   html+=`<g data-plan-item="${esc(el.id)}" role="button" tabindex="0" aria-label="${esc(t?'Table '+t.label+', '+t.capacity+' places':label(el))}" aria-pressed="${selected}" class="sf94-object ${t?'table':esc(el.kind)} ${selected?'selected':''}" transform="translate(${el.x} ${el.y}) rotate(${el.rotation} ${w/2} ${h/2})">${seats}${t?.shape==='round'?`<ellipse class="sf94-surface" cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}"/>`:`<rect class="sf94-surface" width="${w}" height="${h}" rx="${t?9:el.kind==='plant'?h/2:4}"/>`}<text class="sf94-object-name" x="${w/2}" y="${h/2+(t?-2:5)}" text-anchor="middle">${esc(t?t.label:label(el))}</text>${t?`<text class="sf94-seats" x="${w/2}" y="${h/2+19}" text-anchor="middle">${t.capacity} places</text>`:''}</g>`;
  }html+='</g></g>';}
 const v=e.view;return `<svg data-plan-svg viewBox="${v.x} ${v.y} ${v.width} ${v.height}" aria-label="Plan à éditer — toutes les salles" preserveAspectRatio="xMidYMid meet"><defs><pattern id="sf94Grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#d4e0ea" stroke-width=".6"/></pattern></defs>${e.grid?`<rect x="${e.fit.x-2000}" y="${e.fit.y-2000}" width="${e.fit.width+4000}" height="${e.fit.height+4000}" fill="url(#sf94Grid)"/>`:''}${html}</svg>`;
}
function html(e,access){e.access=access;return `<section class="sf94-editor" aria-label="Éditeur du plan"><header class="sf94-toolbar"><div><h2>Éditeur du plan</h2><span class="sf94-state" role="status">${e.pending?'Envoi à vérifier':(dirty(e)||e.groupEditing)?'Modifications non enregistrées':'Plan enregistré'}</span></div><div class="sf94-edit-actions"><button type="button" class="btn" data-plan-action="add">＋ Ajouter</button><button type="button" class="btn" data-plan-action="multi" aria-pressed="${e.multi}">Jumelage</button><button type="button" class="btn primary" data-plan-action="save" ${e.busy||e.pending||(!dirty(e)&&!e.groupEditing)?'disabled':''}>Enregistrer le plan</button><button type="button" class="btn" data-plan-action="cancel" ${e.busy||e.pending?'disabled':''}>Annuler / Retour</button></div></header>
 <p class="sf94-message ${e.error?'error':''}" role="${e.error?'alert':'status'}">${esc(e.message)}</p>${e.pending?'<button class="btn" type="button" data-plan-action="reconcile">Vérifier le dernier envoi</button>':''}
 ${e.add?`<section class="sf94-add" aria-label="Ajouter au plan"><label>Salle<select class="input" data-plan-field="room">${e.draft.data.rooms.filter(r=>r.active).map(r=>`<option value="${esc(r.id)}" ${e.room===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><div>${[['square','▣ Carrée'],['rectangle','▰ Rectangulaire'],['round','● Ronde'],['wall','━ Mur'],['door','◩ Porte'],['plant','✿ Plante'],['bar','▰ Bar'],['label','♨ Cuisine']].filter(([k])=>access.can_manage_tables||!['square','rectangle','round'].includes(k)).map(([k,n])=>`<button type="button" class="btn" data-plan-action="add-item" data-id="${k}">${n}</button>`).join('')}</div></section>`:''}
 <div class="sf94-workspace"><div class="sf94-canvas"><div class="sf94-view-controls"><button type="button" class="btn" data-plan-action="zoom-out" aria-label="Réduire le zoom">−</button><button type="button" class="btn" data-plan-action="zoom-in" aria-label="Agrandir le zoom">＋</button><button type="button" class="btn" data-plan-action="center">Recentrer</button><button type="button" class="btn" data-plan-action="pan" aria-pressed="${e.pan}">✥ Déplacer la vue</button><label class="sf94-check"><input type="checkbox" data-plan-field="snap" ${e.snap?'checked':''}>Aligner</label></div><div class="sf94-viewport ${e.pan?'panning':''}" data-plan-viewport>${svg(e)}</div><p class="sf94-help">Un doigt : objet · fond : déplacer la vue · deux doigts : zoom et déplacement</p></div><aside class="sf94-properties"><fieldset ${e.busy||e.pending?'disabled':''}>${properties(e)}</fieldset></aside></div></section>`;}
function field(e,name,value){const el=e.draft.data.elements.find(x=>x.id===e.selected),t=e.draft.data.tables.find(t=>t.id===el?.table_id);
 if(['room','snap','grid'].includes(name)){e[name]=value;return;}
 if(['groupName','groupActive'].includes(name)){e[name]=value;e.groupEditing=true;return;}
 if(['label','capacity','shape'].includes(name)){need(t&&e.access.can_manage_tables,'42501');t[name]=name==='capacity'?Number(value):value;}
 else if(name==='markLabel'){need(el&&!t);el.properties={...el.properties,label:value};}
 else if(fields.includes(name)){need(el);const n=Number(value);need(Number.isFinite(n));el[name]=n;}
 e.dirty=dirty(e);
}
function stageGroup(e,id){const tables=e.draft.data.tables,ids=[...new Set(e.selection)];need(ids.length>=2&&ids.length<=20&&ids.every(i=>tables.some(t=>t.id===i&&t.active))&&new Set(ids.map(i=>tables.find(t=>t.id===i).room_id)).size===1&&e.groupName.trim());
 const old=e.draft.groups.find(g=>g.id===e.groupId),g={...(old||{id,version:null,establishment_id:e.draft.data.layouts[0]?.establishment_id}),room_id:tables.find(t=>t.id===ids[0]).room_id,name:e.groupName.trim(),table_ids:ids,active:e.groupActive};
 e.draft.groups=e.draft.groups.filter(x=>x.id!==g.id);e.draft.groups.push(g);e.groupId=g.id;e.groupEditing=false;e.dirty=dirty(e);}
function bind(node,e,options){const viewport=node.querySelector('[data-plan-viewport]'),svgNode=node.querySelector('[data-plan-svg]');if(!viewport||!svgNode)return;
 resizeCurrent=()=>{const w=node.querySelector('.sf94-workspace');if(w?.getBoundingClientRect&&node.style)node.style.setProperty('--sf94-height',Math.max(280,root.innerHeight-w.getBoundingClientRect().top-18)+'px');};root.requestAnimationFrame?.(resizeCurrent);
 const persistNow=()=>{try{persist(e,options.storage);}catch{e.error=true;e.message='Brouillon local non enregistrable. Aucun envoi effectué.';}};
 const redraw=()=>{persistNow();options.render();};
 const propertiesOnly=()=>{const p=node.querySelector('.sf94-properties fieldset');if(p)p.innerHTML=properties(e);
  node.querySelectorAll('[data-plan-item]').forEach(n=>{const item=e.draft.data.elements.find(x=>x.id===n.dataset.planItem),on=item.id===e.selected||e.selection.includes(item.table_id);n.classList.toggle('selected',on);n.setAttribute('aria-pressed',String(on));});};
 const paint=()=>{svgNode.setAttribute('viewBox',`${e.view.x} ${e.view.y} ${e.view.width} ${e.view.height}`);for(const n of node.querySelectorAll('[data-plan-item]')){const x=e.draft.data.elements.find(x=>x.id===n.dataset.planItem);n.setAttribute('transform',`translate(${x.x} ${x.y}) rotate(${x.rotation} ${x.width/2} ${x.height/2})`);}};
 let points=new Map(),gesture=null,ignoreClick=false;
 const xy=(ev,m)=>({x:m.a*ev.clientX+m.c*ev.clientY+m.e,y:m.b*ev.clientX+m.d*ev.clientY+m.f});
 const frozen=()=>{const m=svgNode.getScreenCTM()?.inverse();need(m,'VIEW_UNCONFIRMED');return {a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f};};
 viewport.onpointerdown=ev=>{if(e.busy||e.pending||!e.access.can_manage_layouts||ev.button>0)return;ev.preventDefault();viewport.setPointerCapture(ev.pointerId);points.set(ev.pointerId,{clientX:ev.clientX,clientY:ev.clientY});
  const target=ev.target.closest?.('[data-plan-item]');
  if(points.size===1){if(target){select(e,target.dataset.planItem);propertiesOnly();}const el=target&&e.draft.data.elements.find(x=>x.id===target.dataset.planItem);
   gesture={matrix:frozen(),view:copy(e.view),start:{clientX:ev.clientX,clientY:ev.clientY},element:el&&!e.pan&&!e.multi?el:null,original:el?{x:el.x,y:el.y}:null,camera:e.pan||!el,moved:false};}
  else if(points.size===2){if(gesture?.element)Object.assign(gesture.element,gesture.original);const p=[...points.values()];gesture={matrix:frozen(),view:copy(e.view),camera:true,pinch:true,startMid:{clientX:(p[0].clientX+p[1].clientX)/2,clientY:(p[0].clientY+p[1].clientY)/2},distance:Math.hypot(p[1].clientX-p[0].clientX,p[1].clientY-p[0].clientY)};paint();}
 };
 viewport.onpointermove=ev=>{if(!points.has(ev.pointerId)||!gesture)return;ev.preventDefault();points.set(ev.pointerId,{clientX:ev.clientX,clientY:ev.clientY});const g=gesture;
  if(g.pinch){if(points.size!==2)return;const ps=[...points.values()],mid={clientX:(ps[0].clientX+ps[1].clientX)/2,clientY:(ps[0].clientY+ps[1].clientY)/2},ratio=Math.max(.2,Math.min(5,Math.hypot(ps[1].clientX-ps[0].clientX,ps[1].clientY-ps[0].clientY)/Math.max(1,g.distance))),start=xy(g.startMid,g.matrix),now=xy(mid,g.matrix),w=g.view.width/ratio,h=g.view.height/ratio;e.view={x:start.x-(now.x-g.view.x)/ratio,y:start.y-(now.y-g.view.y)/ratio,width:w,height:h};}
  else {const a=xy(g.start,g.matrix),b=xy(ev,g.matrix),dx=b.x-a.x,dy=b.y-a.y;if(Math.hypot(ev.clientX-g.start.clientX,ev.clientY-g.start.clientY)>4)g.moved=true;
   if(g.element&&g.moved){const el=g.element,l=e.draft.data.layouts.find(l=>l.id===el.layout_id),p=e.placements.find(p=>p.id===el.room_id),b=bounds(el,l),ex=Math.abs(el.width*Math.cos(el.rotation*Math.PI/180))/2+Math.abs(el.height*Math.sin(el.rotation*Math.PI/180))/2,ey=Math.abs(el.width*Math.sin(el.rotation*Math.PI/180))/2+Math.abs(el.height*Math.cos(el.rotation*Math.PI/180))/2;
    const candidate=constrain(el,l,Number(g.original.x)+dx,Number(g.original.y)+dy,e.snap);
    candidate.x=Math.max(Math.max(b.minX,p.x+14-p.originX+ex-el.width/2),Math.min(Math.min(b.maxX,p.x+p.width-14-p.originX-ex-el.width/2),candidate.x));
    candidate.y=Math.max(Math.max(b.minY,50-p.originY+ey-el.height/2),Math.min(Math.min(b.maxY,p.height-14-p.originY-ey-el.height/2),candidate.y));Object.assign(el,candidate);}
   else if(g.camera)e.view={...g.view,x:g.view.x-dx,y:g.view.y-dy};}paint();
 };
 const end=ev=>{if(!points.has(ev.pointerId))return;const g=gesture;points.delete(ev.pointerId);if(ev.type==='pointercancel'&&g?.element)Object.assign(g.element,g.original);ignoreClick=Boolean(g?.moved||g?.pinch||e.multi);if(points.size)return;gesture=null;e.dirty=dirty(e);redraw();};
 viewport.onpointerup=end;viewport.onpointercancel=end;viewport.onlostpointercapture=ev=>{if(points.has(ev.pointerId))end({...ev,type:'pointercancel',pointerId:ev.pointerId});};
 viewport.onclick=ev=>{ev.stopPropagation();if(ignoreClick){ignoreClick=false;return;}};
 viewport.onkeydown=ev=>{const id=ev.target.dataset.planItem;if(id&&['Enter',' '].includes(ev.key)){ev.preventDefault();select(e,id);redraw();}};
 node.querySelector('.sf94-editor').onclick=ev=>{const b=ev.target.closest?.('[data-plan-action]');if(!b)return;ev.preventDefault();ev.stopPropagation();if(e.busy)return;const a=b.dataset.planAction;
  try{if(a==='save'){void options.save();return;}if(a==='reconcile'){void options.reconcile();return;}if(a==='cancel'){options.cancel();return;}if(e.pending)return;
   if(a==='add')e.add=!e.add;if(a==='add-item')add(e,b.dataset.id,e.access,options.uuid());if(a==='multi'){e.multi=!e.multi;e.groupEditing=false;e.groupId='';e.groupName='';e.selection=[];}
   if(a==='pan')e.pan=!e.pan;if(a==='zoom-in')zoom(e,1.25);if(a==='zoom-out')zoom(e,.8);if(a==='center')reframe(e);
   if(a==='stage-group')stageGroup(e,options.uuid());if(a==='select-item')select(e,b.dataset.id);
   if(a==='group'){const g=e.draft.groups.find(x=>x.id===b.dataset.id);e.multi=true;e.groupId=g.id;e.room=g.room_id;e.groupName=g.name;e.groupActive=g.active;e.selection=[...g.table_ids];e.selected='';}
   if(a==='place'){const x=e.draft.data.elements.find(x=>x.id===e.selected),l=e.draft.data.layouts.find(l=>l.id===x.layout_id);Object.assign(x,constrain(x,l,150,150));}
   if(a==='remove-mark'){const x=e.draft.data.elements.find(x=>x.id===e.selected);if(x&&!x.table_id){e.draft.data.elements=e.draft.data.elements.filter(z=>z.id!==x.id);e.selected='';}}
   redraw();}catch(err){e.error=true;e.message=options.error(err);options.render();}};
 node.querySelector('.sf94-editor').oninput=ev=>{const n=ev.target.dataset.planField;if(!n||e.busy||e.pending)return;try{field(e,n,ev.target.type==='checkbox'?ev.target.checked:ev.target.value);persistNow();const state=node.querySelector('.sf94-state');if(state)state.textContent=dirty(e)||e.groupEditing?'Modifications non enregistrées':'Plan enregistré';const save=node.querySelector('[data-plan-action="save"]');if(save)save.disabled=false;}catch(err){e.error=true;e.message=options.error(err);}};
 node.querySelector('.sf94-editor').onchange=ev=>{if(ev.target.dataset.planField){node.querySelector('.sf94-editor').oninput(ev);if(fields.includes(ev.target.dataset.planField))reframe(e);redraw();}};
}
function planArgs(e,room){const d=e.draft.data,l=e.base.data.layouts.find(l=>l.room_id===room&&l.status==='active');need(l);
 return {p_est:l.establishment_id,p_room:room,p_layout:l.id,p_version:l.version,p_tables:d.tables.filter(t=>t.active&&t.room_id===room).map(t=>{const x=d.elements.find(x=>x.table_id===t.id&&x.layout_id===l.id),b=e.base.data.elements.find(x=>x.table_id===t.id&&x.layout_id===l.id);need(x&&b&&x.x!=null&&x.y!=null);const limits=bounds(x,l);need(fields.every(k=>Number.isFinite(Number(x[k])))&&x.width>=20&&x.height>=20&&x.rotation>=0&&x.rotation<360&&x.x>=limits.minX-1e-6&&x.x<=limits.maxX+1e-6&&x.y>=limits.minY-1e-6&&x.y<=limits.maxY+1e-6);return {element_id:b.id,table_id:t.id,expected_version:b.version,...Object.fromEntries(fields.map(k=>[k,Number(x[k])]))};}),p_marks:d.elements.filter(x=>x.layout_id===l.id&&!x.table_id).map(x=>{need(x.x>=0&&x.y>=0&&x.width>0&&x.height>0&&x.x+x.width<=l.width&&x.y+x.height<=l.height&&x.rotation>=0&&x.rotation<360);return copy(x);})};}
function next(e){const d=e.draft,b=e.base;
 for(const t of d.data.tables){const old=b.data.tables.find(x=>x.id===t.id);if(!old||!eq(meta(t),meta(old))){need(e.access.can_manage_tables,'42501');need(t.label.trim()&&Number.isInteger(t.capacity)&&t.capacity>0&&t.capacity<=1000&&['round','square','rectangle'].includes(t.shape));const l=b.data.layouts.find(l=>l.room_id===t.room_id&&l.status==='active');return {kind:'table',localId:t.id,layout:l.id,layoutVersion:l.version,name:'reservations_save_table',args:{p_establishment_id:l.establishment_id,p_room_id:t.room_id,p_id:old?t.id:null,p_expected_version:old?old.version:null,p_label:t.label.trim(),p_capacity:t.capacity,p_shape:t.shape,p_active:t.active}};}}
 for(const l of b.data.layouts){const before=b.data.elements.filter(x=>x.layout_id===l.id).map(x=>[x.id,geo(x)]),after=d.data.elements.filter(x=>x.layout_id===l.id).map(x=>[x.id,geo(x)]);if(!eq(before,after))return {kind:'plan',name:'reservations_service_plan_save',args:planArgs(e,l.room_id)};}
 for(const g of d.groups){const old=b.groups.find(x=>x.id===g.id),val=g=>[g.name,g.room_id,g.active,[...g.table_ids].sort()];if(!old||!eq(val(g),val(old)))return {kind:'group',name:'reservations_service_group_save',args:{p_est:g.establishment_id,p_room:g.room_id,p_id:g.id,p_version:old?.version??null,p_name:g.name,p_tables:g.table_ids,p_active:g.active}};}
 return null;
}
function accept(e,step,fresh,groups){const a=step.args,d=e.draft.data,b=e.base.data;
 if(step.kind==='table'){const id=step.result?.id||a.p_id;need(id,'CREATE_RESULT_UNKNOWN');const t=fresh.tables.find(x=>x.id===id),l=fresh.layouts.find(x=>x.id===step.layout);need(t&&eq(meta(t),[a.p_label,a.p_capacity,a.p_shape,a.p_active])&&t.room_id===a.p_room_id&&t.version===(a.p_expected_version==null?1:a.p_expected_version+1)&&l?.version===step.layoutVersion+1,'40001');
  const item=d.tables.find(t=>t.id===step.localId),el=d.elements.find(x=>x.table_id===step.localId),actual=fresh.elements.find(x=>x.table_id===id&&x.layout_id===l.id);need(actual,'40001');
  for(const existing of b.elements.filter(x=>x.layout_id===l.id)){const row=fresh.elements.find(x=>x.id===existing.id);need(row&&eq(geo(row),geo(existing))&&row.version===existing.version,'40001');}
  const oldId=item.id,oldElementId=el?.id;Object.assign(item,t);if(el){el.table_id=id;el.id=actual.id;el.version=actual.version;}
  for(const g of e.draft.groups)g.table_ids=g.table_ids.map(x=>x===oldId?id:x);e.selection=e.selection.map(x=>x===oldId?id:x);if(e.selected===oldElementId)e.selected=actual.id;
  b.tables=b.tables.filter(x=>x.id!==id);b.tables.push(copy(t));b.elements=b.elements.filter(x=>x.id!==actual.id);b.elements.push(copy(actual));Object.assign(b.layouts.find(x=>x.id===l.id),l);
 }else if(step.kind==='plan'){const l=fresh.layouts.find(x=>x.id===a.p_layout);need(l?.version===a.p_version+1,'40001');
  for(const t of a.p_tables){const x=fresh.elements.find(x=>x.id===t.element_id);need(x&&x.version===t.expected_version+1&&fields.every(k=>Number(x[k])===Number(t[k])),'40001');}
  const marks=fresh.elements.filter(x=>x.layout_id===a.p_layout&&!x.table_id);need(marks.length===a.p_marks.length&&a.p_marks.every(m=>marks.some(x=>x.id===m.id&&eq(geo(x),geo(m)))),'40001');
  b.elements=b.elements.filter(x=>x.layout_id!==l.id).concat(copy(fresh.elements.filter(x=>x.layout_id===l.id)));d.elements=d.elements.filter(x=>x.layout_id!==l.id).concat(copy(fresh.elements.filter(x=>x.layout_id===l.id)));Object.assign(b.layouts.find(x=>x.id===l.id),l);Object.assign(d.layouts.find(x=>x.id===l.id),l);
 }else{const g=groups.find(g=>g.id===a.p_id);need(g&&g.version===(a.p_version==null?1:a.p_version+1)&&g.room_id===a.p_room&&g.name===a.p_name&&g.active===a.p_active&&eq([...g.table_ids].sort(),[...a.p_tables].sort()),'40001');e.base.groups=e.base.groups.filter(x=>x.id!==g.id).concat(copy(g));e.draft.groups=e.draft.groups.filter(x=>x.id!==g.id).concat(copy(g));}
 e.pending=null;e.dirty=dirty(e);
}
function preflight(e,fresh,groups){for(const name of ['tables','layouts','elements'])for(const old of e.base.data[name]){const row=fresh[name].find(x=>x.id===old.id);need(row&&row.version===old.version,'40001');}for(const g of e.base.groups)need(groups.some(x=>x.id===g.id&&x.version===g.version),'40001');need(fresh.tables.length===e.base.data.tables.length&&fresh.elements.length===e.base.data.elements.length,'40001');}
function validate(e){const d=e.draft.data;
 for(const t of d.tables){const old=e.base.data.tables.find(x=>x.id===t.id);if(!old||!eq(meta(old),meta(t))){need(e.access.can_manage_tables,'42501');need(t.label.trim()&&t.label.trim().length<=80&&Number.isInteger(t.capacity)&&t.capacity>=1&&t.capacity<=1000&&['round','square','rectangle'].includes(t.shape));}}
 for(const l of d.layouts){const before=e.base.data.elements.filter(x=>x.layout_id===l.id).map(x=>[x.id,geo(x)]),after=d.elements.filter(x=>x.layout_id===l.id).map(x=>[x.id,geo(x)]);if(eq(before,after))continue;
  for(const t of d.tables.filter(t=>t.active&&t.room_id===l.room_id)){const el=d.elements.find(x=>x.table_id===t.id&&x.layout_id===l.id);need(el&&fields.every(k=>el[k]!=null&&Number.isFinite(Number(el[k]))));const b=bounds(el,l);need(el.width>=20&&el.height>=20&&el.rotation>=0&&el.rotation<360&&el.x>=b.minX-1e-6&&el.x<=b.maxX+1e-6&&el.y>=b.minY-1e-6&&el.y<=b.maxY+1e-6);}
  for(const m of d.elements.filter(x=>x.layout_id===l.id&&!x.table_id))need(fields.every(k=>Number.isFinite(Number(m[k])))&&m.x>=0&&m.y>=0&&m.width>0&&m.height>0&&m.x+m.width<=l.width&&m.y+m.height<=l.height&&m.rotation>=0&&m.rotation<360);
 }
 for(const g of e.draft.groups){need(g.name.trim()&&g.name.length<=120&&g.table_ids.length>=2&&g.table_ids.length<=20&&new Set(g.table_ids).size===g.table_ids.length);need(g.table_ids.every(id=>d.tables.some(t=>t.id===id&&t.active&&t.room_id===g.room_id)));}
}
async function reconcile(e,io){need(e.pending);const [data,groups]=await Promise.all([io.read(),io.groups()]);accept(e,e.pending,data,groups);persist(e,io.storage);io.changed(data,groups);return data;}
async function save(e,io){need(e.access.can_manage_layouts&&!e.busy&&!e.pending,'42501');e.busy=true;e.error=false;e.message='Enregistrement et relecture…';io.render();let confirmed=0;
 try{if(e.groupEditing)stageGroup(e,io.uuid());validate(e);const [fresh,groups]=await Promise.all([io.read(),io.groups()]);preflight(e,fresh,groups);
  for(let i=0;i<100;i++){const step=next(e);if(!step)break;persist(e,io.storage);e.pending=step;persist(e,io.storage);let ack=false;
   try{step.result=await io.rpc(step.name,step.args);ack=true;persist(e,io.storage);await reconcile(e,io);confirmed++;}
   catch(err){if(!ack&&['40001','42501','22023','23514','23505','22P02','23P01'].includes(err?.code)){e.pending=null;persist(e,io.storage);}throw err;}}
  need(!next(e),'SAVE_LIMIT');e.message='Plan enregistré et relu. Toutes les modifications sont confirmées.';e.error=false;
 }catch(err){e.error=true;e.message=(confirmed?'Certaines modifications sont enregistrées ; le reste reste en brouillon. ':'')+(e.pending?'Envoi non confirmé. Vérifiez son résultat avant toute nouvelle écriture. ':io.error(err));}
 finally{e.busy=false;e.dirty=dirty(e);try{persist(e,io.storage);}catch{e.error=true;e.message='Reçu local non enregistrable. Aucun nouvel envoi automatique.';}io.render();}
}
const api={create,restore,persist,dirty,select,add,field,stageGroup,zoom,bounds,constrain,html,bind,save,reconcile,next,accept,preflight,key};
if(typeof module==='object'&&module.exports)module.exports=api;else root.stopflowPlanEditor=api;
})(typeof window==='object'?window:globalThis);
