/* StopFlow 0.3.3 — gestion rapide des articles fournisseurs.
   Le prix est facultatif, en euros HTVA, pour le conditionnement indiqué. */

const STOPFLOW_UNIT_OPTIONS=[
  "pièce","bouteille","casier","caisse","carton","pack","sac","kg","litre","fût 20 L"
];

function stopFlowPriceValue(value){
  if(value===null||value===undefined||value==="")return "";
  const number=Number(value);
  return Number.isFinite(number)?number.toFixed(2):"";
}

function stopFlowPriceNumber(value){
  const text=String(value??"").trim().replace(",",".");
  if(text==="")return null;
  const number=Number(text);
  if(!Number.isFinite(number)||number<0)throw new Error("Le prix doit être un nombre positif ou rester vide.");
  return Math.round(number*100)/100;
}

function stopFlowUnitListMarkup(id="stopflowUnitOptions"){
  return `<datalist id="${id}">${STOPFLOW_UNIT_OPTIONS.map(unit=>`<option value="${supplierText(unit)}"></option>`).join("")}</datalist>`;
}

function stopFlowArticleSupplier(article){
  return supplierByName(article.supplier)||supplierById(article.supplierId);
}

function stopFlowArticleBelongsToSupplier(article,supplier){
  return Boolean(supplier)&&(article.supplierId===supplier.id||supplierKey(article.supplier)===supplierKey(supplier.name));
}

async function saveSharedArticlesBulk(supplier,rows){
  const currentArticles=(db.articles||[]).filter(article=>stopFlowArticleBelongsToSupplier(article,supplier));
  const existingNames=new Set(currentArticles.map(article=>supplierKey(article.name)));
  const batchNames=new Set();
  const firstSort=Math.max(0,...currentArticles.map(article=>Number(article.sortOrder||0)))+1;

  const cleanRows=rows.map((row,index)=>{
    const name=String(row.name||"").trim();
    if(!name)return null;
    const normalizedName=supplierKey(name);
    if(existingNames.has(normalizedName))throw new Error(`L’article « ${name} » existe déjà chez ${supplier.name}.`);
    if(batchNames.has(normalizedName))throw new Error(`L’article « ${name} » est présent deux fois dans la saisie.`);
    batchNames.add(normalizedName);
    return {
      name,
      supplier:supplier.name,
      supplier_id:supplier.id||null,
      category:String(row.category||"").trim(),
      unit:String(row.unit||"").trim(),
      target:Math.max(0,Number(row.target||0)),
      purchase_price:stopFlowPriceNumber(row.purchasePrice),
      active:true,
      sort_order:firstSort+index
    };
  }).filter(Boolean);

  if(!cleanRows.length)throw new Error("Ajoutez au moins un article.");

  if(!isCloudMode()){
    const created=[];
    for(const clean of cleanRows){
      const local={
        id:Date.now()+created.length,
        name:clean.name,
        supplier:clean.supplier,
        supplierId:clean.supplier_id,
        category:clean.category,
        unit:clean.unit,
        target:clean.target,
        purchasePrice:clean.purchase_price,
        active:true,
        sortOrder:clean.sort_order
      };
      replaceArticleInMemory(local);
      created.push(local);
    }
    return created;
  }

  const selection="id,name,supplier,supplier_id,category,unit,target,purchase_price,active,sort_order";
  const {data,error}=await supabaseClient.from("articles").insert(cleanRows).select(selection);
  if(error)throw error;
  const created=(data||[]).map(normalizeSharedArticle);
  created.forEach(replaceArticleInMemory);
  return created;
}

