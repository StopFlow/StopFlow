/* StopFlow 0.7.3 — parcours Inventaire Salle direct et compatible permissions fonctionnelles. */
(function(){
  if(window.stopflow073SalleInventoryFlow?.active)return;

  const ZONE='salle';
  const PAGE_ID='sf73SalleInventory';
  const SCOPE_LABEL='Salle';
  let observer=null;
  let scheduled=false;
  let scopeLoading=false;
  let scopeLoaded=false;
  const supplierDepartments=new Map();

  const nav=()=>window.stopflow070CardNavigation;
  const esc=value=>String(value??'').replace(/[&<>'\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[char]));

  function allowed(){
    const navigation=nav();
    return Boolean(navigation?.hasPermission?.('inventory.use',ZONE));
  }

  function catalogSuppliers(){
    try{
      if(typeof ensureLocalSuppliers==='function')return ensureLocalSuppliers();
    }catch{}
    try{
      if(typeof db!=='undefined'&&Array.isArray(db.suppliers))return db.suppliers;
    }catch{}
    return [];
  }

  function catalogArticles(){
    try{
      if(typeof db!=='undefined'&&Array.isArray(db.articles))return db.articles;
    }catch{}
    return [];
  }

  function supplierDepartment(item){
    const direct=String(item?.department||'').trim().toLowerCase();
    if(direct)return direct;
    const id=String(item?.id||'');
    if(id&&supplierDepartments.has(id))return supplierDepartments.get(id);
    try{
      if(typeof isCloudMode==='function'&&!isCloudMode())return ZONE;
    }catch{}
    return '';
  }

  function suppliers(){
    return catalogSuppliers()
      .filter(item=>item?.active!==false&&supplierDepartment(item)===ZONE)
      .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr'));
  }

  function articleCount(supplier){
    return catalogArticles().filter(article=>{
      if(article?.active!==true)return false;
      return String(article.supplierId||'')===String(supplier.id||'')||String(article.supplier||'').toLowerCase()===String(supplier.name||'').toLowerCase();
    }).length;
  }

  async function refreshScopedCatalog(){
    if(scopeLoading)return;
    scopeLoading=true;
    render();
    try{
      if(typeof loadSharedCatalog==='function')await loadSharedCatalog();
      supplierDepartments.clear();

      let cloud=false;
      try{cloud=typeof isCloudMode==='function'&&isCloudMode()}catch{}
      if(cloud&&typeof supabaseClient!=='undefined'&&supabaseClient){
        const {data,error}=await supabaseClient
          .from('suppliers')
          .select('id,department')
          .eq('active',true);
        if(error)throw error;
        (data||[]).forEach(item=>{
          const id=String(item?.id||'');
          const department=String(item?.department||'').trim().toLowerCase();
          if(id&&department)supplierDepartments.set(id,department);
        });
      }else{
        catalogSuppliers().forEach(item=>{
          const id=String(item?.id||'');
          const department=String(item?.department||ZONE).trim().toLowerCase();
          if(id&&department)supplierDepartments.set(id,department);
        });
      }
      scopeLoaded=true;
    }catch(error){
      scopeLoaded=true;
      console.warn('StopFlow 0.7.3 — chargement du périmètre fournisseurs Salle',error);
    }finally{
      scopeLoading=false;
      if(document.querySelector(`#${PAGE_ID}:not(.hidden)`))render();
    }
  }

  function ensureStyles(){
    if(document.getElementById('sf73SalleInventoryStyles'))return;
    const style=document.createElement('style');
    style.id='sf73SalleInventoryStyles';
    style.textContent=`
      #${PAGE_ID}{max-width:1180px}
      .sf73-inventory-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:18px}
      .sf73-inventory-head h2{margin:0 0 5px;font-size:27px}
      .sf73-inventory-head p{margin:0}
      .sf73-inventory-count{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#edf3ff;color:#2457a7;font-size:12px;font-weight:800}
      .sf73-supplier-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,280px));gap:14px}
      .sf73-supplier-card{margin:0!important;padding:18px!important;display:flex;flex-direction:column;align-items:stretch;text-align:left;min-height:160px}
      .sf73-supplier-card h3{margin:0 0 6px;font-size:17px}
      .sf73-supplier-card .muted{flex:1;margin:0 0 14px!important}
      .sf73-supplier-card .btn{width:100%}
      .sf73-inventory-empty{padding:20px;border:1px dashed var(--line);border-radius:14px;background:#fff;color:var(--muted)}
      .sf73-inventory-native-back{display:inline-flex;align-items:center;border:0;background:transparent;color:var(--blue);font-weight:800;padding:4px 0 10px;margin:0 0 2px;cursor:pointer;touch-action:manipulation}
      @media(max-width:950px){
        .sf73-inventory-head h2{font-size:24px}
        .sf73-supplier-grid{grid-template-columns:1fr}
        #inventory>.sf73-inventory-native-back{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important}
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePage(){
    let pageNode=document.getElementById(PAGE_ID);
    if(pageNode)return pageNode;
    const main=document.querySelector('#app main.main');
    if(!main)return null;
    pageNode=document.createElement('section');
    pageNode.id=PAGE_ID;
    pageNode.className='page hidden';
    main.appendChild(pageNode);
    try{STOPFLOW_STABLE_PAGES.add(PAGE_ID)}catch{}
    return pageNode;
  }

  function setTitle(){
    const desktop=document.getElementById('pageTitle');
    const mobile=document.getElementById('sf52MobileTitle');
    if(desktop)desktop.textContent='Inventaire — Salle';
    if(mobile)mobile.textContent='Inventaire — Salle';
  }

  function ensureInventoryBack(){
    const inventory=document.getElementById('inventory');
    if(!inventory)return;
    let button=inventory.querySelector(':scope > .sf73-inventory-native-back');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='sf73-inventory-native-back';
      button.dataset.stopflowBack='salle-inventory';
      button.textContent='← Retour aux fournisseurs';
      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        open();
      });
      inventory.prepend(button);
    }
  }

  function startSupplier(supplier){
    if(!supplier||!allowed()||typeof newInventory!=='function')return;
    const S=window.SF54;
    if(S?.state)S.state.department=ZONE;
    try{if(window.current)current.department=ZONE}catch{}
    newInventory(supplier.name);
    try{
      current.department=ZONE;
      current.supplierId=supplier.id||null;
    }catch{}
    ensureInventoryBack();
    setTimeout(()=>window.stopflow070BackNavigation?.refresh?.(),0);
    setTimeout(()=>window.stopflow070BackNavigation?.refresh?.(),120);
  }

  function render(){
    ensureStyles();
    const pageNode=ensurePage();
    if(!pageNode)return;

    if(scopeLoading&&!scopeLoaded){
      pageNode.innerHTML=`
        <div class="sf73-inventory-head">
          <div><h2>Inventaire — ${SCOPE_LABEL}</h2><p class="muted">Chargement des fournisseurs de la Salle…</p></div>
          <span class="sf73-inventory-count">…</span>
        </div>
        <div class="sf73-inventory-empty">Chargement du catalogue…</div>`;
      return;
    }

    const list=suppliers();
    pageNode.innerHTML=`
      <div class="sf73-inventory-head">
        <div><h2>Inventaire — ${SCOPE_LABEL}</h2><p class="muted">Choisissez un fournisseur pour démarrer l’inventaire.</p></div>
        <span class="sf73-inventory-count">${list.length} fournisseur${list.length>1?'s':''}</span>
      </div>
      ${list.length?`<div class="sf73-supplier-grid">${list.map(supplier=>{
        const count=articleCount(supplier);
        return `<div class="card sf73-supplier-card">
          <h3>${esc(supplier.name||'Fournisseur')}</h3>
          <p class="muted">${count} article${count>1?'s':''} actif${count>1?'s':''}</p>
          <button type="button" class="btn primary" data-sf73-start-supplier="${esc(supplier.id||supplier.code||supplier.name||'')}" ${count?'':'disabled'}>${count?'Démarrer inventaire':'Aucun article actif'}</button>
        </div>`;
      }).join('')}</div>`:'<div class="sf73-inventory-empty">Aucun fournisseur actif n’est attribué à la Salle.</div>'}`;

    pageNode.querySelectorAll('[data-sf73-start-supplier]').forEach(button=>{
      button.addEventListener('click',()=>{
        const key=button.dataset.sf73StartSupplier||'';
        const supplier=list.find(item=>String(item.id||item.code||item.name||'')===key);
        startSupplier(supplier);
      });
    });
  }

  function open(){
    if(!allowed())return;
    const navigation=nav();
    if(navigation?.runtime){
      navigation.runtime.currentZone=ZONE;
      navigation.runtime.currentDetail='inventory-salle';
    }
    const S=window.SF54;
    if(S?.state)S.state.department=ZONE;
    ensurePage();
    scopeLoaded=false;
    scopeLoading=true;
    render();
    setTitle();
    if(typeof page==='function')page(PAGE_ID);
    setTimeout(setTitle,0);
    setTimeout(()=>window.stopflow070BackNavigation?.refresh?.(),40);
    scopeLoading=false;
    refreshScopedCatalog();
  }

  function patchInventoryCard(){
    const navigation=nav();
    if(!navigation||navigation.runtime?.currentZone!==ZONE)return;
    const button=document.querySelector('#sf70ZonePage .sf70-action-card[data-sf70-card="inventory.use"]');
    if(!button||button.dataset.sf73SalleInventory==='1')return;
    button.dataset.sf73SalleInventory='1';
    button.onclick=event=>{
      event?.preventDefault?.();
      open();
    };
  }

  function schedulePatch(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      patchInventoryCard();
    });
  }

  function installObserver(){
    if(observer)return;
    const app=document.getElementById('app');
    if(!app)return;
    observer=new MutationObserver(schedulePatch);
    observer.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  }

  window.stopflow073SalleInventoryFlow={active:true,open,render,startSupplier,refresh:refreshScopedCatalog};

  let attempts=0;
  const timer=setInterval(()=>{
    installObserver();
    patchInventoryCard();
    if(++attempts>=60)clearInterval(timer);
  },100);
  [0,250,700,1400,2600].forEach(delay=>setTimeout(()=>{installObserver();patchInventoryCard()},delay));
})();
