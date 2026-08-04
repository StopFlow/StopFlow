/* StopFlow 0.5.0 — checklists par département, exécutions et suggestions. */
(function(){
  const DEPARTMENT_LABELS={
    salle:"Salle",
    cuisine:"Cuisine",
    nettoyage:"Entretien & hygiène",
    bureau:"Bureau"
  };
  const TYPE_LABELS={ouverture:"Ouverture",fermeture:"Fermeture",controle:"Contrôle",autre:"Autre"};
  const STATUS_LABELS={en_cours:"En cours",a_controler:"À contrôler",validee:"Validée",suivi_necessaire:"Suivi nécessaire"};
  const state={department:null,templates:[],runs:[],suggestions:[],activeRun:null,activeItems:[],installed:false};

  const escapeHtml=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const departmentLabel=value=>DEPARTMENT_LABELS[String(value||"").toLowerCase()]||"Non défini";
  const managerAccess=()=>typeof isResponsible==="function"&&isResponsible();
  const cloudReady=()=>typeof isCloudMode==="function"&&isCloudMode()&&typeof supabaseClient!=="undefined"&&supabaseClient;

  function injectStyles(){
    if(document.getElementById("stopflow050Styles"))return;
    const style=document.createElement("style");
    style.id="stopflow050Styles";
    style.textContent=`
      #login .login-card>p.muted::after{content:"Version 0.5.0 — Checklists"!important}
      .version-pill::after{content:"StopFlow 0.5.0"!important}
      .checklist-toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}
      .checklist-tabs{display:flex;gap:7px;flex-wrap:wrap}
      .checklist-template-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
      .checklist-template{border:1px solid var(--line);border-radius:12px;background:#fff;padding:13px;display:grid;gap:9px}
      .checklist-template h3{margin:0}.checklist-template-meta{display:flex;gap:6px;flex-wrap:wrap}
      .checklist-pill{display:inline-flex;padding:4px 7px;border-radius:999px;background:#edf3ff;color:#225ecf;font-size:11px;font-weight:800}
      .checklist-pill.department{background:#eef8f3;color:#14734d}.checklist-pill.optional{background:#fff3d8;color:#8d6200}
      .checklist-run-list{display:grid;gap:7px}.checklist-run-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}
      .checklist-section{margin-top:12px;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}
      .checklist-section-title{padding:9px 11px;background:#f7f9fc;font-weight:800;border-bottom:1px solid var(--line)}
      .checklist-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:10px 11px;border-bottom:1px solid var(--line);align-items:start}
      .checklist-item:last-child{border-bottom:0}.checklist-item-main{display:flex;gap:9px;align-items:flex-start}.checklist-item-main input[type="checkbox"]{width:20px;height:20px;margin:1px 0 0;flex:0 0 auto}
      .checklist-item.done .checklist-item-label{text-decoration:line-through;color:var(--muted)}
      .checklist-item-help{display:block;margin-top:3px;color:var(--muted);font-size:11px}.checklist-item-actions{display:flex;gap:5px;align-items:center}
      .checklist-anomaly{margin:0 11px 10px;padding:9px;border-radius:9px;background:#fff5f5;border:1px solid #ffd1d1}.checklist-anomaly textarea{margin-top:7px}
      .checklist-progress-line{display:flex;justify-content:space-between;gap:10px;margin:8px 0 5px;font-size:12px}
      .checklist-empty{padding:18px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:11px}
      .checklist-manager-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.checklist-suggestion{padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}
      .user-department-inline{display:block;margin-top:2px;font-size:11px;color:var(--muted)}
      @media(max-width:950px){
        .sidebar .nav button[data-page="checklists"]{font-size:0!important}
        .sidebar .nav button[data-page="checklists"]::after{content:"Checklists";font-size:12px;line-height:1.1}
      }
      @media(max-width:620px){
        .checklist-template-grid,.checklist-manager-grid{grid-template-columns:1fr}
        .checklist-run-row{grid-template-columns:1fr}.checklist-run-row .btn{width:100%}
        .checklist-item{grid-template-columns:1fr}.checklist-item-actions{justify-content:flex-end}
      }
    `;
    document.head.appendChild(style);
  }

  function installPage(){
    if(document.getElementById("checklists"))return;
    const main=document.querySelector("#app .main");
    if(!main)return;
    const section=document.createElement("section");
    section.id="checklists";
    section.className="page hidden";
    section.innerHTML=`
      <div id="checklistHome">
        <div class="checklist-toolbar">
          <div><h2>Checklists opérationnelles</h2><p class="muted" id="checklistAccessText">Chargement du département…</p></div>
          <button class="btn ghost" id="refreshChecklists" type="button">Actualiser</button>
        </div>
        <div class="card" style="margin-top:0">
          <div class="flex between wrap"><div><h2>À effectuer</h2><p class="muted">Choisissez une checklist autorisée pour votre département.</p></div><span class="version-pill">StopFlow 0.5.0</span></div>
          <div id="checklistTemplates" class="checklist-template-grid"></div>
        </div>
        <div class="card">
          <h2>Exécutions récentes</h2>
          <div id="checklistRuns" class="checklist-run-list"></div>
        </div>
        <div class="card">
          <h2>Proposer une amélioration</h2>
          <p class="muted">Un membre de l’équipe peut suggérer une tâche. Un Responsable ou Administrateur décide ensuite de l’ajouter au modèle.</p>
          <div class="filters" style="grid-template-columns:1fr 2fr 2fr">
            <div class="field"><label>Checklist</label><select class="input" id="suggestionTemplate"></select></div>
            <div class="field"><label>Tâche proposée</label><input class="input" id="suggestionLabel" placeholder="Ex. vérifier le stock de savon"></div>
            <div class="field"><label>Pourquoi l’ajouter ?</label><input class="input" id="suggestionExplanation" placeholder="Contexte ou problème constaté"></div>
          </div>
          <button class="btn secondary" id="submitChecklistSuggestion" type="button">Envoyer la suggestion</button>
        </div>
        <div class="card hidden" id="checklistManagerPanel">
          <div class="flex between wrap"><div><h2>Gestion des modèles</h2><p class="muted">Créer un modèle, ajouter une tâche directement ou traiter les suggestions.</p></div><button class="btn primary" id="createChecklistTemplate" type="button">Créer un modèle</button></div>
          <div id="checklistSuggestions" class="checklist-run-list" style="margin-top:12px"></div>
        </div>
      </div>
      <div id="checklistRunner" class="hidden">
        <div class="checklist-toolbar">
          <button class="btn ghost" id="backToChecklists" type="button">Retour aux checklists</button>
          <div class="flex wrap" id="checklistRunnerActions"></div>
        </div>
        <div class="card" style="margin-top:0">
          <h2 id="checklistRunTitle">Checklist</h2>
          <p class="muted" id="checklistRunMeta"></p>
          <div class="checklist-progress-line"><span id="checklistProgressText">0 / 0</span><span id="checklistRequiredText"></span></div>
          <div class="progress"><span id="checklistProgressBar"></span></div>
          <div id="checklistRunItems"></div>
        </div>
      </div>`;
    main.appendChild(section);
    document.getElementById("refreshChecklists").addEventListener("click",()=>refreshAll(true));
    document.getElementById("backToChecklists").addEventListener("click",showChecklistHome);
    document.getElementById("submitChecklistSuggestion").addEventListener("click",submitSuggestion);
    document.getElementById("createChecklistTemplate").addEventListener("click",openCreateTemplateModal);
  }

  function installNavigation(){
    const nav=document.querySelector(".sidebar .nav");
    if(nav&&!nav.querySelector('[data-page="checklists"]')){
      const future=[...nav.querySelectorAll("button.future-module")].find(button=>button.textContent.toLowerCase().includes("checklist"));
      const button=document.createElement("button");
      button.type="button";
      button.dataset.page="checklists";
      button.textContent="Checklists";
      if(future)future.replaceWith(button);
      else{
        const inventory=nav.querySelector('[data-page="inventory"]');
        if(inventory)inventory.insertAdjacentElement("afterend",button);else nav.appendChild(button);
      }
      button.addEventListener("click",()=>page("checklists"));
    }
    const shortcut=[...document.querySelectorAll(".shortcut-card")].find(card=>card.textContent.includes("Faire une checklist"));
    if(shortcut){
      shortcut.disabled=false;
      shortcut.classList.remove("disabled");
      shortcut.querySelector("span.muted")?.replaceChildren(document.createTextNode("Ouvrir les checklists de votre département."));
      shortcut.onclick=()=>page("checklists");
    }
  }

  function patchCore(){
    if(window.stopflow050CorePatched)return;
    window.stopflow050CorePatched=true;
    const originalPage=page;
    page=function(id){
      originalPage(id);
      if(id==="checklists"){
        document.getElementById("pageTitle").textContent="Checklists";
        refreshAll(false);
      }
    };
    const originalShowApp=showApp;
    showApp=function(){
      originalShowApp();
      setTimeout(()=>afterLogin(),0);
    };
    const originalApplyRole=applyRole;
    applyRole=function(){
      originalApplyRole();
      updateDepartmentBadge();
      installNavigation();
    };
  }

  function patchUserAdministration(){
    if(window.stopflow050UsersPatched)return;
    window.stopflow050UsersPatched=true;

    const originalInvokeUserAdmin=invokeUserAdmin;
    invokeUserAdmin=function(action,payload={}){
      if(action==="create"&&!payload.departement){
        payload={...payload,departement:document.getElementById("newUserDepartment")?.value||"salle"};
      }
      if(action==="update"&&!payload.departement){
        payload={...payload,departement:document.getElementById("editUserDepartment")?.value||"salle"};
      }
      return originalInvokeUserAdmin(action,payload);
    };

    const originalRenderUsers=renderUsers;
    renderUsers=function(){
      originalRenderUsers();
      document.querySelectorAll("[data-user-edit]").forEach(button=>{
        const user=sharedUsers.find(item=>item.id===button.dataset.userEdit);
        const roleCell=button.closest("tr")?.querySelector("td:nth-child(2)");
        if(user&&roleCell&&!roleCell.querySelector(".user-department-inline")){
          const small=document.createElement("small");
          small.className="user-department-inline";
          small.textContent=departmentLabel(user.departement);
          roleCell.appendChild(small);
        }
      });
    };

    const originalCreate=showCreateUserModal;
    showCreateUserModal=function(){
      originalCreate();
      if(document.getElementById("newUserDepartment"))return;
      const role=document.getElementById("newUserRole")?.closest(".field");
      const field=document.createElement("div");
      field.className="field";
      field.innerHTML=`<label>Département principal</label><select id="newUserDepartment" class="input">${departmentOptions("salle")}</select>`;
      role?.insertAdjacentElement("afterend",field);
      const row=role?.parentElement;if(row)row.style.gridTemplateColumns="repeat(3,minmax(0,1fr))";
    };

    const originalEdit=showEditUserModal;
    showEditUserModal=function(id){
      originalEdit(id);
      if(document.getElementById("editUserDepartment"))return;
      const user=sharedUsers.find(item=>item.id===id);
      const role=document.getElementById("editUserRole")?.closest(".field");
      const field=document.createElement("div");
      field.className="field";
      field.innerHTML=`<label>Département principal</label><select id="editUserDepartment" class="input">${departmentOptions(user?.departement||"salle")}</select>`;
      role?.insertAdjacentElement("afterend",field);
      const row=role?.parentElement;if(row)row.style.gridTemplateColumns="repeat(3,minmax(0,1fr))";
    };
  }

  function departmentOptions(selected){
    return Object.entries(DEPARTMENT_LABELS).map(([value,label])=>`<option value="${value}" ${value===selected?"selected":""}>${escapeHtml(label)}</option>`).join("");
  }

  async function afterLogin(){
    installNavigation();
    if(!cloudReady()){
      state.department=session?.role===ROLE.EMPLOYE?"salle":"bureau";
      updateDepartmentBadge();
      return;
    }
    try{
      const {data,error}=await supabaseClient.from("profiles").select("departement").eq("id",session.id).single();
      if(error)throw error;
      state.department=data?.departement||null;
      session.department=state.department;
    }catch(error){
      console.warn("Département StopFlow",error);
      state.department=null;
    }
    updateDepartmentBadge();
    if(!document.getElementById("checklists").classList.contains("hidden"))await refreshAll(false);
  }

  function updateDepartmentBadge(){
    const badge=document.querySelector(".user-department");
    if(badge)badge.textContent="Département : "+departmentLabel(state.department);
    const access=document.getElementById("checklistAccessText");
    if(access){
      access.textContent=managerAccess()?"Accès Responsable/Administrateur : tous les départements.":"Département : "+departmentLabel(state.department)+".";
    }
  }

  async function refreshAll(showMessage){
    if(!document.getElementById("checklists")||document.getElementById("checklists").classList.contains("hidden"))return;
    showChecklistHome();
    if(!cloudReady()){
      renderUnavailable("Les checklists nécessitent la connexion Supabase.");
      return;
    }
    if(!managerAccess()&&!state.department){
      renderUnavailable("Aucun département n’est attribué à ce profil. Un Administrateur doit le définir dans Utilisateurs.");
      return;
    }
    try{
      if(showMessage)document.getElementById("checklistTemplates").innerHTML='<div class="checklist-empty">Actualisation…</div>';
      await Promise.all([loadTemplates(),loadRuns(),loadSuggestions()]);
      renderHome();
    }catch(error){
      console.error("StopFlow checklists",error);
      renderUnavailable(error?.message||"Impossible de charger les checklists.");
    }
  }

  async function loadTemplates(){
    const {data,error}=await supabaseClient
      .from("checklist_templates")
      .select("id,name,department,checklist_type,version,active,description,checklist_template_items(id,item_order,section_label,label,required,input_type,help_text,active)")
      .eq("active",true)
      .order("department",{ascending:true})
      .order("checklist_type",{ascending:true});
    if(error)throw error;
    state.templates=(data||[]).map(template=>({
      ...template,
      items:(template.checklist_template_items||[]).filter(item=>item.active!==false).sort((a,b)=>a.item_order-b.item_order)
    }));
  }

  async function loadRuns(){
    const {data,error}=await supabaseClient
      .from("checklist_runs")
      .select("id,template_id,template_name,template_version,department,status,performed_by,performed_by_name,started_at,completed_at,validated_by_name,validated_at,validator_note")
      .order("started_at",{ascending:false})
      .limit(50);
    if(error)throw error;
    state.runs=data||[];
  }

  async function loadSuggestions(){
    const {data,error}=await supabaseClient
      .from("checklist_suggestions")
      .select("id,template_id,proposed_by,proposed_by_name,department,proposed_label,explanation,status,reviewed_by_name,reviewed_at,review_note,created_at")
      .order("created_at",{ascending:false})
      .limit(100);
    if(error)throw error;
    state.suggestions=data||[];
  }

  function renderUnavailable(message){
    document.getElementById("checklistTemplates").innerHTML=`<div class="checklist-empty">${escapeHtml(message)}</div>`;
    document.getElementById("checklistRuns").innerHTML="";
  }

  function renderHome(){
    updateDepartmentBadge();
    renderTemplates();
    renderRuns();
    renderSuggestionForm();
    renderManagerPanel();
  }

  function renderTemplates(){
    const box=document.getElementById("checklistTemplates");
    if(!state.templates.length){
      box.innerHTML='<div class="checklist-empty">Aucune checklist active n’est disponible pour cet accès.</div>';
      return;
    }
    box.innerHTML=state.templates.map(template=>`
      <article class="checklist-template">
        <div><h3>${escapeHtml(template.name)}</h3><div class="checklist-template-meta"><span class="checklist-pill department">${escapeHtml(departmentLabel(template.department))}</span><span class="checklist-pill">${escapeHtml(TYPE_LABELS[template.checklist_type]||template.checklist_type)}</span><span class="checklist-pill">${template.items.length} tâches</span></div></div>
        <p class="muted">${escapeHtml(template.description||"")}</p>
        <div class="flex wrap"><button class="btn primary" data-start-template="${template.id}" type="button">Commencer</button>${managerAccess()?`<button class="btn ghost" data-add-template-item="${template.id}" type="button">Ajouter une tâche</button>`:""}</div>
      </article>`).join("");
    box.querySelectorAll("[data-start-template]").forEach(button=>button.addEventListener("click",()=>startRun(button.dataset.startTemplate)));
    box.querySelectorAll("[data-add-template-item]").forEach(button=>button.addEventListener("click",()=>openAddTaskModal(button.dataset.addTemplateItem)));
  }

  function renderRuns(){
    const box=document.getElementById("checklistRuns");
    if(!state.runs.length){
      box.innerHTML='<div class="checklist-empty">Aucune exécution enregistrée.</div>';
      return;
    }
    box.innerHTML=state.runs.map(run=>`
      <div class="checklist-run-row">
        <div><b>${escapeHtml(run.template_name)}</b> <span class="badge ${run.status==="validee"?"validated":run.status==="a_controler"?"pending":"draft"}">${escapeHtml(STATUS_LABELS[run.status]||run.status)}</span><br><small class="muted">${escapeHtml(departmentLabel(run.department))} · ${escapeHtml(run.performed_by_name)} · ${escapeHtml(formatUserDate(run.started_at))}</small></div>
        <button class="btn ghost small" data-open-run="${run.id}" type="button">Ouvrir</button>
      </div>`).join("");
    box.querySelectorAll("[data-open-run]").forEach(button=>button.addEventListener("click",()=>openRun(button.dataset.openRun)));
  }

  function renderSuggestionForm(){
    const select=document.getElementById("suggestionTemplate");
    select.innerHTML=state.templates.map(template=>`<option value="${template.id}">${escapeHtml(template.name)} — ${escapeHtml(departmentLabel(template.department))}</option>`).join("");
    document.getElementById("submitChecklistSuggestion").disabled=!state.templates.length;
  }

  function renderManagerPanel(){
    const panel=document.getElementById("checklistManagerPanel");
    panel.classList.toggle("hidden",!managerAccess());
    if(!managerAccess())return;
    const pending=state.suggestions.filter(item=>item.status==="en_attente");
    const box=document.getElementById("checklistSuggestions");
    if(!pending.length){
      box.innerHTML='<div class="checklist-empty">Aucune suggestion en attente.</div>';
      return;
    }
    box.innerHTML=pending.map(item=>{
      const template=state.templates.find(t=>t.id===item.template_id);
      return `<div class="checklist-suggestion"><b>${escapeHtml(item.proposed_label)}</b><br><small class="muted">${escapeHtml(template?.name||"Checklist")} · ${escapeHtml(item.proposed_by_name)} · ${escapeHtml(formatUserDate(item.created_at))}</small>${item.explanation?`<p>${escapeHtml(item.explanation)}</p>`:""}<div class="flex wrap"><button class="btn primary small" data-accept-suggestion="${item.id}" type="button">Accepter et ajouter</button><button class="btn danger small" data-refuse-suggestion="${item.id}" type="button">Refuser</button></div></div>`;
    }).join("");
    box.querySelectorAll("[data-accept-suggestion]").forEach(button=>button.addEventListener("click",()=>reviewSuggestion(button.dataset.acceptSuggestion,true)));
    box.querySelectorAll("[data-refuse-suggestion]").forEach(button=>button.addEventListener("click",()=>reviewSuggestion(button.dataset.refuseSuggestion,false)));
  }

  async function startRun(templateId){
    const template=state.templates.find(item=>item.id===templateId);
    if(!template)return alert("Checklist introuvable.");
    if(!session.id)return alert("Une connexion Supabase est nécessaire.");
    if(!confirm(`Commencer « ${template.name} » ?`))return;
    try{
      const {data:run,error}=await supabaseClient.from("checklist_runs").insert({
        template_id:template.id,
        template_name:template.name,
        template_version:template.version,
        department:template.department,
        status:"en_cours",
        performed_by:session.id,
        performed_by_name:session.name
      }).select().single();
      if(error)throw error;
      const rows=template.items.map(item=>({
        run_id:run.id,
        template_item_id:item.id,
        item_order:item.item_order,
        section_label:item.section_label||"",
        label:item.label,
        required:item.required,
        input_type:item.input_type,
        checked:false,
        text_value:"",
        anomaly:false,
        note:""
      }));
      const {error:itemsError}=await supabaseClient.from("checklist_run_items").insert(rows);
      if(itemsError)throw itemsError;
      await openRun(run.id);
    }catch(error){
      alert("Impossible de démarrer la checklist : "+(error?.message||error));
    }
  }

  async function openRun(runId){
    try{
      const {data:run,error:runError}=await supabaseClient.from("checklist_runs").select("*").eq("id",runId).single();
      if(runError)throw runError;
      const {data:items,error:itemsError}=await supabaseClient.from("checklist_run_items").select("*").eq("run_id",runId).order("item_order",{ascending:true});
      if(itemsError)throw itemsError;
      state.activeRun=run;
      state.activeItems=items||[];
      document.getElementById("checklistHome").classList.add("hidden");
      document.getElementById("checklistRunner").classList.remove("hidden");
      renderRunner();
    }catch(error){
      alert("Impossible d’ouvrir la checklist : "+(error?.message||error));
    }
  }

  function showChecklistHome(){
    document.getElementById("checklistRunner")?.classList.add("hidden");
    document.getElementById("checklistHome")?.classList.remove("hidden");
    state.activeRun=null;
    state.activeItems=[];
  }

  function renderRunner(){
    const run=state.activeRun,items=state.activeItems;
    if(!run)return;
    document.getElementById("checklistRunTitle").textContent=run.template_name;
    document.getElementById("checklistRunMeta").textContent=`${departmentLabel(run.department)} · ${STATUS_LABELS[run.status]||run.status} · commencé par ${run.performed_by_name} le ${formatUserDate(run.started_at)}`;
    const completed=items.filter(item=>item.checked).length;
    const required=items.filter(item=>item.required).length;
    const requiredDone=items.filter(item=>item.required&&item.checked).length;
    document.getElementById("checklistProgressText").textContent=`${completed} / ${items.length} tâches cochées`;
    document.getElementById("checklistRequiredText").textContent=`Obligatoires : ${requiredDone} / ${required}`;
    document.getElementById("checklistProgressBar").style.width=(items.length?Math.round(completed/items.length*100):0)+"%";

    const editable=run.status==="en_cours"&&(run.performed_by===session.id||managerAccess());
    const groups=[];
    for(const item of items){
      const label=item.section_label||"Tâches";
      let group=groups.find(entry=>entry.label===label);
      if(!group){group={label,items:[]};groups.push(group)}
      group.items.push(item);
    }
    document.getElementById("checklistRunItems").innerHTML=groups.map(group=>`
      <section class="checklist-section"><div class="checklist-section-title">${escapeHtml(group.label)}</div>${group.items.map(item=>renderRunItem(item,editable)).join("")}</section>`).join("");

    document.querySelectorAll("[data-run-check]").forEach(input=>input.addEventListener("change",()=>updateRunItem(input.dataset.runCheck,{checked:input.checked})));
    document.querySelectorAll("[data-run-anomaly]").forEach(button=>button.addEventListener("click",()=>toggleAnomaly(button.dataset.runAnomaly)));
    document.querySelectorAll("[data-run-note]").forEach(textarea=>textarea.addEventListener("change",()=>updateRunItem(textarea.dataset.runNote,{note:textarea.value})));

    const actions=document.getElementById("checklistRunnerActions");
    actions.innerHTML="";
    if(editable){
      const complete=document.createElement("button");
      complete.className="btn primary";complete.type="button";complete.textContent="Terminer et envoyer au contrôle";complete.addEventListener("click",completeRun);actions.appendChild(complete);
    }
    if(managerAccess()&&run.status==="a_controler"){
      const validate=document.createElement("button");
      validate.className="btn primary";validate.type="button";validate.textContent="Valider la checklist";validate.addEventListener("click",validateRun);actions.appendChild(validate);
      const follow=document.createElement("button");
      follow.className="btn danger";follow.type="button";follow.textContent="Demander un suivi";follow.addEventListener("click",markFollowUp);actions.appendChild(follow);
    }
  }

  function renderRunItem(item,editable){
    return `<div class="checklist-item ${item.checked?"done":""}" data-run-item="${item.id}">
      <div class="checklist-item-main"><input type="checkbox" data-run-check="${item.id}" ${item.checked?"checked":""} ${editable?"":"disabled"}><div><span class="checklist-item-label">${escapeHtml(item.label)}</span>${item.required?"":'<span class="checklist-pill optional" style="margin-left:6px">Conditionnelle</span>'}${item.help_text?`<small class="checklist-item-help">${escapeHtml(item.help_text)}</small>`:""}</div></div>
      <div class="checklist-item-actions"><button class="btn small ${item.anomaly?"danger":"ghost"}" data-run-anomaly="${item.id}" type="button" ${editable?"":"disabled"}>${item.anomaly?"Anomalie signalée":"Signaler"}</button></div>
    </div>${item.anomaly?`<div class="checklist-anomaly"><b>Anomalie ou remarque</b><textarea class="input" data-run-note="${item.id}" ${editable?"":"disabled"} placeholder="Décrire le problème et l’action nécessaire">${escapeHtml(item.note||"")}</textarea></div>`:""}`;
  }

  async function updateRunItem(itemId,changes){
    const item=state.activeItems.find(entry=>entry.id===itemId);
    if(!item)return;
    Object.assign(item,changes);
    renderRunner();
    const {error}=await supabaseClient.from("checklist_run_items").update(changes).eq("id",itemId);
    if(error){alert("Modification non enregistrée : "+error.message);await openRun(state.activeRun.id)}
  }

  function toggleAnomaly(itemId){
    const item=state.activeItems.find(entry=>entry.id===itemId);
    if(item)updateRunItem(itemId,{anomaly:!item.anomaly,note:item.note||""});
  }

  async function completeRun(){
    const missing=state.activeItems.filter(item=>item.required&&!item.checked);
    if(missing.length){
      alert(`${missing.length} tâche(s) obligatoire(s) ne sont pas cochée(s).`);
      return;
    }
    if(!confirm("Terminer cette checklist et l’envoyer au contrôle ?"))return;
    const {error}=await supabaseClient.from("checklist_runs").update({status:"a_controler",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",state.activeRun.id);
    if(error)return alert(error.message);
    await openRun(state.activeRun.id);
  }

  async function validateRun(){
    const note=prompt("Note de validation facultative :",state.activeRun.validator_note||"");
    if(note===null)return;
    const {error}=await supabaseClient.from("checklist_runs").update({status:"validee",validated_by:session.id,validated_by_name:session.name,validated_at:new Date().toISOString(),validator_note:note,updated_at:new Date().toISOString()}).eq("id",state.activeRun.id);
    if(error)return alert(error.message);
    await openRun(state.activeRun.id);
  }

  async function markFollowUp(){
    const note=prompt("Quel suivi est nécessaire ?");
    if(!note)return;
    const {error}=await supabaseClient.from("checklist_runs").update({status:"suivi_necessaire",validated_by:session.id,validated_by_name:session.name,validated_at:new Date().toISOString(),validator_note:note,updated_at:new Date().toISOString()}).eq("id",state.activeRun.id);
    if(error)return alert(error.message);
    await openRun(state.activeRun.id);
  }

  async function submitSuggestion(){
    const template=state.templates.find(item=>item.id===document.getElementById("suggestionTemplate").value);
    const label=document.getElementById("suggestionLabel").value.trim();
    const explanation=document.getElementById("suggestionExplanation").value.trim();
    if(!template||!label)return alert("Choisissez une checklist et indiquez la tâche proposée.");
    const {error}=await supabaseClient.from("checklist_suggestions").insert({
      template_id:template.id,
      proposed_by:session.id,
      proposed_by_name:session.name,
      department:template.department,
      proposed_label:label,
      explanation,
      status:"en_attente"
    });
    if(error)return alert("Suggestion non enregistrée : "+error.message);
    document.getElementById("suggestionLabel").value="";
    document.getElementById("suggestionExplanation").value="";
    alert("Suggestion envoyée.");
    await refreshAll(false);
  }

  async function reviewSuggestion(id,accept){
    const suggestion=state.suggestions.find(item=>item.id===id);
    const template=state.templates.find(item=>item.id===suggestion?.template_id);
    if(!suggestion||!template)return;
    const note=prompt(accept?"Section de la nouvelle tâche :":"Motif du refus :",accept?"Ajouts validés":"");
    if(note===null)return;
    try{
      if(accept){
        const nextOrder=Math.max(0,...template.items.map(item=>Number(item.item_order)||0))+1;
        const {error:itemError}=await supabaseClient.from("checklist_template_items").insert({
          template_id:template.id,
          item_order:nextOrder,
          section_label:note.trim()||"Ajouts validés",
          label:suggestion.proposed_label,
          required:true,
          input_type:"checkbox",
          help_text:suggestion.explanation||"",
          active:true
        });
        if(itemError)throw itemError;
      }
      const {error}=await supabaseClient.from("checklist_suggestions").update({
        status:accept?"acceptee":"refusee",
        reviewed_by:session.id,
        reviewed_by_name:session.name,
        reviewed_at:new Date().toISOString(),
        review_note:note
      }).eq("id",id);
      if(error)throw error;
      await refreshAll(false);
    }catch(error){alert("Traitement impossible : "+error.message)}
  }

  function openAddTaskModal(templateId){
    const template=state.templates.find(item=>item.id===templateId);
    if(!template)return;
    document.getElementById("modalBox").innerHTML=`
      <div class="flex between"><div><h2>Ajouter une tâche</h2><p class="muted">${escapeHtml(template.name)}</p></div><button class="btn ghost" id="closeModal">Fermer</button></div>
      <div class="field"><label>Section</label><input class="input" id="directTaskSection" value="Ajouts validés"></div>
      <div class="field" style="margin-top:10px"><label>Tâche</label><textarea class="input" id="directTaskLabel"></textarea></div>
      <label class="input" style="margin-top:10px"><input type="checkbox" id="directTaskRequired" checked> Tâche obligatoire</label>
      <button class="btn primary" id="saveDirectTask" style="margin-top:14px">Ajouter au modèle</button>`;
    document.getElementById("modal").classList.remove("hidden");
    document.getElementById("closeModal").onclick=()=>document.getElementById("modal").classList.add("hidden");
    document.getElementById("saveDirectTask").onclick=async()=>{
      const label=document.getElementById("directTaskLabel").value.trim();
      if(!label)return alert("La tâche est obligatoire.");
      const nextOrder=Math.max(0,...template.items.map(item=>Number(item.item_order)||0))+1;
      const {error}=await supabaseClient.from("checklist_template_items").insert({template_id:template.id,item_order:nextOrder,section_label:document.getElementById("directTaskSection").value.trim()||"Ajouts validés",label,required:document.getElementById("directTaskRequired").checked,input_type:"checkbox",help_text:"",active:true});
      if(error)return alert(error.message);
      document.getElementById("modal").classList.add("hidden");
      await refreshAll(false);
    };
  }

  function openCreateTemplateModal(){
    document.getElementById("modalBox").innerHTML=`
      <div class="flex between"><div><h2>Créer un modèle de checklist</h2><p class="muted">Le modèle sera immédiatement disponible pour le département choisi.</p></div><button class="btn ghost" id="closeModal">Fermer</button></div>
      <div class="field"><label>Nom</label><input class="input" id="newChecklistName" placeholder="Ex. Nettoyage hebdomadaire"></div>
      <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:10px"><div class="field"><label>Département</label><select class="input" id="newChecklistDepartment">${departmentOptions("nettoyage")}</select></div><div class="field"><label>Type</label><select class="input" id="newChecklistType"><option value="ouverture">Ouverture</option><option value="fermeture">Fermeture</option><option value="controle" selected>Contrôle</option><option value="autre">Autre</option></select></div></div>
      <div class="field"><label>Description</label><textarea class="input" id="newChecklistDescription"></textarea></div>
      <button class="btn primary" id="saveChecklistTemplate" style="margin-top:14px">Créer le modèle</button>`;
    document.getElementById("modal").classList.remove("hidden");
    document.getElementById("closeModal").onclick=()=>document.getElementById("modal").classList.add("hidden");
    document.getElementById("saveChecklistTemplate").onclick=async()=>{
      const name=document.getElementById("newChecklistName").value.trim();
      if(!name)return alert("Le nom est obligatoire.");
      const {error}=await supabaseClient.from("checklist_templates").insert({name,department:document.getElementById("newChecklistDepartment").value,checklist_type:document.getElementById("newChecklistType").value,version:1,active:true,description:document.getElementById("newChecklistDescription").value.trim(),created_by:session.id});
      if(error)return alert(error.message);
      document.getElementById("modal").classList.add("hidden");
      await refreshAll(false);
    };
  }

  function initialize(){
    if(state.installed)return;
    if(typeof page!=="function"||typeof applyRole!=="function"||typeof showApp!=="function"||typeof renderUsers!=="function"||typeof invokeUserAdmin!=="function"){
      setTimeout(initialize,50);
      return;
    }
    state.installed=true;
    injectStyles();
    installPage();
    patchCore();
    patchUserAdministration();
    installNavigation();
    setTimeout(installNavigation,150);
    setTimeout(installNavigation,600);
    if(!document.getElementById("app").classList.contains("hidden"))afterLogin();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);else initialize();
  window.addEventListener("load",initialize);
})();
