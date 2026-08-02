/* StopFlow — catalogue, fournisseurs et paramètres partagés avec Supabase.
   Les articles historiques restent figés dans les lignes des bons de commande. */

const STOPFLOW_FALLBACK_SUPPLIERS=[
  {id:null,code:"colruyt",name:"Colruyt",description:"Apéritifs & digestifs",contactName:"",email:"",phone:"",address:"",vatNumber:"",deliveryNotes:"",logoPath:"colruyt",active:true,sortOrder:10},
  {id:null,code:"leloup",name:"Leloup",description:"Vins maison en fûts & azote",contactName:"",email:"",phone:"",address:"",vatNumber:"",deliveryNotes:"",logoPath:"leloup",active:true,sortOrder:20}
];

const stopFlowSupplierCardTemplates=(()=>{
  const templates=new Map();
  document.querySelectorAll("[data-start-supplier]").forEach(button=>{
    const card=button.closest(".supplier");
    const mark=card?.querySelector(".supplier-mark");
    const key=String(button.dataset.startSupplier||"").trim().toLowerCase().replace(/\s+/g,"");
    if(key&&mark)templates.set(key,mark.outerHTML);
  });
  return templates;
})();

function catalogErrorMessage(error,fallback="Opération impossible sur le catalogue partagé."){
  const message=String(error?.message||error?.details||error?.hint||"").trim();
  if(!message)return fallback;
  if(message.includes("duplicate key")||message.includes("articles_supplier_name_key"))return "Un article portant ce nom existe déjà chez ce fournisseur.";
  if(message.includes("suppliers_code_key")||message.includes("suppliers_name_lower_idx"))return "Un fournisseur portant ce nom existe déjà.";
  if(message.includes("row-level security")||message.includes("permission denied"))return "Votre rôle ne permet pas cette modification.";
  return message;
}

