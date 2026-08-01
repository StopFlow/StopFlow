/* StopFlow — synchronisation du catalogue et des paramètres avec Supabase.
   Les articles historiques restent figés dans les lignes des bons de commande. */

function catalogErrorMessage(error, fallback="Opération impossible sur le catalogue partagé."){
  const message=String(error?.message||error?.details||error?.hint||"").trim();
  console.error("StopFlow catalogue Supabase:",error);
  if(!message)return fallback;
  if(message.includes("duplicate key")||message.includes("articles_supplier_name_key"))return "Un article portant ce nom existe déjà chez ce fournisseur.";
  if(message.includes("row-level security")||message.includes("permission denied"))return "Votre rôle ne permet pas cette modification.";
  return message;
}

function normalizeSharedArticle(row){
  return {
    id:Number(row.id),
    name:String(row.name||""),
    supplier:String(row.supplier||""),
    category:String(row.category||""),
    unit:String(row.unit||""),
    target:Math.max(0,Number(row.target||0)),
    active:row.active===true,
    sortOrder:Number(row.sort_order||0)
  };
}

function replaceArticleInMemory(article){
  const index=db.articles.findIndex(item=>Number(item.id)===Number(article.id));
  if(index>=0)db.articles[index]=article;
  else db.articles.push(article);
  db.articles.sort((a,b)=>String(a.supplier).localeCompare(String(b.supplier),"fr")||(Number(a.sortOrder||0)-Number(b.sortOrder||0))||String(a.name).localeCompare(String(b.name),"fr"));
  save();
  return article;
}

async function loadSharedCatalog(){
  if(!isCloudMode())return {articles:db.articles,settings:db.settings};
  const [articlesResult,settingsResult]=await Promise.all([
    supabaseClient.from("articles").select("id,name,supplier,category,unit,target,active,sort_order").order("supplier").order("sort_order").order("id"),
    supabaseClient.from("app_settings").select("id,establishment,manager,footer").eq("id",1).single()
  ]);
  if(articlesResult.error)throw articlesResult.error;
  if(settingsResult.error)throw settingsResult.error;
  db.articles=(articlesResult.data||[]).map(normalizeSharedArticle);
  db.settings={
    establishment:String(settingsResult.data?.establishment||"Brasserie L'Union"),
    manager:String(settingsResult.data?.manager||"Quentin Pollet"),
    footer:String(settingsResult.data?.footer||"Document préparé par StopFlow — Envoi au fournisseur à effectuer manuellement.")
  };
  save();
  return {articles:db.articles,settings:db.settings};
}

async function saveSharedArticle(article){
  const clean={
    name:String(article.name||"").trim(),
    supplier:String(article.supplier||"").trim(),
    category:String(article.category||"").trim(),
    unit:String(article.unit||"").trim(),
    target:Math.max(0,Number(article.target||0)),
    active:article.active!==false,
    sort_order:Number(article.sortOrder||0)
  };
  if(!clean.name)throw new Error("Nom obligatoire.");
  if(!clean.supplier)throw new Error("Fournisseur obligatoire.");

  if(!isCloudMode()){
    const localArticle={...clean,sortOrder:clean.sort_order,id:article.id||Date.now()};
    delete localArticle.sort_order;
    return replaceArticleInMemory(localArticle);
  }

  let result;
  if(article.id){
    result=await supabaseClient.from("articles").update(clean).eq("id",article.id).select("id,name,supplier,category,unit,target,active,sort_order").single();
  }else{
    result=await supabaseClient.from("articles").insert(clean).select("id,name,supplier,category,unit,target,active,sort_order").single();
  }
  if(result.error)throw result.error;
  return replaceArticleInMemory(normalizeSharedArticle(result.data));
}

async function updateSharedArticle(id,changes){
  const article=db.articles.find(item=>Number(item.id)===Number(id));
  if(!article)throw new Error("Article introuvable.");
  return await saveSharedArticle({...article,...changes});
}

async function saveSharedSettings(settings){
  const clean={
    establishment:String(settings.establishment||"").trim(),
    manager:String(settings.manager||"").trim(),
    footer:String(settings.footer||"").trim()
  };
  if(!clean.establishment)throw new Error("Le nom de l’établissement est obligatoire.");
  if(!isCloudMode()){
    db.settings=clean;save();return clean;
  }
  const {data,error}=await supabaseClient.from("app_settings").update(clean).eq("id",1).select("id,establishment,manager,footer").single();
  if(error)throw error;
  db.settings={establishment:data.establishment,manager:data.manager,footer:data.footer};
  save();
  return db.settings;
}

