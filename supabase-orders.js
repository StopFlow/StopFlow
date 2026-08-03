/* StopFlow — synchronisation des inventaires et bons avec Supabase.
   Ce fichier ne modifie pas la génération PDF / impression. */

function isCloudMode(){
  return session?.authMode === "supabase" && Boolean(supabaseClient);
}

function cloudErrorMessage(error, fallback="Une erreur de synchronisation est survenue."){
  const message=error?.message||error?.details||fallback;
  console.error("StopFlow Supabase:", error);
  return message;
}

function isRevisionConflict(error){
  const text=`${error?.message||""} ${error?.details||""}`;
  return text.includes("CONFLIT_REVISION")||error?.code==="40001";
}

function ensureSyncIndicator(){
  let indicator=document.querySelector("#stopflowSyncState");
  if(indicator)return indicator;
  const topbar=document.querySelector(".topbar");
  if(!topbar)return null;
  indicator=document.createElement("div");
  indicator.id="stopflowSyncState";
  indicator.setAttribute("role","status");
  indicator.setAttribute("aria-live","polite");
  indicator.style.cssText="margin-left:auto;margin-right:8px;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#eef3f8;color:#536176;white-space:nowrap";
  const logout=document.querySelector("#logout");
  topbar.insertBefore(indicator,logout||null);
  return indicator;
}

function setSyncState(state,detail=""){
  const indicator=ensureSyncIndicator();
  if(!indicator)return;
  const states={
    local:["Mode local","#fff4dd","#8a5b00"],
    offline:["Hors connexion","#ffe8e8","#a92f2f"],
    saving:["Enregistrement…","#edf3ff","#225ecf"],
    saved:["Synchronisé","#e6f7ef","#0f7f50"],
    pending:["Copie locale en attente","#fff3d8","#976100"],
    conflict:["Version récente rechargée","#fff3d8","#976100"],
    error:["Non synchronisé","#ffe8e8","#a92f2f"]
  };
  const config=states[state]||states.saved;
  indicator.textContent=detail?`${config[0]} · ${detail}`:config[0];
  indicator.style.background=config[1];
  indicator.style.color=config[2];
  indicator.title=detail||config[0];
}

function stopFlowShortTime(value=new Date()){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return "";
  return date.toLocaleTimeString("fr-BE",{hour:"2-digit",minute:"2-digit"});
}

function stopFlowDateTime(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return "—";
  return date.toLocaleString("fr-BE",{dateStyle:"short",timeStyle:"short"});
}

function mapSharedLine(line){
  return {
    id:line.article_id,
    name:line.article_name,
    category:line.category||"",
    unit:line.unit||"",
    target:Number(line.target||0),
    stock:Number(line.stock||0),
    proposed:Number(line.proposed||0),
    quantity:Number(line.quantity||0)
  };
}

function mapSharedOrder(row){
  return {
    id:row.id,
    number:row.number||"—",
    supplier:row.supplier,
    status:row.status,
    createdAt:row.created_at,
    updatedAt:row.updated_at,
    inventoryAt:row.inventory_at,
    validatedAt:row.validated_at,
    authorId:row.author_id,
    author:row.author_name,
    validatorId:row.validator_id,
    validator:row.validator_name,
    lastEditedBy:row.last_edited_by||null,
    lastEditedName:row.last_edited_name||row.author_name||"",
    revision:Number(row.revision||1),
    note:row.note||"",
    stocks:row.stocks||{},
    adjustments:row.adjustments||{},
    lines:(row.order_lines||[])
      .slice()
      .sort((a,b)=>Number(a.line_position)-Number(b.line_position))
      .map(mapSharedLine)
  };
}

async function loadSharedOrders(){
  if(!isCloudMode()){
    setSyncState("local");
    return db.orders;
  }
  if(!navigator.onLine){
    setSyncState("offline");
    return db.orders;
  }

  const {data,error}=await supabaseClient
    .from("orders")
    .select(`
      id, number, supplier, status,
      author_id, author_name,
      validator_id, validator_name,
      last_edited_by, last_edited_name, revision,
      note, stocks, adjustments,
      inventory_at, validated_at, created_at, updated_at,
      order_lines (
        id, line_position, article_id, article_name,
        category, unit, target, stock, proposed, quantity
      )
    `)
    .order("inventory_at",{ascending:false});

  if(error){
    setSyncState("error");
    throw new Error(cloudErrorMessage(error,"Impossible de charger les inventaires partagés."));
  }
  db.orders=(data||[]).map(mapSharedOrder);
  save();
  setSyncState("saved",stopFlowShortTime());
  return db.orders;
}

