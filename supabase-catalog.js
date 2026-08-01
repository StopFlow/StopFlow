/* StopFlow — synchronisation du catalogue et des paramètres avec Supabase.
   Les articles historiques restent figés dans les lignes des bons de commande. */

function catalogErrorMessage(error, fallback="Opération impossible sur le catalogue partagé."){
  const message=String(error?.message||error?.details||error?.hint||"").trim();
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