function updateCatalogVersionLabels(){
  document.title="StopFlow — Colruyt & Leloup v0.3.1";
  document.querySelectorAll(".login-card p.muted").forEach(element=>{
    if(element.textContent.trim().startsWith("Version "))element.textContent="Version 0.3.1 — Catalogue partagé";
  });
  const localCard=document.querySelector("#settings .card:nth-of-type(2)");
  if(localCard){
    const title=localCard.querySelector("h2"),description=localCard.querySelector("p");
    if(title)title.textContent="Sauvegarde et sécurité";
    if(description)description.textContent="Les articles, paramètres, inventaires et bons sont maintenant partagés via Supabase.";
  }
}

function sharedRenderArticles(){
  const supplier=$("#articleSupplier").value;
  const articles=db.articles.filter(a=>a.supplier===supplier);
  $("#articleRows").innerHTML=articles.length?articles.map(a=>`<tr><td><b>${a.name}</b></td><td>${a.supplier}</td><td>${a.category}</td><td>${a.unit}</td><td><input class="input" style="width:90px" type="number" min="0" value="${a.target}" data-target="${a.id}"></td><td><input type="checkbox" data-active="${a.id}" ${a.active?"checked":""}></td><td><button class="btn small ghost" data-edit="${a.id}">Modifier</button></td></tr>`).join(""):`<tr><td colspan="7" class="muted">Aucun article pour ce fournisseur.</td></tr>`;
  $$("[data-target]").forEach(input=>input.onchange=async event=>{
    const id=Number(event.target.dataset.target),article=db.articles.find(a=>Number(a.id)===id),previous=article?.target;
    event.target.disabled=true;
    try{await updateSharedArticle(id,{target:Math.max(0,Number(event.target.value||0))});sharedRenderArticles()}
    catch(error){if(article)article.target=previous;alert(catalogErrorMessage(error));sharedRenderArticles()}
  });
  $$("[data-active]").forEach(input=>input.onchange=async event=>{
    const id=Number(event.target.dataset.active),article=db.articles.find(a=>Number(a.id)===id),previous=article?.active;
    event.target.disabled=true;
    try{await updateSharedArticle(id,{active:event.target.checked});sharedRenderArticles()}
    catch(error){if(article)article.active=previous;alert(catalogErrorMessage(error));sharedRenderArticles()}
  });
  $$("[data-edit]").forEach(button=>button.onclick=()=>sharedArticleModal(Number(button.dataset.edit)));
}

function sharedArticleModal(id){
  const selected=$("#articleSupplier").value;
  const existing=id?db.articles.find(x=>Number(x.id)===Number(id)):null;
  const nextSort=Math.max(0,...db.articles.filter(x=>x.supplier===selected).map(x=>Number(x.sortOrder||0)))+1;
  const article=existing?{...existing}:{id:null,name:"",supplier:selected,category:selected==="Leloup"?"Vins maison":"Apéritifs",unit:selected==="Leloup"?"fût 20 L":"bouteille",target:4,active:true,sortOrder:nextSort};
  $("#modalBox").innerHTML=`<div class="flex between"><h2>${id?"Modifier":"Ajouter"} un article</h2><button class="btn ghost" id="closeModal">Fermer</button></div>
  <div class="field"><label>Nom</label><input id="mName" class="input" value="${article.name}"></div>
  <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:12px"><div class="field"><label>Fournisseur</label><select id="mSupplier" class="input"><option ${article.supplier==="Colruyt"?"selected":""}>Colruyt</option><option ${article.supplier==="Leloup"?"selected":""}>Leloup</option></select></div><div class="field"><label>Catégorie</label><input id="mCat" class="input" value="${article.category}"></div></div>
  <div class="filters" style="grid-template-columns:1fr 1fr"><div class="field"><label>Unité</label><input id="mUnit" class="input" value="${article.unit}"></div><div class="field"><label>Stock cible</label><input id="mTarget" class="input" type="number" min="0" value="${article.target}"></div></div>
  <button class="btn primary" id="saveArticle">Enregistrer</button>`;
  $("#modal").classList.remove("hidden");$("#closeModal").onclick=()=>$("#modal").classList.add("hidden");
  $("#saveArticle").onclick=async()=>{
    const button=$("#saveArticle");
    const payload={...article,name:$("#mName").value.trim(),supplier:$("#mSupplier").value,category:$("#mCat").value.trim(),unit:$("#mUnit").value.trim(),target:Math.max(0,Number($("#mTarget").value||0))};
    if(!payload.name)return alert("Nom obligatoire");
    button.disabled=true;button.textContent="Enregistrement…";
    try{
      const saved=await saveSharedArticle(payload);
      $("#modal").classList.add("hidden");$("#articleSupplier").value=saved.supplier;sharedRenderArticles();
    }catch(error){alert(catalogErrorMessage(error));button.disabled=false;button.textContent="Enregistrer"}
  };
}