function sharedOrderLinesPayload(order){
  return (order.lines||[]).map(line=>({
    article_id:String(line.id??""),
    article_name:line.name||"Article",
    category:line.category||"",
    unit:line.unit||"",
    target:Number(line.target||0),
    stock:Number(line.stock||0),
    proposed:Number(line.proposed||0),
    quantity:Number(line.quantity||0)
  }));
}

async function callSharedOrderAction(action,orderId){
  const {error}=await supabaseClient.rpc(action,{p_order_id:orderId});
  if(error)throw new Error(cloudErrorMessage(error,"Impossible de modifier le statut du document."));
}

async function saveSharedOrder(order){
  if(!isCloudMode()){
    setSyncState("local");
    return null;
  }
  if(!navigator.onLine){
    setSyncState("offline");
    throw new Error("Aucune connexion internet. La saisie reste sur cet appareil, mais elle n’est pas encore synchronisée avec StopFlow.");
  }

  setSyncState("saving");
  const desiredStatus=order.status;
  const expectedRevision=Number.isFinite(Number(order.revision))?Number(order.revision):null;

  const {error}=await supabaseClient.rpc("save_order_draft_atomic",{
    p_order_id:order.id,
    p_supplier:order.supplier,
    p_author_name:order.author||session.name,
    p_note:order.note||"",
    p_stocks:order.stocks||{},
    p_adjustments:order.adjustments||{},
    p_inventory_at:order.inventoryAt||new Date().toISOString(),
    p_created_at:order.createdAt||new Date().toISOString(),
    p_expected_revision:expectedRevision,
    p_lines:sharedOrderLinesPayload(order)
  });

  if(error){
    if(isRevisionConflict(error)){
      await loadSharedOrders().catch(()=>{});
      setSyncState("conflict");
      throw new Error("Ce brouillon a été modifié sur un autre appareil. La version la plus récente a été rechargée : vérifiez-la avant de continuer.");
    }
    setSyncState("error");
    throw new Error(cloudErrorMessage(error,"Impossible d’enregistrer le brouillon partagé."));
  }

  if(desiredStatus==="À valider"||desiredStatus==="Validé"){
    await callSharedOrderAction("submit_order",order.id);
  }
  if(desiredStatus==="Validé"){
    await callSharedOrderAction("validate_order",order.id);
  }

  await loadSharedOrders();
  setSyncState("saved",stopFlowShortTime());
  return db.orders.find(item=>item.id===order.id)||null;
}

async function updateSharedOrderStatus(action,orderId){
  if(!isCloudMode())return null;
  setSyncState("saving");
  await callSharedOrderAction(action,orderId);
  await loadSharedOrders();
  setSyncState("saved",stopFlowShortTime());
  return db.orders.find(item=>item.id===orderId)||null;
}

async function refreshSharedViews(){
  if(!isCloudMode())return;
  await loadSharedOrders();
  if(!document.querySelector("#dashboard")?.classList.contains("hidden"))renderDashboard();
  if(!document.querySelector("#history")?.classList.contains("hidden"))renderHistory();
}

/* 0.3.4B — copie locale de secours par utilisateur. */
function stopFlowDraftKey(){
  return `stopflow_pending_draft_v034_${session?.id||session?.email||"local"}`;
}

function stopFlowReadLocalDraft(){
  try{
    const value=JSON.parse(localStorage.getItem(stopFlowDraftKey())||"null");
    return value?.order?.id?value:null;
  }catch{return null}
}

function stopFlowClearLocalDraft(orderId=null){
  const draft=stopFlowReadLocalDraft();
  if(!orderId||draft?.order?.id===orderId)localStorage.removeItem(stopFlowDraftKey());
  stopFlowRenderRecovery();
}

