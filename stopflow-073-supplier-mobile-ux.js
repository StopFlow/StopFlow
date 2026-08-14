/* StopFlow 0.7.3 — UX mobile fournisseurs + simplification en-tête + rafraîchissement Inventaire Salle. */
(function(){
  if(window.stopflow073SupplierMobileUx?.active)return;

  const MOBILE_QUERY='(max-width: 950px)';
  const state={observer:null,scheduled:false,lastSupplierSignature:'',inventoryVisible:false,inventoryLoading:false};
  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches===true;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const visiblePage=()=>document.querySelector('#app .page:not(.hidden)');
  const isSupplierPage=()=>visiblePage()?.id==='suppliers';

  function injectStyles(){
    if(document.getElementById('sf73SupplierMobileUxStyles'))return;
    const style=document.createElement('style');
    style.id='sf73SupplierMobileUxStyles';
    style.textContent=`
      #sf73SupplierMobileList{display:none}
      @media(max-width:950px){
        /* Quand la flèche retour est présente, la maison fait doublon. Le menu ☰ reste l'accès global explicite. */
        #sf52MobileHeader.sf73-has-back{grid-template-columns:42px 42px minmax(0,1fr)!important}
        #sf52MobileHeader.sf73-has-back #sf52HomeButton{display:none!important}

        /* La page Fournisseurs devient une vraie vue mobile, sans défilement horizontal. */
        #suppliers .tablewrap{display:none!important}
        #suppliers #addSupplier{width:100%;min-height:46px;margin-top:10px;touch-action:manipulation}
        #sf73SupplierMobileList{display:grid;gap:10px;margin-top:12px}
        .sf73-supplier-mobile-card{border:1px solid var(--line);border-radius:14px;background:#fff;padding:14px;box-shadow:0 5px 16px rgba(13,35,62,.05)}
        .sf73-supplier-mobile-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
        .sf73-supplier-mobile-head h3{margin:0 0 3px;font-size:16px;line-height:1.2}
        .sf73-supplier-mobile-description{font-size:12px;color:var(--muted);line-height:1.35}
        .sf73-supplier-mobile-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}
        .sf73-supplier-mobile-meta>div{padding:9px 10px;border-radius:10px;background:#f7f9fc;min-width:0}
        .sf73-supplier-mobile-meta small{display:block;color:var(--muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;margin-bottom:3px}
        .sf73-supplier-mobile-meta strong,.sf73-supplier-mobile-meta span{font-size:12px;overflow-wrap:anywhere}
        .sf73-supplier-mobile-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}
        .sf73-supplier-mobile-actions .btn{min-height:44px;width:100%;touch-action:manipulation}
        .sf73-supplier-mobile-empty{padding:15px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);background:#fff}

        /* Le + reste disponible sur la page Fournisseurs même si le menu contextuel 0.7.3 ne la connaît pas encore nativement. */
        body.sf73-supplier-admin-active #sf73MobileActionFab[hidden]{display:grid!important}

        /* Formulaire fournisseur : une seule colonne sur iPhone. */
        #modal.sf73-supplier-modal .modalbox{width:min(100%,620px)!important;max-height:calc(100vh - 22px)!important;max-height:calc(100dvh - 22px)!important;overflow:auto!important;-webkit-overflow-scrolling:touch}
        #modal.sf73-supplier-modal .filters{grid-template-columns:1fr!important}
        #modal.sf73-supplier-modal #saveSupplier{width:100%;min-height:46px}
        #modal.sf73-supplier-modal #closeModal{min-height:42px;touch-action:manipulation}
      }
    `;
    document.head.appendChild(style);
  }

  function suppressFollowupClick(node,run){
    if(!node||node.dataset.sf73SupplierTap==='1')return;
    node.dataset.sf73SupplierTap='1';
    let firedAt=0;
    const fire=event=>{
      if(event.type==='pointerup'&&event.button!=null&&event.button!==0)return;
      const now=Date.now();
      if(event.type==='click'&&now-firedAt<650){
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();return;
      }
      firedAt=now;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      run(event);
    };
    if(window.PointerEvent)node.addEventListener('pointerup',fire,true);
    else node.addEventListener('touchend',fire,{capture:true,passive:false});
    node.addEventListener('click',fire,true);
  }

  function bridgeExistingClick(node){
    if(!node||node.dataset.sf73SupplierBridge==='1')return;
    node.dataset.sf73SupplierBridge='1';
    let syntheticAt=0;
    if(window.PointerEvent){
      node.addEventListener('pointerup',event=>{
        if(event.button!=null&&event.button!==0)return;
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        syntheticAt=Date.now();
        node.click();
      },true);
    }else{
      node.addEventListener('touchend',event=>{
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        syntheticAt=Date.now();
        node.click();
      },{capture:true,passive:false});
    }
    node.addEventListener('click',event=>{
      if(event.isTrusted&&Date.now()-syntheticAt<650){
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      }
    },true);
  }

  function supplierList(){
    try{
      if(typeof ensureLocalSuppliers==='function')return ensureLocalSuppliers();
    }catch{}
    return Array.isArray(window.db?.suppliers)?window.db.suppliers:[];
  }

  function articleCount(supplier){
    const articles=Array.isArray(window.db?.articles)?window.db.articles:[];
    return articles.filter(article=>{
      const byId=supplier?.id&&String(article?.supplierId||'')===String(supplier.id);
      const byName=String(article?.supplier||'').trim().toLowerCase()===String(supplier?.name||'').trim().toLowerCase();
      return byId||byName;
    }).length;
  }

  function supplierKeyForAction(supplier){return String(supplier?.id||supplier?.code||supplier?.name||'')}
  function supplierFromKey(key){
    const list=supplierList();
    return list.find(item=>String(item?.id||item?.code||item?.name||'')===String(key))||null;
  }

  function openSupplierArticles(supplier){
    if(!supplier)return;
    if(typeof page==='function')page('articles');
    try{if(typeof fillSupplierSelect==='function')fillSupplierSelect(document.querySelector('#articleSupplier'),supplier.name)}catch{}
    const select=document.querySelector('#articleSupplier');
    if(select)select.value=supplier.name||'';
    try{if(typeof renderArticles==='function')renderArticles()}catch{}
    setTimeout(()=>window.stopflow070BackNavigation?.refresh?.(),0);
  }

  function enhanceSupplierModal(){
    const modal=document.getElementById('modal');
    if(!modal||!modal.querySelector('#supplierName'))return;
    modal.classList.add('sf73-supplier-modal');
    bridgeExistingClick(modal.querySelector('#saveSupplier'));
    bridgeExistingClick(modal.querySelector('#closeModal'));
  }

  function openSupplierModal(supplier){
    if(typeof supplierModal!=='function')return;
    supplierModal(supplier?supplier.id||supplier.code:undefined);
    setTimeout(enhanceSupplierModal,0);
  }

  function renderMobileSuppliers(force=false){
    if(!isMobile()||!isSupplierPage())return;
    const pageNode=document.getElementById('suppliers');
    const tablewrap=pageNode?.querySelector('.tablewrap');
    if(!pageNode||!tablewrap)return;

    let listNode=document.getElementById('sf73SupplierMobileList');
    if(!listNode){
      listNode=document.createElement('div');
      listNode.id='sf73SupplierMobileList';
      tablewrap.insertAdjacentElement('afterend',listNode);
    }

    const query=String(document.getElementById('supplierSearch')?.value||'').trim().toLowerCase();
    const suppliers=supplierList()
      .filter(item=>!query||JSON.stringify(item).toLowerCase().includes(query))
      .sort((a,b)=>(Number(a.sortOrder||0)-Number(b.sortOrder||0))||String(a.name||'').localeCompare(String(b.name||''),'fr'));
    const signature=JSON.stringify(suppliers.map(item=>[item.id,item.code,item.name,item.description,item.contactName,item.email,item.phone,item.active,item.sortOrder,articleCount(item)]))+`|${query}`;
    if(!force&&signature===state.lastSupplierSignature&&listNode.childElementCount)return;
    state.lastSupplierSignature=signature;

    listNode.innerHTML=suppliers.length?suppliers.map(supplier=>{
      const key=esc(supplierKeyForAction(supplier));
      const contact=[supplier.contactName,supplier.email,supplier.phone].filter(Boolean).map(esc).join('<br>')||'—';
      const count=articleCount(supplier);
      return `<article class="sf73-supplier-mobile-card">
        <div class="sf73-supplier-mobile-head">
          <div><h3>${esc(supplier.name||'Fournisseur')}</h3><div class="sf73-supplier-mobile-description">${esc(supplier.description||supplier.code||'')}</div></div>
          <span class="badge ${supplier.active?'validated':'cancelled'}">${supplier.active?'Actif':'Inactif'}</span>
        </div>
        <div class="sf73-supplier-mobile-meta">
          <div><small>Articles</small><strong>${count}</strong></div>
          <div><small>Contact</small><span>${contact}</span></div>
        </div>
        <div class="sf73-supplier-mobile-actions">
          <button type="button" class="btn secondary" data-sf73-supplier-articles="${key}">Articles</button>
          <button type="button" class="btn ghost" data-sf73-supplier-edit="${key}">Modifier</button>
        </div>
      </article>`;
    }).join(''):'<div class="sf73-supplier-mobile-empty">Aucun fournisseur trouvé.</div>';

    listNode.querySelectorAll('[data-sf73-supplier-articles]').forEach(button=>suppressFollowupClick(button,()=>openSupplierArticles(supplierFromKey(button.dataset.sf73SupplierArticles))));
    listNode.querySelectorAll('[data-sf73-supplier-edit]').forEach(button=>suppressFollowupClick(button,()=>openSupplierModal(supplierFromKey(button.dataset.sf73SupplierEdit))));

    const add=document.getElementById('addSupplier');
    if(add)suppressFollowupClick(add,()=>openSupplierModal(null));
  }

  function closeContextSheet(){
    window.stopflow073MobileActions?.close?.();
  }

  async function refreshSuppliers(){
    try{
      if(typeof loadSharedCatalog==='function')await loadSharedCatalog();
      if(typeof renderSuppliers==='function')renderSuppliers();
    }catch(error){console.warn('StopFlow 0.7.3 — actualisation fournisseurs',error)}
    state.lastSupplierSignature='';
    renderMobileSuppliers(true);
  }

  function openSupplierContextSheet(){
    if(!isMobile()||!isSupplierPage())return;
    const fab=document.getElementById('sf73MobileActionFab');
    const backdrop=document.getElementById('sf73MobileActionBackdrop');
    const sheet=document.getElementById('sf73MobileActionSheet');
    if(!fab||!backdrop||!sheet)return;
    const admin=typeof isAdmin==='function'?isAdmin():true;
    const actions=[
      ...(admin?[{id:'add',label:'Ajouter un fournisseur',primary:true}]:[]),
      {id:'refresh',label:'Actualiser les fournisseurs',primary:!admin}
    ];
    sheet.innerHTML=`
      <div class="sf73-mobile-sheet-grip"></div>
      <div class="sf73-mobile-sheet-head">
        <div><h3>Fournisseurs</h3><p>Actions de gestion de cette page</p></div>
        <button type="button" class="sf73-mobile-sheet-close" aria-label="Fermer">×</button>
      </div>
      <div class="sf73-mobile-actions">
        ${actions.map(action=>`<button type="button" class="sf73-mobile-action${action.primary?' primary':''}" data-sf73-supplier-context="${action.id}"><span>${esc(action.label)}</span><span>›</span></button>`).join('')}
      </div>`;
    fab.setAttribute('aria-expanded','true');
    backdrop.classList.add('open');
    sheet.classList.add('open');
    backdrop.style.opacity='1';backdrop.style.pointerEvents='auto';
    sheet.style.transform='translate3d(0,0,0)';sheet.style.webkitTransform='translate3d(0,0,0)';
    document.body.classList.add('sf73-mobile-actions-open');
    suppressFollowupClick(sheet.querySelector('.sf73-mobile-sheet-close'),closeContextSheet);
    sheet.querySelectorAll('[data-sf73-supplier-context]').forEach(button=>suppressFollowupClick(button,()=>{
      const action=button.dataset.sf73SupplierContext;
      closeContextSheet();
      if(action==='add')setTimeout(()=>openSupplierModal(null),30);
      if(action==='refresh')setTimeout(refreshSuppliers,30);
    }));
  }

  function interceptSupplierFab(){
    const eventName=window.PointerEvent?'pointerup':'touchend';
    document.addEventListener(eventName,event=>{
      const fab=event.target.closest?.('#sf73MobileActionFab');
      if(!fab||!isMobile()||!isSupplierPage())return;
      if(event.type==='pointerup'&&event.button!=null&&event.button!==0)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      openSupplierContextSheet();
    },{capture:true,passive:false});
    document.addEventListener('click',event=>{
      if(!isMobile()||!isSupplierPage()||!event.target.closest?.('#sf73MobileActionFab'))return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    },true);
  }

  async function refreshSalleInventoryData(){
    if(state.inventoryLoading)return;
    state.inventoryLoading=true;
    try{
      if(typeof loadSharedCatalog==='function')await loadSharedCatalog();
      window.stopflow073SalleInventoryFlow?.render?.();
      window.stopflow073MobileActions?.refresh?.();
    }catch(error){console.warn('StopFlow 0.7.3 — chargement fournisseurs Inventaire Salle',error)}
    finally{state.inventoryLoading=false}
  }

  function refresh(){
    injectStyles();
    const supplierPage=isSupplierPage();
    document.body.classList.toggle('sf73-supplier-admin-active',isMobile()&&supplierPage);
    if(supplierPage)renderMobileSuppliers();
    else state.lastSupplierSignature='';

    const inventoryPage=document.getElementById('sf73SalleInventory');
    const inventoryVisible=Boolean(inventoryPage&&!inventoryPage.classList.contains('hidden'));
    if(inventoryVisible&&!state.inventoryVisible)refreshSalleInventoryData();
    state.inventoryVisible=inventoryVisible;

    enhanceSupplierModal();
  }

  function scheduleRefresh(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{state.scheduled=false;refresh()});
  }

  function installObserver(){
    if(state.observer)return;
    const app=document.getElementById('app');
    if(!app)return;
    state.observer=new MutationObserver(scheduleRefresh);
    state.observer.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  }

  function install(){
    injectStyles();
    installObserver();
    interceptSupplierFab();
    document.addEventListener('input',event=>{if(event.target?.id==='supplierSearch'){state.lastSupplierSignature='';scheduleRefresh()}},true);
    window.addEventListener('resize',scheduleRefresh);
    scheduleRefresh();
    [100,350,800,1600,3000].forEach(delay=>setTimeout(()=>{installObserver();scheduleRefresh()},delay));
  }

  window.stopflow073SupplierMobileUx={active:true,state,render:()=>renderMobileSuppliers(true),refreshSuppliers,refreshSalleInventoryData};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
