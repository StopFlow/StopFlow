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
    inventoryAt:row.inventory_at,
    validatedAt:row.validated_at,
    authorId:row.author_id,
    author:row.author_name,
    validatorId:row.validator_id,
    validator:row.validator_name,
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
  if(!isCloudMode())return db.orders;

  const {data,error}=await supabaseClient
    .from("orders")
    .select(`
      id, number, supplier, status,
      author_id, author_name,
      validator_id, validator_name,
      note, stocks, adjustments,
      inventory_at, validated_at, created_at, updated_at,
      order_lines (
        id, line_position, article_id, article_name,
        category, unit, target, stock, proposed, quantity
      )
    `)
    .order("inventory_at",{ascending:false});

  if(error)throw new Error(cloudErrorMessage(error,"Impossible de charger les inventaires partagés."));
  db.orders=(data||[]).map(mapSharedOrder);
  save();
  return db.orders;
}

async function replaceSharedOrderLines(order){
  const {error:deleteError}=await supabaseClient
    .from("order_lines")
    .delete()
    .eq("order_id",order.id);
  if(deleteError)throw new Error(cloudErrorMessage(deleteError,"Impossible de mettre à jour les lignes du document."));

  const rows=(order.lines||[]).map((line,index)=>({
    order_id:order.id,
    line_position:index,
    article_id:String(line.id??""),
    article_name:line.name||"Article",
    category:line.category||"",
    unit:line.unit||"",
    target:Number(line.target||0),
    stock:Number(line.stock||0),
    proposed:Number(line.proposed||0),
    quantity:Number(line.quantity||0)
  }));

  if(!rows.length)return;
  const {error:insertError}=await supabaseClient.from("order_lines").insert(rows);
  if(insertError)throw new Error(cloudErrorMessage(insertError,"Impossible d’enregistrer les lignes du document."));
}

async function callSharedOrderAction(action,orderId){
  const {error}=await supabaseClient.rpc(action,{p_order_id:orderId});
  if(error)throw new Error(cloudErrorMessage(error,"Impossible de modifier le statut du document."));
}

async function saveSharedOrder(order){
  if(!isCloudMode())return null;

  const desiredStatus=order.status;
  const {data:existing,error:readError}=await supabaseClient
    .from("orders")
    .select("id,status")
    .eq("id",order.id)
    .maybeSingle();
  if(readError)throw new Error(cloudErrorMessage(readError,"Impossible de vérifier le brouillon."));

  if(existing&&existing.status!=="Brouillon"){
    throw new Error("Ce document a déjà été envoyé et ne peut plus être remplacé comme brouillon.");
  }

  if(!existing){
    const {error:insertError}=await supabaseClient.from("orders").insert({
      id:order.id,
      supplier:order.supplier,
      status:"Brouillon",
      author_id:session.id,
      author_name:order.author||session.name,
      note:order.note||"",
      stocks:order.stocks||{},
      adjustments:order.adjustments||{},
      inventory_at:order.inventoryAt||new Date().toISOString(),
      created_at:order.createdAt||new Date().toISOString()
    });
    if(insertError)throw new Error(cloudErrorMessage(insertError,"Impossible de créer le brouillon partagé."));
  }else{
    const {error:updateError}=await supabaseClient
      .from("orders")
      .update({
        note:order.note||"",
        stocks:order.stocks||{},
        adjustments:order.adjustments||{},
        inventory_at:order.inventoryAt||new Date().toISOString()
      })
      .eq("id",order.id);
    if(updateError)throw new Error(cloudErrorMessage(updateError,"Impossible de mettre à jour le brouillon partagé."));
  }

  await replaceSharedOrderLines(order);

  if(desiredStatus==="À valider"||desiredStatus==="Validé"){
    await callSharedOrderAction("submit_order",order.id);
  }
  if(desiredStatus==="Validé"){
    await callSharedOrderAction("validate_order",order.id);
  }

  await loadSharedOrders();
  return db.orders.find(item=>item.id===order.id)||null;
}

async function updateSharedOrderStatus(action,orderId){
  if(!isCloudMode())return null;
  await callSharedOrderAction(action,orderId);
  await loadSharedOrders();
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
  refreshSharedViews().catch(error=>console.warn(cloudErrorMessage(error)));
});