function stopFlowInstallArticleTools(){
  /* Les fonctions de l’application principale sont déjà chargées à ce stade. */
  const originalNormalizeSharedArticle=normalizeSharedArticle;
  normalizeSharedArticle=function(row){
    return {
      ...originalNormalizeSharedArticle(row),
      purchasePrice:row.purchase_price===null||row.purchase_price===undefined?null:Number(row.purchase_price)
    };
  };

  loadSharedCatalog=async function(){
    if(!isCloudMode()){
      ensureLocalSuppliers();
      (db.articles||[]).forEach(article=>{if(article.purchasePrice===undefined)article.purchasePrice=null});
      renderSupplierInterface();
      return {articles:db.articles,suppliers:db.suppliers,settings:db.settings};
    }

    const [articlesResult,suppliersResult,settingsResult]=await Promise.all([
      supabaseClient.from("articles").select("id,name,supplier,supplier_id,category,unit,target,purchase_price,active,sort_order").order("supplier").order("sort_order").order("id"),
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
  };

  saveSharedArticle=async function(article){
    const linkedSupplier=stopFlowArticleSupplier(article);
    const clean={
      name:String(article.name||"").trim(),
      supplier:String(linkedSupplier?.name||article.supplier||"").trim(),
      supplier_id:linkedSupplier?.id||null,
      category:String(article.category||"").trim(),
      unit:String(article.unit||"").trim(),
      target:Math.max(0,Number(article.target||0)),
      purchase_price:stopFlowPriceNumber(article.purchasePrice),
      active:article.active!==false,
      sort_order:Number(article.sortOrder||0)
    };
    if(!clean.name)throw new Error("Nom obligatoire.");
    if(!clean.supplier)throw new Error("Fournisseur obligatoire.");

    if(!isCloudMode()){
      const localArticle={
        id:article.id||Date.now(),name:clean.name,supplier:clean.supplier,supplierId:clean.supplier_id,
        category:clean.category,unit:clean.unit,target:clean.target,purchasePrice:clean.purchase_price,
        active:clean.active,sortOrder:clean.sort_order
      };
      return replaceArticleInMemory(localArticle);
    }

    const selection="id,name,supplier,supplier_id,category,unit,target,purchase_price,active,sort_order";
    const result=article.id
      ?await supabaseClient.from("articles").update(clean).eq("id",article.id).select(selection).single()
      :await supabaseClient.from("articles").insert(clean).select(selection).single();
    if(result.error)throw result.error;
    return replaceArticleInMemory(normalizeSharedArticle(result.data));
  };

  renderArticles=function(){
    fillSupplierSelect(document.querySelector("#articleSupplier"));
    const supplierName=document.querySelector("#articleSupplier")?.value||"";
    const supplier=supplierByName(supplierName);
    const articles=(db.articles||[]).filter(article=>stopFlowArticleBelongsToSupplier(article,supplier)||(!supplier&&article.supplier===supplierName));
    const table=document.querySelector("#articleRows")?.closest("table");
    if(table){
      const header=table.querySelector("thead tr");
      if(header)header.innerHTML="<th>Article</th><th>Fournisseur</th><th>Catégorie</th><th>Conditionnement</th><th>Prix HTVA</th><th>Stock cible</th><th>Actif</th><th></th>";
    }
    const rows=document.querySelector("#articleRows");
    if(!rows)return;
    rows.innerHTML=articles.length?articles.map(article=>`<tr>
      <td><b>${supplierText(article.name)}</b></td>
      <td>${supplierText(article.supplier)}</td>
      <td>${supplierText(article.category||"—")}</td>
      <td>${supplierText(article.unit||"—")}</td>
      <td><div class="flex" style="gap:5px"><input class="input" style="width:92px" type="number" min="0" step="0.01" placeholder="—" value="${stopFlowPriceValue(article.purchasePrice)}" data-price="${article.id}"><span class="muted">€</span></div></td>
      <td><input class="input" style="width:82px" type="number" min="0" value="${article.target}" data-target="${article.id}"></td>
      <td><input type="checkbox" data-active="${article.id}" ${article.active?"checked":""}></td>
      <td><button class="btn small ghost" data-edit="${article.id}">Modifier</button></td>
    </tr>`).join(""):'<tr><td colspan="8" class="muted">Aucun article pour ce fournisseur.</td></tr>';

    rows.querySelectorAll("[data-price]").forEach(input=>input.onchange=async event=>{
      const id=Number(event.target.dataset.price),article=db.articles.find(item=>Number(item.id)===id),previous=article?.purchasePrice;
      event.target.disabled=true;
      try{await updateSharedArticle(id,{purchasePrice:stopFlowPriceNumber(event.target.value)});renderArticles()}
      catch(error){if(article)article.purchasePrice=previous;alert(catalogErrorMessage(error));renderArticles()}
    });
    rows.querySelectorAll("[data-target]").forEach(input=>input.onchange=async event=>{
      const id=Number(event.target.dataset.target),article=db.articles.find(item=>Number(item.id)===id),previous=article?.target;
      event.target.disabled=true;
      try{await updateSharedArticle(id,{target:Math.max(0,Number(event.target.value||0))});renderArticles()}
      catch(error){if(article)article.target=previous;alert(catalogErrorMessage(error));renderArticles()}
    });
    rows.querySelectorAll("[data-active]").forEach(input=>input.onchange=async event=>{
      const id=Number(event.target.dataset.active),article=db.articles.find(item=>Number(item.id)===id),previous=article?.active;
      event.target.disabled=true;
      try{await updateSharedArticle(id,{active:event.target.checked});renderArticles()}
      catch(error){if(article)article.active=previous;alert(catalogErrorMessage(error));renderArticles()}
    });
    rows.querySelectorAll("[data-edit]").forEach(button=>button.onclick=()=>articleModal(Number(button.dataset.edit)));
  };

  articleModal=function(id){
    const selected=document.querySelector("#articleSupplier")?.value||"";
    const existing=id?db.articles.find(item=>Number(item.id)===Number(id)):null;
    const nextSort=Math.max(0,...db.articles.filter(item=>item.supplier===selected).map(item=>Number(item.sortOrder||0)))+1;
    const article=existing?{...existing}:{id:null,name:"",supplier:selected,category:"",unit:"",target:0,purchasePrice:null,active:true,sortOrder:nextSort};
    const modal=document.querySelector("#modal");
    const box=document.querySelector("#modalBox");
    box.innerHTML=`<div class="flex between"><h2>${id?"Modifier":"Ajouter"} un article</h2><button class="btn ghost" id="closeModal">Fermer</button></div>
      <div class="field"><label>Nom *</label><input id="mName" class="input" value="${supplierText(article.name)}"></div>
      <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:12px">
        <div class="field"><label>Fournisseur</label><select id="mSupplier" class="input"></select></div>
        <div class="field"><label>Catégorie</label><input id="mCat" class="input" value="${supplierText(article.category)}"></div>
      </div>
      <div class="filters" style="grid-template-columns:1fr 1fr 1fr">
        <div class="field"><label>Conditionnement</label><input id="mUnit" class="input" list="stopflowArticleUnits" placeholder="Facultatif" value="${supplierText(article.unit)}"></div>
        <div class="field"><label>Stock cible</label><input id="mTarget" class="input" type="number" min="0" value="${article.target}"></div>
        <div class="field"><label>Prix d’achat HTVA (€)</label><input id="mPrice" class="input" type="number" min="0" step="0.01" placeholder="Facultatif" value="${stopFlowPriceValue(article.purchasePrice)}"></div>
      </div>
      ${stopFlowUnitListMarkup("stopflowArticleUnits")}
      <div class="notice">Le prix est facultatif et correspond au conditionnement choisi : par bouteille, casier, kilo, etc.</div>
      <button class="btn primary" id="saveArticle" style="margin-top:16px">Enregistrer</button>`;
    modal.classList.remove("hidden");
    fillSupplierSelect(box.querySelector("#mSupplier"),article.supplier||selected);
    box.querySelector("#closeModal").onclick=()=>modal.classList.add("hidden");
    box.querySelector("#saveArticle").onclick=async()=>{
      const button=box.querySelector("#saveArticle");
      const next={
        ...article,
        name:box.querySelector("#mName").value.trim(),
        supplier:box.querySelector("#mSupplier").value,
        category:box.querySelector("#mCat").value.trim(),
        unit:box.querySelector("#mUnit").value.trim(),
        target:Math.max(0,Number(box.querySelector("#mTarget").value||0)),
        purchasePrice:stopFlowPriceNumber(box.querySelector("#mPrice").value)
      };
      if(!next.name)return alert("Le nom est obligatoire.");
      button.disabled=true;button.textContent="Enregistrement…";
      try{
        const saved=await saveSharedArticle(next);
        modal.classList.add("hidden");
        document.querySelector("#articleSupplier").value=saved.supplier;
        renderArticles();
      }catch(error){
        alert(catalogErrorMessage(error));button.disabled=false;button.textContent="Enregistrer";
      }
    };
  };

  renderSuppliers=function(){
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
      const count=(db.articles||[]).filter(article=>stopFlowArticleBelongsToSupplier(article,supplier)).length;
      const contact=[supplier.contactName,supplier.email,supplier.phone].filter(Boolean).map(supplierText).join("<br>")||"—";
      const key=supplierText(supplier.id||supplier.code);
      return `<tr>
        <td><b>${supplierText(supplier.name)}</b><br><small class="muted">${supplierText(supplier.description||supplier.code)}</small></td>
        <td>${count}</td><td>${contact}</td>
        <td><span class="badge ${supplier.active?"validated":"cancelled"}">${supplier.active?"Actif":"Inactif"}</span></td>
        <td><div class="flex wrap"><button class="btn small secondary" data-supplier-articles="${key}">Articles</button><button class="btn small ghost" data-edit-supplier="${key}">Modifier</button></div></td>
      </tr>`;
    }).join(""):'<tr><td colspan="5" class="muted">Aucun fournisseur trouvé.</td></tr>';

    rows.querySelectorAll("[data-supplier-articles]").forEach(button=>button.onclick=()=>{
      const supplier=supplierById(button.dataset.supplierArticles)||ensureLocalSuppliers().find(item=>item.code===button.dataset.supplierArticles);
      if(!supplier)return;
      page("articles");
      fillSupplierSelect(document.querySelector("#articleSupplier"),supplier.name);
      document.querySelector("#articleSupplier").value=supplier.name;
      renderArticles();
    });
    rows.querySelectorAll("[data-edit-supplier]").forEach(button=>button.onclick=()=>{
      const supplier=supplierById(button.dataset.editSupplier)||ensureLocalSuppliers().find(item=>item.code===button.dataset.editSupplier);
      supplierModal(supplier?.id||supplier?.code);
    });
  };

  function bulkArticleModal(){
    if(!(isResponsible()||isAdmin()))return alert("Cette action est réservée au Responsable ou à l’Administrateur.");
    const supplierName=document.querySelector("#articleSupplier")?.value||"";
    const supplier=supplierByName(supplierName);
    if(!supplier)return alert("Sélectionnez d’abord un fournisseur.");
    const modal=document.querySelector("#modal");
    const box=document.querySelector("#modalBox");
    const rowMarkup=index=>`<tr data-bulk-row>
      <td><input class="input" data-bulk-name placeholder="Nom de l’article"></td>
      <td><input class="input" data-bulk-category placeholder="Catégorie"></td>
      <td><input class="input" data-bulk-unit list="stopflowBulkUnits" placeholder="Facultatif"></td>
      <td><input class="input" data-bulk-target type="number" min="0" value="0" style="width:85px"></td>
      <td><input class="input" data-bulk-price type="number" min="0" step="0.01" placeholder="—" style="width:100px"></td>
      <td><button class="btn small danger" data-remove-bulk title="Retirer cette ligne">Retirer</button></td>
    </tr>`;
    box.innerHTML=`<div class="flex between"><div><h2>Ajout multiple — ${supplierText(supplier.name)}</h2><p class="muted">Une ligne par article. Seul le nom est obligatoire.</p></div><button class="btn ghost" id="closeModal">Fermer</button></div>
      <div class="notice">Le prix d’achat est facultatif, en euros HTVA, pour le conditionnement indiqué.</div>
      <div class="tablewrap" style="margin-top:14px"><table style="min-width:900px"><thead><tr><th>Article *</th><th>Catégorie</th><th>Conditionnement</th><th>Cible</th><th>Prix HTVA</th><th></th></tr></thead><tbody id="bulkArticleRows">${Array.from({length:6},(_,index)=>rowMarkup(index)).join("")}</tbody></table></div>
      ${stopFlowUnitListMarkup("stopflowBulkUnits")}
      <div class="flex wrap" style="margin-top:14px"><button class="btn ghost" id="addBulkRows">Ajouter 5 lignes</button><button class="btn primary" id="saveBulkArticles">Enregistrer les articles</button></div>`;
    modal.classList.remove("hidden");

    const body=box.querySelector("#bulkArticleRows");
    const bindRemove=()=>body.querySelectorAll("[data-remove-bulk]").forEach(button=>button.onclick=()=>{
      const rows=body.querySelectorAll("[data-bulk-row]");
      if(rows.length<=1)return;
      button.closest("tr").remove();
    });
    bindRemove();
    box.querySelector("#closeModal").onclick=()=>modal.classList.add("hidden");
    box.querySelector("#addBulkRows").onclick=()=>{
      body.insertAdjacentHTML("beforeend",Array.from({length:5},(_,index)=>rowMarkup(index)).join(""));
      bindRemove();
    };
    box.querySelector("#saveBulkArticles").onclick=async()=>{
      const button=box.querySelector("#saveBulkArticles");
      const rows=[...body.querySelectorAll("[data-bulk-row]")].map(row=>({
        name:row.querySelector("[data-bulk-name]").value,
        category:row.querySelector("[data-bulk-category]").value,
        unit:row.querySelector("[data-bulk-unit]").value,
        target:row.querySelector("[data-bulk-target]").value,
        purchasePrice:row.querySelector("[data-bulk-price]").value
      }));
      button.disabled=true;button.textContent="Enregistrement…";
      try{
        const created=await saveSharedArticlesBulk(supplier,rows);
        modal.classList.add("hidden");
        renderArticles();renderSuppliers();renderSupplierCards();
        alert(`${created.length} article${created.length>1?"s":""} ajouté${created.length>1?"s":""} chez ${supplier.name}.`);
      }catch(error){
        alert(catalogErrorMessage(error,"Ajout multiple impossible."));button.disabled=false;button.textContent="Enregistrer les articles";
      }
    };
  }

  const addArticleButton=document.querySelector("#addArticle");
  if(addArticleButton&&!document.querySelector("#addMultipleArticles")){
    const multiple=document.createElement("button");
    multiple.id="addMultipleArticles";
    multiple.className="btn secondary";
    multiple.textContent="Ajout multiple";
    addArticleButton.parentElement.insertBefore(multiple,addArticleButton);
    multiple.onclick=bulkArticleModal;
  }

  const articleSupplierInput=document.querySelector("#articleSupplier");
  if(articleSupplierInput)articleSupplierInput.onchange=renderArticles;
  const supplierSearchInput=document.querySelector("#supplierSearch");
  if(supplierSearchInput)supplierSearchInput.oninput=renderSuppliers;

  /* Actualise les données si une session avait été restaurée avant l’installation du module. */
  if(document.querySelector("#app")&&!document.querySelector("#app").classList.contains("hidden")&&isCloudMode()){
    loadSharedCatalog().then(()=>{renderArticles();renderSuppliers();renderSupplierCards()}).catch(error=>console.error("StopFlow articles",error));
  }else{
    renderArticles();renderSuppliers();
  }
}

if(document.readyState==="complete")stopFlowInstallArticleTools();
else window.addEventListener("load",stopFlowInstallArticleTools);