function stopFlowCurrentOrder(){
  if(!current?.id||!current?.supplier)return null;
  const articles=typeof activeArticles==="function"?activeArticles(current.supplier):[];
  const lines=articles.map(article=>{
    const stock=Number(current.stocks?.[article.id]??0);
    const proposed=Math.max(0,Number(article.target||0)-stock);
    return {
      id:article.id,name:article.name,category:article.category||"",unit:article.unit||"",
      target:Number(article.target||0),stock,proposed,
      quantity:Number(current.adjustments?.[article.id]??proposed)
    };
  }).filter(line=>line.quantity>0);
  return {
    id:current.id,
    number:"—",
    supplier:current.supplier,
    status:"Brouillon",
    createdAt:current.createdAt||new Date().toISOString(),
    inventoryAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    authorId:current.authorId||session?.id||null,
    author:current.author||session?.name||"",
    lastEditedBy:session?.id||null,
    lastEditedName:session?.name||"",
    revision:Number(current.revision||0)||null,
    note:document.querySelector("#generalNote")?.value||current.note||"",
    stocks:structuredClone(current.stocks||{}),
    adjustments:structuredClone(current.adjustments||{}),
    lines
  };
}

function stopFlowStoreLocalDraft(){
  const order=stopFlowCurrentOrder();
  if(!order)return;
  localStorage.setItem(stopFlowDraftKey(),JSON.stringify({savedAt:new Date().toISOString(),order}));
  if(!navigator.onLine)setSyncState("pending",stopFlowShortTime());
  stopFlowRenderRecovery();
}

let stopFlowLocalSaveTimer=null;
function stopFlowScheduleLocalSave(){
  clearTimeout(stopFlowLocalSaveTimer);
  stopFlowLocalSaveTimer=setTimeout(stopFlowStoreLocalDraft,350);
}

function stopFlowResumeOrder(order,source="cloud"){
  if(!order||order.status!=="Brouillon")return;
  current={
    id:order.id,
    supplier:order.supplier,
    stocks:structuredClone(order.stocks||{}),
    adjustments:structuredClone(order.adjustments||{}),
    note:order.note||"",
    author:order.author||session?.name||"",
    authorId:order.authorId||session?.id||null,
    createdAt:order.createdAt||new Date().toISOString(),
    revision:Number(order.revision||0)||null
  };
  if(typeof page==="function")page("inventory");
  if(typeof renderInventory==="function")renderInventory();
  const note=document.querySelector("#generalNote");
  if(note)note.value=order.note||"";
  setSyncState(source==="local"?"pending":"saved",source==="local"?"copie locale":stopFlowShortTime(order.updatedAt||order.inventoryAt));
}

function stopFlowRenderRecovery(){
  const dashboard=document.querySelector("#dashboard");
  if(!dashboard)return;
  let box=document.querySelector("#stopflowRecoveryBox");
  const local=stopFlowReadLocalDraft();
  if(!local){box?.remove();return}
  const remote=(db.orders||[]).find(order=>order.id===local.order.id);
  const localDate=new Date(local.savedAt).getTime();
  const remoteDate=remote?new Date(remote.updatedAt||remote.inventoryAt).getTime():0;
  const needsAttention=!remote||localDate>remoteDate||!navigator.onLine;
  if(!needsAttention){stopFlowClearLocalDraft(local.order.id);return}
  if(!box){
    box=document.createElement("div");
    box.id="stopflowRecoveryBox";
    box.className="notice";
    box.style.cssText="margin:0 0 10px;background:#fff8e8;border-color:#f1d493;color:#76520b";
    dashboard.prepend(box);
  }
  box.innerHTML=`<div class="flex between wrap"><div><b>Saisie locale à récupérer</b><br><span style="font-size:11px">${local.order.supplier} · enregistrée sur cet appareil le ${stopFlowDateTime(local.savedAt)}</span></div><div class="flex wrap"><button class="btn small secondary" id="stopflowResumeLocal">Reprendre</button><button class="btn small ghost" id="stopflowDeleteLocal">Supprimer la copie</button></div></div>`;
  box.querySelector("#stopflowResumeLocal").onclick=()=>stopFlowResumeOrder(local.order,"local");
  box.querySelector("#stopflowDeleteLocal").onclick=()=>{
    if(confirm("Supprimer la copie locale de cette saisie ?"))stopFlowClearLocalDraft();
  };
}

async function stopFlowTryPendingSync(){
  const local=stopFlowReadLocalDraft();
  if(!local||!isCloudMode()||!navigator.onLine)return;
  await loadSharedOrders();
  const remote=(db.orders||[]).find(order=>order.id===local.order.id);
  if(remote&&Number(remote.revision||0)!==Number(local.order.revision||0)){
    setSyncState("conflict","copie locale conservée");
    stopFlowRenderRecovery();
    return;
  }
  try{
    const saved=await saveSharedOrder(local.order);
    stopFlowClearLocalDraft(local.order.id);
    if(saved)setSyncState("saved",stopFlowShortTime());
  }catch(error){
    setSyncState(isRevisionConflict(error)?"conflict":"pending","copie locale conservée");
  }
}

