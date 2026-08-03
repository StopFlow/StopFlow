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

window.addEventListener("focus",()=>{
  if(!isCloudMode())return;
  refreshSharedViews().catch(error=>{
    setSyncState(navigator.onLine?"error":"offline");
    console.warn(cloudErrorMessage(error));
  });
});

window.addEventListener("online",()=>{
  if(!isCloudMode())return;
  setSyncState("saving","reconnexion");
  refreshSharedViews().catch(()=>setSyncState("error"));
});

window.addEventListener("offline",()=>setSyncState("offline"));

document.addEventListener("DOMContentLoaded",()=>{
  setTimeout(()=>setSyncState(isCloudMode()?(navigator.onLine?"saved":"offline"):"local"),0);
});