function supplierText(value){
  return String(value??"").replace(/[&<>'"]/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[character]));
}

function supplierKey(value){
  return String(value||"").trim().toLowerCase().replace(/\s+/g,"");
}

function supplierCode(value){
  const code=String(value||"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,60);
  return code||"fournisseur";
}

function supplierInitials(value){
  return String(value||"F")
    .split(/\s+/)
    .filter(Boolean)
    .map(part=>part[0])
    .join("")
    .slice(0,3)
    .toUpperCase();
}

function normalizeSharedSupplier(row){
  return {
    id:row.id?String(row.id):null,
    code:String(row.code||""),
    name:String(row.name||""),
    description:String(row.description||""),
    contactName:String(row.contact_name||""),
    email:String(row.email||""),
    phone:String(row.phone||""),
    address:String(row.address||""),
    vatNumber:String(row.vat_number||""),
    deliveryNotes:String(row.delivery_notes||""),
    logoPath:String(row.logo_path||""),
    active:row.active===true,
    sortOrder:Number(row.sort_order||0)
  };
}

function normalizeSharedArticle(row){
  return {
    id:Number(row.id),
    name:String(row.name||""),
    supplier:String(row.supplier||""),
    supplierId:row.supplier_id?String(row.supplier_id):null,
    category:String(row.category||""),
    unit:String(row.unit||""),
    target:Math.max(0,Number(row.target||0)),
    active:row.active===true,
    sortOrder:Number(row.sort_order||0)
  };
}

function ensureLocalSuppliers(){
  if(!Array.isArray(db.suppliers)||!db.suppliers.length){
    const names=new Set((db.articles||[]).map(article=>String(article.supplier||"").trim()).filter(Boolean));
    db.suppliers=STOPFLOW_FALLBACK_SUPPLIERS.map(item=>({...item}));
    for(const name of names){
      if(!db.suppliers.some(item=>supplierKey(item.name)===supplierKey(name))){
        db.suppliers.push({id:null,code:supplierCode(name),name,description:"",contactName:"",email:"",phone:"",address:"",vatNumber:"",deliveryNotes:"",logoPath:"",active:true,sortOrder:db.suppliers.length*10+10});
      }
    }
    save();
  }
  return db.suppliers;
}

function supplierByName(name){
  return ensureLocalSuppliers().find(item=>supplierKey(item.name)===supplierKey(name))||null;
}

function supplierById(id){
  return ensureLocalSuppliers().find(item=>String(item.id||"")===String(id||""))||null;
}

function replaceArticleInMemory(article){
  const index=db.articles.findIndex(item=>Number(item.id)===Number(article.id));
  if(index>=0)db.articles[index]=article;
  else db.articles.push(article);
  db.articles.sort((a,b)=>String(a.supplier).localeCompare(String(b.supplier),"fr")||(Number(a.sortOrder||0)-Number(b.sortOrder||0))||String(a.name).localeCompare(String(b.name),"fr"));
  save();
  return article;
}

function replaceSupplierInMemory(supplier){
  ensureLocalSuppliers();
  const index=db.suppliers.findIndex(item=>String(item.id||item.code)===String(supplier.id||supplier.code));
  if(index>=0)db.suppliers[index]=supplier;
  else db.suppliers.push(supplier);
  db.suppliers.sort((a,b)=>(Number(a.sortOrder||0)-Number(b.sortOrder||0))||String(a.name).localeCompare(String(b.name),"fr"));
  save();
  return supplier;
}

async function loadSharedCatalog(){
  if(!isCloudMode()){
    ensureLocalSuppliers();
    renderSupplierInterface();
    return {articles:db.articles,suppliers:db.suppliers,settings:db.settings};
  }

  const [articlesResult,suppliersResult,settingsResult]=await Promise.all([
    supabaseClient.from("articles").select("id,name,supplier,supplier_id,category,unit,target,active,sort_order").order("supplier").order("sort_order").order("id"),
    supabaseClient.from("suppliers").select("id,code,name,description,contact_name,email,phone,address,vat_number,delivery_notes,logo_path,active,sort_order").order("sort_order").order("name"),
    supabaseClient.from("app_settings").select("id,establishment,manager,footer").eq("id",1).single()
  ]);

  if(articlesResult.error)throw articlesResult.error;
  if(suppliersResult.error)throw suppliersResult.error;
  if(settingsResult.error)throw settingsResult.error;

  db.articles=(articlesResult.data||[]).map(normalizeSharedArticle);
  db.suppliers=(suppliersResult.data||[]).map(normalizeSharedSupplier);
  db.settings={
    establishment:String(settingsResult.data?.establishment||"Brasserie L'Union"),
    manager:String(settingsResult.data?.manager||"Quentin Pollet"),
    footer:String(settingsResult.data?.footer||"Document préparé par StopFlow — Envoi au fournisseur à effectuer manuellement.")
  };
  save();
  renderSupplierInterface();
  return {articles:db.articles,suppliers:db.suppliers,settings:db.settings};
}

async function saveSharedArticle(article){
  const linkedSupplier=supplierById(article.supplierId)||supplierByName(article.supplier);
  const clean={
    name:String(article.name||"").trim(),
    supplier:String(linkedSupplier?.name||article.supplier||"").trim(),
    supplier_id:linkedSupplier?.id||null,
    category:String(article.category||"").trim(),
    unit:String(article.unit||"").trim(),
    target:Math.max(0,Number(article.target||0)),
    active:article.active!==false,
    sort_order:Number(article.sortOrder||0)
  };
  if(!clean.name)throw new Error("Nom obligatoire.");
  if(!clean.supplier)throw new Error("Fournisseur obligatoire.");

  if(!isCloudMode()){
    const localArticle={...clean,sortOrder:clean.sort_order,supplierId:clean.supplier_id,id:article.id||Date.now()};
    delete localArticle.sort_order;
    delete localArticle.supplier_id;
    return replaceArticleInMemory(localArticle);
  }

  let result;
  const selection="id,name,supplier,supplier_id,category,unit,target,active,sort_order";
  if(article.id){
    result=await supabaseClient.from("articles").update(clean).eq("id",article.id).select(selection).single();
  }else{
    result=await supabaseClient.from("articles").insert(clean).select(selection).single();
  }
  if(result.error)throw result.error;
  return replaceArticleInMemory(normalizeSharedArticle(result.data));
}

async function updateSharedArticle(id,changes){
  const article=db.articles.find(item=>Number(item.id)===Number(id));
  if(!article)throw new Error("Article introuvable.");
  return await saveSharedArticle({...article,...changes});
}

async function saveSharedSupplier(supplier){
  const clean={
    code:String(supplier.code||supplierCode(supplier.name)).trim().toLowerCase(),
    name:String(supplier.name||"").trim(),
    description:String(supplier.description||"").trim(),
    contact_name:String(supplier.contactName||"").trim(),
    email:String(supplier.email||"").trim().toLowerCase(),
    phone:String(supplier.phone||"").trim(),
    address:String(supplier.address||"").trim(),
    vat_number:String(supplier.vatNumber||"").trim(),
    delivery_notes:String(supplier.deliveryNotes||"").trim(),
    logo_path:String(supplier.logoPath||"").trim(),
    active:supplier.active!==false,
    sort_order:Math.max(0,Number(supplier.sortOrder||0))
  };
  if(!clean.name)throw new Error("Le nom du fournisseur est obligatoire.");

  if(!isCloudMode()){
    const previous=supplier.id?supplierById(supplier.id):supplierByName(supplier.name);
    const local=normalizeSharedSupplier({...clean,id:supplier.id||crypto.randomUUID()});
    if(previous&&previous.name!==local.name){
      db.articles.forEach(article=>{
        if(article.supplierId===previous.id||supplierKey(article.supplier)===supplierKey(previous.name))article.supplier=local.name;
      });
    }
    replaceSupplierInMemory(local);
    renderSupplierInterface();
    return local;
  }

  const selection="id,code,name,description,contact_name,email,phone,address,vat_number,delivery_notes,logo_path,active,sort_order";
  let result;
  if(supplier.id){
    const updatePayload={...clean};
    delete updatePayload.code;
    result=await supabaseClient.from("suppliers").update(updatePayload).eq("id",supplier.id).select(selection).single();
  }else{
    result=await supabaseClient.from("suppliers").insert(clean).select(selection).single();
  }
  if(result.error)throw result.error;
  const saved=replaceSupplierInMemory(normalizeSharedSupplier(result.data));
  await loadSharedCatalog();
  return saved;
}

async function saveSharedSettings(settings){
  const clean={
    establishment:String(settings.establishment||"").trim(),
    manager:String(settings.manager||"").trim(),
    footer:String(settings.footer||"").trim()
  };
  if(!clean.establishment)throw new Error("Le nom de l’établissement est obligatoire.");
  if(!isCloudMode()){
    db.settings=clean;
    save();
    return clean;
  }
  const {data,error}=await supabaseClient.from("app_settings").update(clean).eq("id",1).select("id,establishment,manager,footer").single();
  if(error)throw error;
  db.settings={establishment:data.establishment,manager:data.manager,footer:data.footer};
  save();
  return db.settings;
}

function supplierLogoMarkup(supplier){
  const template=stopFlowSupplierCardTemplates.get(supplierKey(supplier.name))||stopFlowSupplierCardTemplates.get(supplierKey(supplier.code));
  if(template)return template;
  return `<div class="supplier-mark" aria-hidden="true"><span>${supplierText(supplierInitials(supplier.name))}</span></div>`;
}

function activeSupplierArticleCount(supplier){
  return (db.articles||[]).filter(article=>article.active&&(article.supplierId===supplier.id||supplierKey(article.supplier)===supplierKey(supplier.name))).length;
}

function renderSupplierCards(){
  const grid=document.querySelector("#dashboard .supplier-grid");
  if(!grid)return;
  const suppliers=ensureLocalSuppliers().filter(item=>item.active).sort((a,b)=>(a.sortOrder-b.sortOrder)||a.name.localeCompare(b.name,"fr"));
  if(!suppliers.length){
    grid.innerHTML='<div class="notice">Aucun fournisseur actif. L’Administrateur peut en réactiver un depuis « Fournisseurs ».</div>';
    return;
  }
  grid.innerHTML=suppliers.map(supplier=>{
    const count=activeSupplierArticleCount(supplier);
    return `<div class="supplier">
      ${supplierLogoMarkup(supplier)}
      <h3 style="margin:0 0 8px">${supplierText(supplier.name)}</h3>
      <p class="muted" style="min-height:42px">${supplierText(supplier.description||"Fournisseur StopFlow")}</p>
      <button class="btn primary" style="width:100%" data-start-shared-supplier="${supplierText(supplier.id||supplier.code)}" ${count?"":"disabled"}>${count?"Démarrer":"Aucun article actif"}</button>
    </div>`;
  }).join("");
  grid.querySelectorAll("[data-start-shared-supplier]").forEach(button=>button.onclick=()=>{
    const supplier=supplierById(button.dataset.startSharedSupplier)||ensureLocalSuppliers().find(item=>item.code===button.dataset.startSharedSupplier);
    if(!supplier)return;
    newInventory(supplier.name);
    current.supplierId=supplier.id||null;
  });
}

function fillSupplierSelect(select,selectedName=""){
  if(!select)return;
  const suppliers=ensureLocalSuppliers().slice().sort((a,b)=>(a.sortOrder-b.sortOrder)||a.name.localeCompare(b.name,"fr"));
  const previous=selectedName||select.value;
  select.innerHTML=suppliers.map(supplier=>`<option value="${supplierText(supplier.name)}" ${supplier.name===previous?"selected":""}>${supplierText(supplier.name)}${supplier.active?"":" — inactif"}</option>`).join("");
  if(previous&&suppliers.some(item=>item.name===previous))select.value=previous;
  else if(suppliers[0])select.value=suppliers[0].name;
}

function renderSupplierInterface(){
  ensureLocalSuppliers();
  renderSupplierCards();
  fillSupplierSelect(document.querySelector("#articleSupplier"));
  if(document.querySelector("#suppliers")&&!document.querySelector("#suppliers").classList.contains("hidden"))renderSuppliers();
}

function installSupplierPage(){
  const navigation=document.querySelector(".sidebar .nav");
  const main=document.querySelector("main.main");
  if(!navigation||!main)return;

  let navigationButton=document.querySelector('[data-page="suppliers"]');
  if(!navigationButton){
    navigationButton=document.createElement("button");
    navigationButton.dataset.page="suppliers";
    navigationButton.textContent="Fournisseurs";
    navigationButton.classList.add("hidden");
    const usersButton=navigation.querySelector('[data-page="users"]');
    navigation.insertBefore(navigationButton,usersButton||null);
  }

  if(!document.querySelector("#suppliers")){
    const section=document.createElement("section");
    section.id="suppliers";
    section.className="page hidden";
    section.innerHTML=`<div class="card" style="margin-top:0">
      <div class="flex between wrap">
        <div><h2>Fournisseurs StopFlow</h2><p class="muted">Créer, modifier ou désactiver les fournisseurs sans supprimer l’historique.</p></div>
        <button class="btn primary" id="addSupplier">Ajouter un fournisseur</button>
      </div>
      <div class="kpis">
        <div class="kpi"><span class="muted">Fournisseurs</span><strong id="supplierTotal">0</strong></div>
        <div class="kpi"><span class="muted">Actifs</span><strong id="supplierActive">0</strong></div>
        <div class="kpi"><span class="muted">Inactifs</span><strong id="supplierInactive">0</strong></div>
        <div class="kpi"><span class="muted">Articles liés</span><strong id="supplierArticles">0</strong></div>
      </div>
      <div class="field" style="margin-bottom:14px"><label>Rechercher</label><input class="input" id="supplierSearch" placeholder="Nom, contact, e-mail…"></div>
      <div class="tablewrap"><table><thead><tr><th>Fournisseur</th><th>Articles</th><th>Contact</th><th>Statut</th><th></th></tr></thead><tbody id="supplierRows"></tbody></table></div>
    </div>`;
    main.appendChild(section);
    section.querySelector("#addSupplier").onclick=()=>supplierModal();
    section.querySelector("#supplierSearch").oninput=renderSuppliers;
  }

  const originalPage=page;
  page=function(id){
    if(id==="suppliers"&&!isAdmin())id="dashboard";
    originalPage(id);
    if(id==="suppliers"){
      document.querySelector("#pageTitle").textContent="Fournisseurs";
      if(isCloudMode())loadSharedCatalog().then(renderSuppliers).catch(error=>alert(catalogErrorMessage(error)));
      else renderSuppliers();
    }
  };

  const originalApplyRole=applyRole;
  applyRole=function(){
    originalApplyRole();
    navigationButton.classList.toggle("hidden",!isAdmin());
  };

  const originalRenderDashboard=renderDashboard;
  renderDashboard=function(){
    originalRenderDashboard();
    renderSupplierCards();
  };

  const originalRenderArticles=renderArticles;
  renderArticles=function(){
    fillSupplierSelect(document.querySelector("#articleSupplier"));
    originalRenderArticles();
  };

  const originalArticleModal=articleModal;
  articleModal=function(id){
    const selected=document.querySelector("#articleSupplier")?.value||"";
    originalArticleModal(id);
    fillSupplierSelect(document.querySelector("#mSupplier"),document.querySelector("#mSupplier")?.value||selected);
  };

  try{STOPFLOW_STABLE_PAGES.add("suppliers")}catch{}
  navigationButton.onclick=()=>page("suppliers");
  renderSupplierInterface();
}

function renderSuppliers(){
  const rows=document.querySelector("#supplierRows");
  if(!rows)return;
  const suppliers=ensureLocalSuppliers();
  const query=String(document.querySelector("#supplierSearch")?.value||"").trim().toLowerCase();
  const filtered=suppliers.filter(supplier=>!query||JSON.stringify(supplier).toLowerCase().includes(query));
  document.querySelector("#supplierTotal").textContent=String(suppliers.length);
  document.querySelector("#supplierActive").textContent=String(suppliers.filter(item=>item.active).length);
  document.querySelector("#supplierInactive").textContent=String(suppliers.filter(item=>!item.active).length);
  document.querySelector("#supplierArticles").textContent=String((db.articles||[]).length);
  rows.innerHTML=filtered.length?filtered.map(supplier=>{
    const count=(db.articles||[]).filter(article=>article.supplierId===supplier.id||supplierKey(article.supplier)===supplierKey(supplier.name)).length;
    const contact=[supplier.contactName,supplier.email,supplier.phone].filter(Boolean).map(supplierText).join("<br>")||"—";
    return `<tr>
      <td><b>${supplierText(supplier.name)}</b><br><small class="muted">${supplierText(supplier.description||supplier.code)}</small></td>
      <td>${count}</td><td>${contact}</td>
      <td><span class="badge ${supplier.active?"validated":"cancelled"}">${supplier.active?"Actif":"Inactif"}</span></td>
      <td><button class="btn small ghost" data-edit-supplier="${supplierText(supplier.id||supplier.code)}">Modifier</button></td>
    </tr>`;
  }).join(""):'<tr><td colspan="5" class="muted">Aucun fournisseur trouvé.</td></tr>';
  rows.querySelectorAll("[data-edit-supplier]").forEach(button=>button.onclick=()=>{
    const supplier=supplierById(button.dataset.editSupplier)||ensureLocalSuppliers().find(item=>item.code===button.dataset.editSupplier);
    supplierModal(supplier?.id||supplier?.code);
  });
}

function supplierModal(id){
  if(!isAdmin())return alert("Cette action est réservée à l’Administrateur.");
  const existing=supplierById(id)||ensureLocalSuppliers().find(item=>item.code===id)||null;
  const supplier=existing?{...existing}:{id:null,code:"",name:"",description:"",contactName:"",email:"",phone:"",address:"",vatNumber:"",deliveryNotes:"",logoPath:"",active:true,sortOrder:(Math.max(0,...ensureLocalSuppliers().map(item=>Number(item.sortOrder||0)))+10)};
  const modal=document.querySelector("#modal");
  const box=document.querySelector("#modalBox");
  box.innerHTML=`<div class="flex between"><div><h2>${existing?"Modifier":"Ajouter"} un fournisseur</h2>${existing?`<div class="muted">Code stable : ${supplierText(existing.code)}</div>`:""}</div><button class="btn ghost" id="closeModal">Fermer</button></div>
    <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:16px">
      <div class="field"><label>Nom *</label><input id="supplierName" class="input" value="${supplierText(supplier.name)}"></div>
      <div class="field"><label>Ordre d’affichage</label><input id="supplierSort" class="input" type="number" min="0" value="${supplier.sortOrder}"></div>
    </div>
    <div class="field"><label>Description affichée sur l’accueil</label><input id="supplierDescription" class="input" value="${supplierText(supplier.description)}"></div>
    <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:12px">
      <div class="field"><label>Personne de contact</label><input id="supplierContact" class="input" value="${supplierText(supplier.contactName)}"></div>
      <div class="field"><label>E-mail</label><input id="supplierEmail" class="input" type="email" value="${supplierText(supplier.email)}"></div>
    </div>
    <div class="filters" style="grid-template-columns:1fr 1fr">
      <div class="field"><label>Téléphone</label><input id="supplierPhone" class="input" value="${supplierText(supplier.phone)}"></div>
      <div class="field"><label>N° TVA / BCE</label><input id="supplierVat" class="input" value="${supplierText(supplier.vatNumber)}"></div>
    </div>
    <div class="field"><label>Adresse</label><textarea id="supplierAddress" class="input" rows="2">${supplierText(supplier.address)}</textarea></div>
    <div class="field" style="margin-top:12px"><label>Informations de livraison ou de commande</label><textarea id="supplierNotes" class="input" rows="3">${supplierText(supplier.deliveryNotes)}</textarea></div>
    <label class="flex" style="margin:16px 0"><input id="supplierEnabled" type="checkbox" ${supplier.active?"checked":""}> Fournisseur actif</label>
    <div class="notice">Un fournisseur inactif disparaît de l’accueil, mais ses articles et les anciens bons restent conservés.</div>
    <button class="btn primary" id="saveSupplier" style="margin-top:16px">Enregistrer</button>`;
  modal.classList.remove("hidden");
  box.querySelector("#closeModal").onclick=()=>modal.classList.add("hidden");
  box.querySelector("#saveSupplier").onclick=async()=>{
    const button=box.querySelector("#saveSupplier");
    const next={
      ...supplier,
      code:existing?.code||supplierCode(box.querySelector("#supplierName").value),
      name:box.querySelector("#supplierName").value.trim(),
      description:box.querySelector("#supplierDescription").value.trim(),
      contactName:box.querySelector("#supplierContact").value.trim(),
      email:box.querySelector("#supplierEmail").value.trim(),
      phone:box.querySelector("#supplierPhone").value.trim(),
      address:box.querySelector("#supplierAddress").value.trim(),
      vatNumber:box.querySelector("#supplierVat").value.trim(),
      deliveryNotes:box.querySelector("#supplierNotes").value.trim(),
      sortOrder:Math.max(0,Number(box.querySelector("#supplierSort").value||0)),
      active:box.querySelector("#supplierEnabled").checked
    };
    if(!next.name)return alert("Le nom du fournisseur est obligatoire.");
    if(existing?.active&&!next.active&&!confirm(`Désactiver ${existing.name} ? Il ne sera plus proposé pour un nouvel inventaire.`))return;
    button.disabled=true;
    button.textContent="Enregistrement…";
    try{
      await saveSharedSupplier(next);
      modal.classList.add("hidden");
      renderSupplierInterface();
      renderSuppliers();
    }catch(error){
      alert(catalogErrorMessage(error,"Enregistrement du fournisseur impossible."));
      button.disabled=false;
      button.textContent="Enregistrer";
    }
  };
}

/* Mémorisation robuste de l’écran stable ouvert. */
const STOPFLOW_PAGE_KEY="stopflowLastPage";
const STOPFLOW_STABLE_PAGES=new Set(["dashboard","history","articles","suggestions","settings"]);
let stopFlowRestoreInProgress=false;

function rememberedStopFlowPage(){
  const saved=localStorage.getItem(STOPFLOW_PAGE_KEY)||"dashboard";
  return STOPFLOW_STABLE_PAGES.has(saved)?saved:"dashboard";
}

function rememberStopFlowPage(id){
  if(STOPFLOW_STABLE_PAGES.has(id))localStorage.setItem(STOPFLOW_PAGE_KEY,id);
}

function restoreRememberedStopFlowPage(){
  if(stopFlowRestoreInProgress)return;
  const app=document.querySelector("#app");
  if(!app||app.classList.contains("hidden"))return;
  const target=rememberedStopFlowPage();
  const pageElement=document.getElementById(target);
  if(pageElement&&!pageElement.classList.contains("hidden"))return;
  const navigation=document.querySelector(`[data-page="${target}"]`);
  if(!navigation)return;
  stopFlowRestoreInProgress=true;
  navigation.click();
  setTimeout(()=>{stopFlowRestoreInProgress=false},100);
}

document.addEventListener("click",event=>{
  const navigation=event.target.closest?.("[data-page]");
  const requested=navigation?.dataset?.page;
  if(STOPFLOW_STABLE_PAGES.has(requested))rememberStopFlowPage(requested);
},true);

window.addEventListener("load",()=>{
  const version=document.querySelector(".login-card > p.muted");
  if(version)version.textContent="Version 0.3.3 — Gestion des fournisseurs";
  installSupplierPage();
  const app=document.querySelector("#app");
  if(app){
    new MutationObserver(()=>setTimeout(restoreRememberedStopFlowPage,0))
      .observe(app,{attributes:true,attributeFilter:["class"]});
  }
  [0,100,300,700,1500,2500].forEach(delay=>setTimeout(restoreRememberedStopFlowPage,delay));
});

window.addEventListener("pageshow",()=>{
  [0,150,600].forEach(delay=>setTimeout(restoreRememberedStopFlowPage,delay));
});