function installSharedCatalogIntegration(){
  if(window.__stopflowCatalogInstalled)return;
  window.__stopflowCatalogInstalled=true;
  updateCatalogVersionLabels();

  window.renderArticles=sharedRenderArticles;
  window.articleModal=sharedArticleModal;

  const originalLoadAuthenticatedProfile=window.loadAuthenticatedProfile;
  if(typeof originalLoadAuthenticatedProfile==="function"){
    window.loadAuthenticatedProfile=async function(user){
      await originalLoadAuthenticatedProfile(user);
      await loadSharedCatalog();
      if(!$("#dashboard").classList.contains("hidden"))renderDashboard();
    };
  }

  const originalPage=window.page;
  if(typeof originalPage==="function"){
    window.page=function(id){
      originalPage(id);
      if(isCloudMode()&&(id==="articles"||id==="settings")){
        loadSharedCatalog().then(()=>{if(id==="articles")sharedRenderArticles();if(id==="settings")loadSettings()}).catch(error=>alert(catalogErrorMessage(error)));
      }
    };
  }

  const originalNewInventory=window.newInventory;
  if(typeof originalNewInventory==="function"){
    window.newInventory=async function(supplier){
      try{if(isCloudMode())await loadSharedCatalog();return originalNewInventory(supplier)}
      catch(error){alert(catalogErrorMessage(error,"Impossible de charger le catalogue avant l’inventaire."))}
    };
  }

  $("#articleSupplier").onchange=sharedRenderArticles;
  $("#addArticle").onclick=()=>sharedArticleModal();
  $("#saveSettings").onclick=async()=>{
    const button=$("#saveSettings");
    const settings={establishment:$("#establishment").value,manager:$("#manager").value,footer:$("#footerText").value};
    button.disabled=true;button.textContent="Enregistrement…";
    try{await saveSharedSettings(settings);alert("Paramètres partagés enregistrés.")}
    catch(error){alert(catalogErrorMessage(error,"Enregistrement des paramètres impossible."))}
    finally{button.disabled=false;button.textContent="Enregistrer"}
  };
  $("#exportData").onclick=()=>{const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),anchor=document.createElement("a");anchor.href=URL.createObjectURL(blob);anchor.download="StopFlow_v0.3.1_donnees.json";anchor.click();URL.revokeObjectURL(anchor.href)};
  $("#importData").onchange=event=>{if(isCloudMode()){event.target.value="";return alert("L’import global est désactivé en mode partagé afin de protéger les données Supabase.")}const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{db=migrate(reader.result);save();alert("Import terminé.");page("dashboard")}catch{alert("Fichier invalide.")}};reader.readAsText(file)};
  $("#resetData").onclick=()=>{if(isCloudMode())return alert("La réinitialisation est désactivée en mode partagé afin de protéger les données Supabase.");if(confirm("Effacer toutes les données locales et revenir à la démonstration initiale ?")){db=defaultData();save();location.reload()}};

  if(isCloudMode())loadSharedCatalog().then(()=>{if(!$("#dashboard").classList.contains("hidden"))renderDashboard()}).catch(error=>console.warn(catalogErrorMessage(error)));
}

window.addEventListener("focus",()=>{
  if(!window.__stopflowCatalogInstalled||!isCloudMode())return;
  loadSharedCatalog().then(()=>{
    if(!$("#articles").classList.contains("hidden"))sharedRenderArticles();
    if(!$("#settings").classList.contains("hidden"))loadSettings();
  }).catch(error=>console.warn(catalogErrorMessage(error)));
});

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installSharedCatalogIntegration);
else setTimeout(installSharedCatalogIntegration,0);
