/* StopFlow 0.6.0 — utilisateurs autorisés dans plusieurs départements. */
(function(){
  const S=window.SF54;
  if(!S||window.stopflow060MultiDepartments)return;
  window.stopflow060MultiDepartments=true;

  const DEPARTMENTS=["salle","cuisine","nettoyage"];
  const LABELS={salle:"Salle",cuisine:"Cuisine",nettoyage:"Entretien & hygiène",bureau:"Bureau"};
  const esc=value=>typeof escapeUserHtml==="function"?escapeUserHtml(value):String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const isManager=()=>typeof isResponsible==="function"&&isResponsible();
  const valid=value=>DEPARTMENTS.includes(String(value||"").toLowerCase());
  const allowed=()=>isManager()?[...DEPARTMENTS]:[...new Set((session?.departments||[]).filter(valid))];

  function departmentText(values,primary){
    const list=(values||[]).filter(valid);
    if(!list.length)return isManager()?"Tous les départements":"Aucun département";
    return list.map(code=>`${LABELS[code]}${code===primary?" (principal)":""}`).join(" · ");
  }

  function renderAccessVisibility(){
    const access=allowed();
    document.querySelectorAll(".sf52-nav-group").forEach(group=>{
      const id=group.querySelector(".sf52-nav-group-toggle")?.dataset.group;
      if(valid(id))group.classList.toggle("hidden",!isManager()&&!access.includes(id));
    });
    document.querySelectorAll(".sf53-group").forEach(group=>{
      const id=group.dataset.group;
      if(valid(id))group.classList.toggle("hidden",!isManager()&&!access.includes(id));
    });
    const card=document.querySelector(".usercard");
    if(card){
      let line=card.querySelector(".sf60-user-departments");
      if(!line){line=document.createElement("small");line.className="sf60-user-departments";line.style.cssText="display:block;color:#b9cce0;font-size:10px;margin-top:2px;line-height:1.25";card.querySelector("div")?.appendChild(line)}
      line.textContent=departmentText(access,session?.department||session?.departement);
    }
    const loginVersion=[...document.querySelectorAll("#login .muted")].find(node=>node.textContent.includes("Version"));
    if(loginVersion)loginVersion.textContent="Version 0.6.0 — Accès multi-départements";
    document.querySelectorAll(".version-pill").forEach(node=>node.textContent="StopFlow 0.6.0");
  }

  async function loadSessionDepartments(){
    if(!session)return;
    if(isManager()){
      session.departments=[...DEPARTMENTS];
      S.can=department=>S.manager()||session.departments.includes(department);
      renderAccessVisibility();
      return;
    }
    if(!S.cloud()||!session.id){
      const primary=String(session.department||session.departement||"").toLowerCase();
      session.departments=valid(primary)?[primary]:[];
      S.can=department=>S.manager()||session.departments.includes(department);
      renderAccessVisibility();
      return;
    }
    const {data,error}=await supabaseClient.from("profile_departments").select("department,is_primary").eq("profile_id",session.id);
    if(error){console.warn("StopFlow 0.6.0 — départements utilisateur indisponibles",error);return}
    const departments=(data||[]).map(row=>row.department).filter(valid);
    const primary=(data||[]).find(row=>row.is_primary)?.department||session.department||session.departement;
    session.departments=[...new Set(departments)];
    if(valid(primary)){session.department=primary;session.departement=primary}
    S.can=department=>S.manager()||session.departments.includes(department);
    renderAccessVisibility();
    try{S.render()}catch{}
  }

  const previousEnsure=S.ensureSessionDepartment;
  S.ensureSessionDepartment=async function(){
    if(typeof previousEnsure==="function")await previousEnsure();
    await loadSessionDepartments();
  };

  function controlsHtml(prefix,user={}){
    const selected=(Array.isArray(user.departments)&&user.departments.length?user.departments:[user.departement]).filter(valid);
    const primary=valid(user.departement)?user.departement:(selected[0]||"cuisine");
    return `<div class="sf60-access-block" data-sf60-prefix="${prefix}" style="margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:12px;background:#f8fafc">
      <div class="flex between wrap"><div><b>Départements autorisés</b><div class="muted" style="font-size:12px">Plusieurs cases peuvent être cochées.</div></div><span class="badge draft sf60-global-access hidden">Accès global</span></div>
      <div class="sf60-department-checks" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px">
        ${DEPARTMENTS.map(code=>`<label class="input" style="display:flex;gap:7px;align-items:center;padding:10px"><input type="checkbox" data-sf60-department="${code}" ${selected.includes(code)?"checked":""}> ${LABELS[code]}</label>`).join("")}
      </div>
      <div class="field sf60-primary-field" style="margin-top:12px"><label>Département principal</label><select class="input sf60-primary">${DEPARTMENTS.map(code=>`<option value="${code}" ${code===primary?"selected":""}>${LABELS[code]}</option>`).join("")}</select><small class="muted">Utilisé comme écran de départ après la connexion.</small></div>
      <div class="sf60-manager-note hidden muted" style="margin-top:10px">Les Responsables et Administrateurs disposent automatiquement de tous les départements.</div>
    </div>`;
  }

  function refreshControls(prefix){
    const block=document.querySelector(`.sf60-access-block[data-sf60-prefix="${prefix}"]`);
    if(!block)return;
    const role=document.querySelector(`#${prefix}UserRole`)?.value||"employe";
    const employee=role==="employe";
    block.querySelector(".sf60-department-checks")?.classList.toggle("hidden",!employee);
    block.querySelector(".sf60-primary-field")?.classList.toggle("hidden",!employee);
    block.querySelector(".sf60-manager-note")?.classList.toggle("hidden",employee);
    block.querySelector(".sf60-global-access")?.classList.toggle("hidden",employee);
    if(!employee)return;
    const checked=[...block.querySelectorAll("[data-sf60-department]:checked")].map(input=>input.dataset.sf60Department);
    const select=block.querySelector(".sf60-primary");
    const previous=select.value;
    select.innerHTML=checked.map(code=>`<option value="${code}">${LABELS[code]}</option>`).join("");
    if(checked.includes(previous))select.value=previous;
  }

  function injectControls(prefix,user={}){
    if(document.querySelector(`.sf60-access-block[data-sf60-prefix="${prefix}"]`))return;
    const role=document.querySelector(`#${prefix}UserRole`);
    const anchor=role?.closest(".filters")||role?.closest(".field");
    if(!anchor)return;
    anchor.insertAdjacentHTML("afterend",controlsHtml(prefix,user));
    const block=document.querySelector(`.sf60-access-block[data-sf60-prefix="${prefix}"]`);
    role.addEventListener("change",()=>refreshControls(prefix));
    block.querySelectorAll("[data-sf60-department]").forEach(input=>input.addEventListener("change",()=>refreshControls(prefix)));
    refreshControls(prefix);
  }

  function readAccess(prefix,role){
    if(role!=="employe")return {departement:"bureau",departments:[]};
    const block=document.querySelector(`.sf60-access-block[data-sf60-prefix="${prefix}"]`);
    const departments=[...block.querySelectorAll("[data-sf60-department]:checked")].map(input=>input.dataset.sf60Department);
    const departement=block.querySelector(".sf60-primary")?.value||"";
    if(!departments.length)throw new Error("Coche au moins un département.");
    if(!departments.includes(departement))throw new Error("Le département principal doit faire partie des cases cochées.");
    return {departement,departments};
  }

  function annotateUserRows(){
    document.querySelectorAll("[data-user-edit]").forEach(button=>{
      const user=sharedUsers.find(item=>item.id===button.dataset.userEdit);
      const row=button.closest("tr");
      const cell=row?.children?.[1];
      if(!user||!cell||cell.querySelector(".sf60-user-row-departments"))return;
      const details=document.createElement("small");
      details.className="muted sf60-user-row-departments";
      details.style.display="block";
      details.textContent=user.role==="employe"?departmentText(user.departments,user.departement):"Tous les départements";
      cell.appendChild(details);
    });
  }

  if(typeof renderUsers==="function"){
    const previousRenderUsers=renderUsers;
    renderUsers=function(){previousRenderUsers();annotateUserRows()};
  }

  if(typeof showCreateUserModal==="function"){
    const previousCreate=showCreateUserModal;
    showCreateUserModal=function(){
      previousCreate();
      injectControls("new",{departement:"cuisine",departments:["cuisine"]});
      const button=document.querySelector("#createUserButton");
      if(!button)return;
      button.onclick=async()=>{
        const payload={email:document.querySelector("#newUserEmail").value.trim().toLowerCase(),prenom:document.querySelector("#newUserFirstName").value.trim(),nom:document.querySelector("#newUserLastName").value.trim(),role:document.querySelector("#newUserRole").value,password:document.querySelector("#newUserPassword").value};
        if(!payload.email)return alert("L’adresse e-mail est obligatoire.");
        if(!payload.prenom||!payload.nom)return alert("Le prénom et le nom sont obligatoires.");
        if(payload.password.length<10)return alert("Le mot de passe temporaire doit contenir au moins 10 caractères.");
        try{Object.assign(payload,readAccess("new",payload.role))}catch(error){return alert(error.message)}
        button.disabled=true;button.textContent="Création…";
        try{
          await invokeUserAdmin("create",payload);await loadSharedUsers();renderUsers();
          document.querySelector("#modalBox").innerHTML=`<h2>Compte créé</h2><p>Le compte <b>${esc(payload.email)}</b> est actif avec le rôle <b>${esc(userRoleLabel(payload.role))}</b>.</p><div class="notice"><b>Départements</b><br>${esc(payload.role==="employe"?departmentText(payload.departments,payload.departement):"Tous les départements")}</div><div class="notice" style="margin-top:10px"><b>Mot de passe temporaire</b><div class="flex" style="margin-top:8px"><code id="createdTemporaryPassword" style="font-size:17px;word-break:break-all">${esc(payload.password)}</code><button class="btn ghost" id="copyCreatedPassword">Copier</button></div></div><button class="btn primary" id="finishUserCreation" style="margin-top:14px">Terminer</button>`;
          document.querySelector("#copyCreatedPassword").onclick=async()=>{await navigator.clipboard.writeText(payload.password);document.querySelector("#copyCreatedPassword").textContent="Copié"};
          document.querySelector("#finishUserCreation").onclick=()=>document.querySelector("#modal").classList.add("hidden");
        }catch(error){alert(userAdminErrorMessage(error));button.disabled=false;button.textContent="Créer le compte"}
      };
    };
  }

  if(typeof showEditUserModal==="function"){
    const previousEdit=showEditUserModal;
    showEditUserModal=function(id){
      previousEdit(id);
      const user=sharedUsers.find(item=>item.id===id);if(!user)return;
      injectControls("edit",user);
      const button=document.querySelector("#saveUserButton");if(!button)return;
      button.onclick=async()=>{
        const protectedAccount=user.protege===true;
        const actif=protectedAccount?user.actif:document.querySelector("#editUserActive").checked;
        if(user.actif&&!actif&&!confirm("Désactiver ce compte ? La personne ne pourra plus se connecter à StopFlow."))return;
        const payload={id:user.id,prenom:document.querySelector("#editUserFirstName").value.trim(),nom:document.querySelector("#editUserLastName").value.trim(),role:protectedAccount?user.role:document.querySelector("#editUserRole").value,actif};
        try{Object.assign(payload,readAccess("edit",payload.role))}catch(error){return alert(error.message)}
        button.disabled=true;button.textContent="Enregistrement…";
        try{await invokeUserAdmin("update",payload);await loadSharedUsers();renderUsers();document.querySelector("#modal").classList.add("hidden");alert("Utilisateur et départements mis à jour.")}
        catch(error){alert(userAdminErrorMessage(error));button.disabled=false;button.textContent="Enregistrer"}
      };
    };
  }

  if(typeof showApp==="function"){
    const previousShowApp=showApp;
    showApp=function(){previousShowApp();setTimeout(loadSessionDepartments,0);setTimeout(loadSessionDepartments,700)};
  }

  const style=document.createElement("style");
  style.textContent="@media(max-width:620px){.sf60-department-checks{grid-template-columns:1fr!important}}";
  document.head.appendChild(style);

  let attempts=0;
  const timer=setInterval(()=>{
    renderAccessVisibility();
    if(document.querySelector("#app")&&!document.querySelector("#app").classList.contains("hidden"))loadSessionDepartments();
    if(++attempts>20)clearInterval(timer);
  },350);
})();
