/* StopFlow 0.5.4 — correction du rafraîchissement des fournisseurs par département. */
(function(){
  const S=window.SF54;
  if(!S||window.stopflow054SupplierRefreshFix)return;
  window.stopflow054SupplierRefreshFix=true;

  const currentDepartmentPage=()=>document.querySelector("#sf54Department:not(.hidden)");

  function updateMemory(supplier,department){
    const id=String(supplier?.id||"");
    const code=String(supplier?.code||"");
    const name=String(supplier?.name||"").toLowerCase();
    const saved=(db.suppliers||[]).find(item=>(id&&String(item.id||"")===id)||(code&&String(item.code||"")===code)||(name&&String(item.name||"").toLowerCase()===name));
    if(saved)saved.department=department;
    (db.articles||[]).forEach(article=>{
      if((id&&String(article.supplierId||"")===id)||(name&&String(article.supplier||"").toLowerCase()===name))article.department=department;
    });
    try{save()}catch{}
  }

  async function refreshDepartmentSuppliers(){
    try{
      if(typeof loadSharedCatalog==="function")await loadSharedCatalog();
      else await S.loadDepartments();
      await S.loadDepartments();
      S.render();
    }catch(error){
      console.warn("StopFlow 0.5.4 — rafraîchissement des fournisseurs impossible",error);
    }
  }

  if(typeof saveSharedSupplier==="function"&&!window.stopflow054SupplierSaveRefreshPatched){
    window.stopflow054SupplierSaveRefreshPatched=true;
    const previousSave=saveSharedSupplier;
    saveSharedSupplier=async function(supplier){
      const department=document.querySelector("#supplierDepartment")?.value||supplier?.department||"salle";
      const result=await previousSave({...supplier,department});
      const saved=result||supplier;
      updateMemory(saved,department);

      if(S.cloud()&&saved?.id){
        const supplierUpdate=await supabaseClient.from("suppliers").update({department}).eq("id",saved.id);
        if(supplierUpdate.error)throw supplierUpdate.error;
        const articleUpdate=await supabaseClient.from("articles").update({department}).eq("supplier_id",saved.id);
        if(articleUpdate.error)throw articleUpdate.error;
      }

      await S.loadDepartments();
      S.render();
      return result;
    };
  }

  if(typeof S.action==="function"&&!window.stopflow054DepartmentActionRefreshPatched){
    window.stopflow054DepartmentActionRefreshPatched=true;
    const previousAction=S.action;
    S.action=function(action,department){
      const result=previousAction(action,department);
      if(action==="department"||action==="all-inventories")setTimeout(refreshDepartmentSuppliers,0);
      return result;
    };
  }

  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&currentDepartmentPage())refreshDepartmentSuppliers();
  });
  window.addEventListener("focus",()=>{if(currentDepartmentPage())refreshDepartmentSuppliers()});
  setTimeout(refreshDepartmentSuppliers,700);
})();