function stopFlowInstallDraftExperience(){
  if(window.__stopflowDraftExperienceInstalled)return;
  window.__stopflowDraftExperienceInstalled=true;

  const originalRenderHistory=window.renderHistory;
  window.renderHistory=function(){
    const q=document.querySelector("#historySearch")?.value.toLowerCase()||"";
    const st=document.querySelector("#historyStatus")?.value||"";
    const dir=document.querySelector("#historySort")?.value||"desc";
    const rows=[...(db.orders||[])].filter(order=>(!st||order.status===st)&&(!q||JSON.stringify(order).toLowerCase().includes(q))).sort((a,b)=>(new Date(b.inventoryAt)-new Date(a.inventoryAt))*(dir==="desc"?1:-1));
    const target=document.querySelector("#historyRows");
    if(!target){if(originalRenderHistory)originalRenderHistory();return}
    target.innerHTML=rows.length?rows.map(order=>{
      const badge=order.status==="Brouillon"?"draft":order.status==="À valider"?"pending":order.status==="Validé"?"validated":order.status==="Commandé"?"ordered":"cancelled";
      const edited=order.lastEditedName||order.author||"—";
      const editDate=order.updatedAt||order.inventoryAt;
      const resume=order.status==="Brouillon"?`<button class="btn small secondary" data-resume-order="${order.id}">Reprendre</button>`:"";
      return `<tr><td><b>${order.number}</b></td><td>${order.supplier}</td><td>${typeof fmt==="function"?fmt(order.inventoryAt):stopFlowDateTime(order.inventoryAt)}</td><td><span class="badge ${badge}">${order.status}</span></td><td>${order.author}<br><small class="muted">Modifié par ${edited} · ${stopFlowDateTime(editDate)}</small></td><td>${order.validator||"—"}</td><td><div class="flex wrap">${resume}<button class="btn small ghost" data-detail="${order.id}">Détail</button></div></td></tr>`;
    }).join(""):`<tr><td colspan="7" class="muted">Aucun document.</td></tr>`;
    document.querySelectorAll("[data-detail]").forEach(button=>button.onclick=()=>showDetail(button.dataset.detail));
    document.querySelectorAll("[data-resume-order]").forEach(button=>button.onclick=()=>{
      const order=(db.orders||[]).find(item=>item.id===button.dataset.resumeOrder);
      stopFlowResumeOrder(order,"cloud");
    });
  };

  const originalSaveSharedOrder=window.saveSharedOrder;
  window.saveSharedOrder=async function(order){
    localStorage.setItem(stopFlowDraftKey(),JSON.stringify({savedAt:new Date().toISOString(),order}));
    try{
      const result=await originalSaveSharedOrder(order);
      stopFlowClearLocalDraft(order.id);
      return result;
    }catch(error){
      stopFlowRenderRecovery();
      throw error;
    }
  };

  document.addEventListener("input",event=>{
    if(event.target.closest("#inventory"))stopFlowScheduleLocalSave();
  });
  document.addEventListener("change",event=>{
    if(event.target.closest("#inventory"))stopFlowScheduleLocalSave();
  });
  document.addEventListener("click",event=>{
    if(event.target.closest("#inventory"))setTimeout(stopFlowScheduleLocalSave,0);
  });
  window.addEventListener("beforeunload",stopFlowStoreLocalDraft);
  stopFlowRenderRecovery();
}

window.addEventListener("focus",()=>{
  if(!isCloudMode())return;
  refreshSharedViews().then(stopFlowRenderRecovery).catch(error=>{
    setSyncState(navigator.onLine?"error":"offline");
    console.warn(cloudErrorMessage(error));
  });
});

window.addEventListener("online",()=>{
  if(!isCloudMode())return;
  setSyncState("saving","reconnexion");
  stopFlowTryPendingSync().then(()=>refreshSharedViews()).then(stopFlowRenderRecovery).catch(()=>setSyncState("error"));
});

window.addEventListener("offline",()=>{
  stopFlowStoreLocalDraft();
  setSyncState("offline");
  stopFlowRenderRecovery();
});

document.addEventListener("DOMContentLoaded",()=>{
  setTimeout(()=>{
    setSyncState(isCloudMode()?(navigator.onLine?"saved":"offline"):"local");
    stopFlowInstallDraftExperience();
    stopFlowRenderRecovery();
  },0);
});
