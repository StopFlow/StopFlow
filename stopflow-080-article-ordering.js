/* StopFlow 0.8.0 — ordre partagé des articles, configurable dans Général > Articles. */
(function(){
  if(window.stopflow080ArticleOrdering?.active)return;

  const state={supplier:'',articles:[],gesture:null,saving:false};
  const isMobile=()=>window.matchMedia?.('(max-width: 760px)').matches===true;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nav=()=>window.stopflow070CardNavigation;
  const dataStore=()=>{try{return typeof db!=='undefined'?db:window.db}catch{return window.db}};
  const currentSession=()=>{try{return typeof session!=='undefined'?session:(window.session||{})}catch{return window.session||{}}};
  const isAdminUser=()=>typeof isAdmin==='function'?isAdmin():String(currentSession()?.role||'').toLowerCase()==='admin';

  function supplierRecord(name){
    try{if(typeof supplierByName==='function')return supplierByName(name)}catch{}
    try{return (dataStore()?.suppliers||[]).find(item=>String(item?.name||'')===String(name||''))||null}catch{return null}
  }

  function supplierScope(name){
    const supplier=supplierRecord(name);
    return String(supplier?.department||supplier?.departement||'').trim().toLowerCase();
  }

  function canManage(name){
    if(isAdminUser())return true;
    const scope=supplierScope(name);
    return ['cuisine','salle','nettoyage'].includes(scope)&&Boolean(nav()?.hasPermission?.('articles.manage',scope));
  }

  function injectStyles(){
    if(document.getElementById('stopflow080ArticleOrderingStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080ArticleOrderingStyles';
    style.textContent=`
      #sf80OrganizeArticles{white-space:nowrap}
      #sf80ArticleOrderModal{z-index:13400}
      #sf80ArticleOrderModal .modalbox{width:min(720px,100%);max-height:min(92vh,900px);display:flex;flex-direction:column;overflow:hidden}
      .sf80-order-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .sf80-order-help{margin:10px 0 12px;padding:10px 12px;border:1px solid #d7e5f8;border-radius:11px;background:#f4f8ff;color:#3e5f80;font-size:12px;line-height:1.45}
      .sf80-order-list{display:grid;gap:7px;min-height:0;overflow:auto;padding:2px 2px 10px;-webkit-overflow-scrolling:touch}
      .sf80-order-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:58px;padding:8px 9px;border:1px solid #dfe7f0;border-radius:12px;background:#fff;touch-action:pan-y;user-select:none}
      .sf80-order-row.sf80-dragging{position:relative;z-index:3;border-color:#8db2ee;background:#f7faff;box-shadow:0 12px 26px rgba(13,35,62,.15);opacity:.96}
      .sf80-order-handle{width:38px;height:38px;border:1px solid #d9e2ec;border-radius:9px;background:#f7f9fc;color:#53677d;font-size:20px;font-weight:900;cursor:grab;touch-action:none}
      .sf80-order-handle:active{cursor:grabbing}
      .sf80-order-name{min-width:0;font-weight:850;line-height:1.25;overflow-wrap:anywhere}
      .sf80-order-meta{display:block;margin-top:3px;color:#7a8798;font-size:10px;font-weight:650}
      .sf80-order-arrows{display:flex;gap:5px}
      .sf80-order-arrows button{width:38px;height:38px;min-height:38px;padding:0;border:1px solid #d9e2ec;border-radius:9px;background:#fff;color:#27425f;font-size:17px;font-weight:900}
      .sf80-order-footer{display:grid;grid-template-columns:1fr 1.35fr;gap:8px;padding-top:12px;border-top:1px solid #e4eaf1;background:#fff}
      .sf80-order-footer .btn{min-height:46px}
      @media(max-width:620px){
        #articles #sf80OrganizeArticles{width:100%!important;min-height:48px!important}
        #sf80ArticleOrderModal{padding:8px!important;align-items:flex-start!important}
        #sf80ArticleOrderModal .modalbox{max-height:calc(100dvh - 16px)!important;margin:0!important;padding:14px!important;border-radius:16px!important}
        .sf80-order-row{grid-template-columns:36px minmax(0,1fr) auto;gap:8px;padding:8px 7px;min-height:60px}
        .sf80-order-handle{width:34px;height:40px}
        .sf80-order-arrows{display:none}
        .sf80-order-footer{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function selectedSupplier(){return String(document.getElementById('articleSupplier')?.value||'').trim()}

  function ensureButton(){
    const select=document.getElementById('articleSupplier');
    const add=document.getElementById('addArticle');
    if(!select||!add)return;
    let button=document.getElementById('sf80OrganizeArticles');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.id='sf80OrganizeArticles';
      button.className='btn secondary';
      button.textContent='Organiser l’ordre';
      button.addEventListener('click',openModal);
      add.parentElement?.insertBefore(button,add);
    }
    button.classList.toggle('hidden',!canManage(selectedSupplier()));
  }

  function ensureModal(){
    let modal=document.getElementById('sf80ArticleOrderModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='sf80ArticleOrderModal';
    modal.className='modal hidden';
    modal.innerHTML=`<div class="modalbox"><div class="sf80-order-head"><div><h2>Ordre de l’inventaire</h2><p class="muted" id="sf80OrderSupplier"></p></div><button type="button" class="btn ghost" data-sf80-order-close>Fermer</button></div><div class="sf80-order-help" id="sf80OrderHelp"></div><div class="sf80-order-list" id="sf80ArticleOrderList"></div><div class="sf80-order-footer"><button type="button" class="btn ghost" data-sf80-order-close>Annuler</button><button type="button" class="btn primary" id="sf80ArticleOrderSave">Enregistrer l’ordre</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-sf80-order-close]').forEach(button=>button.addEventListener('click',closeModal));
    modal.querySelector('#sf80ArticleOrderSave').addEventListener('click',saveOrder);
    const list=modal.querySelector('#sf80ArticleOrderList');
    list.addEventListener('pointerdown',onPointerDown);
    list.addEventListener('pointermove',onPointerMove);
    list.addEventListener('pointerup',onPointerUp);
    list.addEventListener('pointercancel',onPointerCancel);
    return modal;
  }

  function sortedArticles(supplier){
    try{
      return (dataStore()?.articles||[]).filter(article=>String(article.supplier||'')===supplier).slice().sort((a,b)=>(Number(a.sortOrder||0)-Number(b.sortOrder||0))||String(a.name||'').localeCompare(String(b.name||''),'fr'));
    }catch{return []}
  }

  function renderList(){
    const list=document.getElementById('sf80ArticleOrderList');
    if(!list)return;
    list.innerHTML=state.articles.length?state.articles.map((article,index)=>`<div class="sf80-order-row" data-sf80-order-id="${esc(article.id)}"><button type="button" class="sf80-order-handle" aria-label="Déplacer ${esc(article.name)}">≡</button><div><div class="sf80-order-name">${index+1}. ${esc(article.name)}</div><span class="sf80-order-meta">${esc(article.category||'Sans catégorie')}${article.active===false?' · Inactif':''}</span></div><div class="sf80-order-arrows"><button type="button" data-sf80-move="-1" aria-label="Monter">↑</button><button type="button" data-sf80-move="1" aria-label="Descendre">↓</button></div></div>`).join(''):'<div class="notice">Aucun article à organiser pour ce fournisseur.</div>';
    list.querySelectorAll('[data-sf80-move]').forEach(button=>button.addEventListener('click',()=>{
      const row=button.closest('[data-sf80-order-id]');
      const index=state.articles.findIndex(article=>String(article.id)===String(row?.dataset.sf80OrderId));
      moveBy(index,Number(button.dataset.sf80Move||0));
    }));
  }

  function moveBy(index,delta){
    const next=index+delta;
    if(index<0||next<0||next>=state.articles.length)return;
    const [item]=state.articles.splice(index,1);state.articles.splice(next,0,item);renderList();
  }

  function openModal(){
    const supplier=selectedSupplier();
    if(!supplier||!canManage(supplier))return alert('Vous n’avez pas le droit de modifier l’ordre de ce fournisseur.');
    state.supplier=supplier;
    state.articles=sortedArticles(supplier);
    const modal=ensureModal();
    document.getElementById('sf80OrderSupplier').textContent=supplier;
    document.getElementById('sf80OrderHelp').textContent=isMobile()?'Maintenez la poignée ≡ d’un article environ une demi-seconde, puis faites-la glisser à la position souhaitée.':'Utilisez la poignée ≡ pour déplacer un article, ou les flèches ↑ ↓ pour ajuster précisément l’ordre.';
    renderList();
    modal.classList.remove('hidden');
  }

  function closeModal(){
    cancelGesture();
    document.getElementById('sf80ArticleOrderModal')?.classList.add('hidden');
  }

  function rowFromTarget(target){return target?.closest?.('[data-sf80-order-id]')||null}

  function cancelLongPress(){
    if(state.gesture?.timer){clearTimeout(state.gesture.timer);state.gesture.timer=null}
  }

  function activateDrag(){
    const g=state.gesture;if(!g||g.active)return;
    g.active=true;g.row.classList.add('sf80-dragging');
    try{document.getElementById('sf80ArticleOrderList')?.setPointerCapture(g.pointerId)}catch{}
  }

  function onPointerDown(event){
    if(event.button!=null&&event.button!==0)return;
    if(event.target.closest('[data-sf80-move]'))return;
    const row=rowFromTarget(event.target);if(!row)return;
    const touch=event.pointerType==='touch'||event.pointerType==='pen';
    if(!event.target.closest('.sf80-order-handle'))return;
    state.gesture={row,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,lastY:event.clientY,active:false,touch,timer:null};
    if(touch){state.gesture.timer=setTimeout(activateDrag,380)}else activateDrag();
  }

  function onPointerMove(event){
    const g=state.gesture;if(!g||g.pointerId!==event.pointerId)return;
    g.lastY=event.clientY;
    if(!g.active){
      if(Math.hypot(event.clientX-g.startX,event.clientY-g.startY)>9){cancelLongPress();state.gesture=null}
      return;
    }
    event.preventDefault();
    const list=document.getElementById('sf80ArticleOrderList');if(!list)return;
    const others=[...list.querySelectorAll('.sf80-order-row:not(.sf80-dragging)')];
    const before=others.find(row=>event.clientY<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2);
    if(before)list.insertBefore(g.row,before);else list.appendChild(g.row);
  }

  function syncStateFromDom(){
    const ids=[...document.querySelectorAll('#sf80ArticleOrderList [data-sf80-order-id]')].map(row=>String(row.dataset.sf80OrderId));
    const map=new Map(state.articles.map(article=>[String(article.id),article]));
    state.articles=ids.map(id=>map.get(id)).filter(Boolean);
  }

  function finishGesture(event){
    const g=state.gesture;if(!g||g.pointerId!==event.pointerId)return;
    cancelLongPress();
    if(g.active){event.preventDefault();g.row.classList.remove('sf80-dragging');syncStateFromDom();renderList()}
    state.gesture=null;
  }
  function onPointerUp(event){finishGesture(event)}
  function onPointerCancel(event){finishGesture(event)}
  function cancelGesture(){
    cancelLongPress();state.gesture?.row?.classList.remove('sf80-dragging');state.gesture=null;
  }

  async function saveOrder(){
    if(state.saving||!state.supplier||!canManage(state.supplier))return;
    const button=document.getElementById('sf80ArticleOrderSave');
    state.saving=true;if(button){button.disabled=true;button.textContent='Enregistrement…'}
    try{
      const assignments=state.articles.map((article,index)=>({article,sortOrder:(index+1)*10}));
      if(typeof isCloudMode==='function'&&isCloudMode()&&window.supabaseClient){
        const results=await Promise.all(assignments.map(({article,sortOrder})=>supabaseClient.from('articles').update({sort_order:sortOrder,updated_at:new Date().toISOString()}).eq('id',article.id)));
        const failed=results.find(result=>result.error);if(failed?.error)throw failed.error;
      }
      const store=dataStore();
      assignments.forEach(({article,sortOrder})=>{const memory=(store?.articles||[]).find(item=>Number(item.id)===Number(article.id));if(memory)memory.sortOrder=sortOrder});
      if(store?.articles)store.articles.sort((a,b)=>String(a.supplier||'').localeCompare(String(b.supplier||''),'fr')||(Number(a.sortOrder||0)-Number(b.sortOrder||0))||String(a.name||'').localeCompare(String(b.name||''),'fr'));
      try{if(typeof save==='function')save()}catch{}
      if(typeof loadSharedCatalog==='function'&&typeof isCloudMode==='function'&&isCloudMode())await loadSharedCatalog();
      const select=document.getElementById('articleSupplier');if(select)select.value=state.supplier;
      if(typeof renderArticles==='function')renderArticles();
      closeModal();
    }catch(error){
      console.warn('StopFlow 0.8.0 — ordre articles',error);
      alert(String(error?.message||'Impossible d’enregistrer le nouvel ordre.'));
    }finally{state.saving=false;if(button){button.disabled=false;button.textContent='Enregistrer l’ordre'}}
  }

  function enhance(){injectStyles();ensureButton()}

  if(typeof renderArticles==='function'&&!window.stopflow080ArticleOrderingRenderPatched){
    window.stopflow080ArticleOrderingRenderPatched=true;
    const original=renderArticles;
    window.renderArticles=function(){const result=original.apply(this,arguments);setTimeout(enhance,0);return result};
  }
  document.getElementById('articleSupplier')?.addEventListener('change',()=>setTimeout(enhance,0));
  window.stopflow080ArticleOrdering={active:true,version:'0.8.0',refresh:enhance};
  [0,150,500,1200,2500].forEach(delay=>setTimeout(enhance,delay));
})();
