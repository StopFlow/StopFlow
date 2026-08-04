/* StopFlow — gestion sécurisée des utilisateurs via l’Edge Function Supabase. */

let sharedUsers=[];

function userAdminErrorMessage(error,fallback="Opération impossible sur les utilisateurs."){
  const message=String(error?.message||error?.details||error?.hint||"").trim();
  if(!message)return fallback;
  if(message.includes("already been registered")||message.includes("already registered"))return "Un compte existe déjà avec cette adresse e-mail.";
  if(message.includes("reserved")||message.includes("proteg")||message.includes("principal"))return message;
  if(message.includes("JWT")||message.includes("Session invalide"))return "Votre session a expiré. Reconnectez-vous.";
  return message;
}

function escapeUserHtml(value){
  return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}

function userRoleLabel(role){
  return {admin:"Administrateur",responsable:"Responsable",employe:"Employé"}[String(role||"").toLowerCase()]||role||"—";
}

function formatUserDate(value){
  if(!value)return "Jamais";
  try{return fmt(value)}catch{return "—"}
}

async function invokeUserAdmin(action,payload={}){
  if(!isCloudMode()||!supabaseClient)throw new Error("La gestion des utilisateurs nécessite la connexion Supabase.");
  if(!canManageUsers())throw new Error("Cette action est réservée à l’Administrateur.");
  const {data,error}=await supabaseClient.functions.invoke("manage-users",{body:{action,...payload}});
  if(error){
    let detail="";
    try{detail=(await error.context?.json?.())?.error||""}catch{}
    throw new Error(detail||error.message||"Edge Function indisponible.");
  }
  if(data?.error)throw new Error(data.error);
  return data;
}

async function loadSharedUsers(){
  if(!canManageUsers())return [];
  const result=await invokeUserAdmin("list");
  sharedUsers=Array.isArray(result.users)?result.users:[];
  return sharedUsers;
}

function userFullName(user){
  return [user.prenom,user.nom].filter(Boolean).join(" ").trim()||"—";
}

function renderUsers(){
  if(!canManageUsers())return;
  const search=String($("#userSearch")?.value||"").trim().toLowerCase();
  const rows=sharedUsers.filter(user=>!search||JSON.stringify(user).toLowerCase().includes(search));
  const active=sharedUsers.filter(user=>user.actif).length;
  const employees=sharedUsers.filter(user=>user.role==="employe"&&user.actif).length;
  const responsibles=sharedUsers.filter(user=>user.role==="responsable"&&user.actif).length;
  const admins=sharedUsers.filter(user=>user.role==="admin"&&user.actif).length;
  if($("#userStatActive"))$("#userStatActive").textContent=active;
  if($("#userStatEmployees"))$("#userStatEmployees").textContent=employees;
  if($("#userStatResponsibles"))$("#userStatResponsibles").textContent=responsibles;
  if($("#userStatAdmins"))$("#userStatAdmins").textContent=admins;
  $("#userRows").innerHTML=rows.length?rows.map(user=>`<tr>
    <td><b>${escapeUserHtml(userFullName(user))}</b><br><small class="muted">${escapeUserHtml(user.email)}</small></td>
    <td>${escapeUserHtml(userRoleLabel(user.role))}</td>
    <td><span class="badge ${user.actif?"validated":"cancelled"}">${user.actif?"Actif":"Désactivé"}</span></td>
    <td>${user.emailConfirmee?"Confirmée":"À confirmer"}</td>
    <td>${escapeUserHtml(formatUserDate(user.derniereConnexion))}</td>
    <td><button class="btn small ghost" data-user-edit="${escapeUserHtml(user.id)}">Modifier</button></td>
  </tr>`).join(""):`<tr><td colspan="6" class="muted">Aucun utilisateur trouvé.</td></tr>`;
  $$("[data-user-edit]").forEach(button=>button.onclick=()=>showEditUserModal(button.dataset.userEdit));
  if($("#addUser"))$("#addUser").onclick=showCreateUserModal;
}

function generateTemporaryPassword(){
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values=new Uint32Array(16);
  crypto.getRandomValues(values);
  return [...values].map(value=>alphabet[value%alphabet.length]).join("");
}

function showCreateUserModal(){
  if(!canManageUsers())return alert("Action non autorisée.");
  const temporaryPassword=generateTemporaryPassword();
  $("#modalBox").innerHTML=`
    <div class="flex between"><div><h2>Ajouter un utilisateur</h2><p class="muted">Le compte sera actif et son adresse e-mail sera confirmée immédiatement.</p></div><button class="btn ghost" id="closeModal">Fermer</button></div>
    <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:14px">
      <div class="field"><label>Prénom</label><input id="newUserFirstName" class="input" autocomplete="off"></div>
      <div class="field"><label>Nom</label><input id="newUserLastName" class="input" autocomplete="off"></div>
    </div>
    <div class="field"><label>Adresse e-mail</label><input id="newUserEmail" class="input" type="email" autocomplete="off"></div>
    <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:14px">
      <div class="field"><label>Rôle</label><select id="newUserRole" class="input"><option value="employe">Employé</option><option value="responsable">Responsable</option><option value="admin">Administrateur</option></select></div>
      <div class="field"><label>Mot de passe temporaire</label><div class="flex"><input id="newUserPassword" class="input" style="width:100%" value="${temporaryPassword}" autocomplete="new-password"><button class="btn ghost" id="generateUserPassword" type="button">Générer</button></div></div>
    </div>
    <div class="notice" style="margin-top:14px">Le mot de passe sera affiché une seule fois après la création. Il devra être communiqué personnellement à l’utilisateur.</div>
    <button class="btn primary" id="createUserButton" style="margin-top:16px">Créer le compte</button>`;
  $("#modal").classList.remove("hidden");
  $("#closeModal").onclick=()=>$("#modal").classList.add("hidden");
  $("#generateUserPassword").onclick=()=>$("#newUserPassword").value=generateTemporaryPassword();
  $("#createUserButton").onclick=async()=>{
    const button=$("#createUserButton");
    const payload={
      email:$("#newUserEmail").value.trim().toLowerCase(),
      prenom:$("#newUserFirstName").value.trim(),
      nom:$("#newUserLastName").value.trim(),
      role:$("#newUserRole").value,
      password:$("#newUserPassword").value
    };
    if(!payload.email)return alert("L’adresse e-mail est obligatoire.");
    if(payload.password.length<10)return alert("Le mot de passe temporaire doit contenir au moins 10 caractères.");
    button.disabled=true;button.textContent="Création…";
    try{
      await invokeUserAdmin("create",payload);
      await loadSharedUsers();
      renderUsers();
      const email=escapeUserHtml(payload.email),password=escapeUserHtml(payload.password);
      $("#modalBox").innerHTML=`<h2>Compte créé</h2><p>Le compte <b>${email}</b> est actif avec le rôle <b>${escapeUserHtml(userRoleLabel(payload.role))}</b>.</p>
      <div class="notice"><b>Mot de passe temporaire</b><div class="flex" style="margin-top:8px"><code id="createdTemporaryPassword" style="font-size:17px;word-break:break-all">${password}</code><button class="btn ghost" id="copyCreatedPassword">Copier</button></div></div>
      <p class="muted">Communiquez ces identifiants à la personne par un canal privé.</p><button class="btn primary" id="finishUserCreation">Terminer</button>`;
      $("#copyCreatedPassword").onclick=async()=>{await navigator.clipboard.writeText(payload.password);$("#copyCreatedPassword").textContent="Copié"};
      $("#finishUserCreation").onclick=()=>$("#modal").classList.add("hidden");
    }catch(error){alert(userAdminErrorMessage(error));button.disabled=false;button.textContent="Créer le compte"}
  };
}

function showEditUserModal(id){
  const user=sharedUsers.find(item=>item.id===id);
  if(!user)return alert("Utilisateur introuvable.");
  const protectedAccount=user.protege===true;
  $("#modalBox").innerHTML=`
    <div class="flex between"><div><h2>Modifier l’utilisateur</h2><p class="muted">${escapeUserHtml(user.email)}</p></div><button class="btn ghost" id="closeModal">Fermer</button></div>
    ${protectedAccount?`<div class="notice">Compte principal protégé : son rôle et son activation ne peuvent pas être modifiés.</div>`:""}
    <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:14px">
      <div class="field"><label>Prénom</label><input id="editUserFirstName" class="input" value="${escapeUserHtml(user.prenom)}"></div>
      <div class="field"><label>Nom</label><input id="editUserLastName" class="input" value="${escapeUserHtml(user.nom)}"></div>
    </div>
    <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:14px">
      <div class="field"><label>Rôle</label><select id="editUserRole" class="input" ${protectedAccount?"disabled":""}><option value="employe" ${user.role==="employe"?"selected":""}>Employé</option><option value="responsable" ${user.role==="responsable"?"selected":""}>Responsable</option><option value="admin" ${user.role==="admin"?"selected":""}>Administrateur</option></select></div>
      <div class="field"><label>Statut</label><label class="input"><input id="editUserActive" type="checkbox" ${user.actif?"checked":""} ${protectedAccount?"disabled":""}> Compte actif</label></div>
    </div>
    <button class="btn primary" id="saveUserButton" style="margin-top:16px">Enregistrer</button>`;
  $("#modal").classList.remove("hidden");
  $("#closeModal").onclick=()=>$("#modal").classList.add("hidden");
  $("#saveUserButton").onclick=async()=>{
    const button=$("#saveUserButton");
    const actif=protectedAccount?user.actif:$("#editUserActive").checked;
    if(user.actif&&!actif&&!confirm("Désactiver ce compte ? La personne ne pourra plus se connecter à StopFlow."))return;
    const payload={
      id:user.id,
      prenom:$("#editUserFirstName").value.trim(),
      nom:$("#editUserLastName").value.trim(),
      role:protectedAccount?user.role:$("#editUserRole").value,
      actif
    };
    button.disabled=true;button.textContent="Enregistrement…";
    try{
      await invokeUserAdmin("update",payload);
      await loadSharedUsers();
      renderUsers();
      $("#modal").classList.add("hidden");
      alert("Utilisateur mis à jour.");
    }catch(error){alert(userAdminErrorMessage(error));button.disabled=false;button.textContent="Enregistrer"}
  };
}

if(typeof STOPFLOW_STABLE_PAGES!=="undefined")STOPFLOW_STABLE_PAGES.add("users");

/* StopFlow 0.4.0 — architecture générale, sans migration Supabase. */
(function(){
  const futureModules={
    operations:["Commandes","Checklists","Températures","Signalements"],
    kitchen:["Lunches","Fiches plats","Photos"],
    documents:["Règlement de travail","Procédures","Fiches internes","Consignes"],
    activity:["Rapports","Validations","Alertes"]
  };

  function injectArchitectureStyles(){
    if(document.getElementById("stopflow040Styles"))return;
    const style=document.createElement("style");
    style.id="stopflow040Styles";
    style.textContent=`
      .sidebar{overflow-y:auto;padding-bottom:105px}.nav{gap:3px}.nav-section{margin:15px 12px 5px;color:#8fb0ce;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.nav-section:first-child{margin-top:3px}.nav button{padding:9px 12px}.nav button.future-module{opacity:.5;cursor:not-allowed}.nav button.future-module:hover{background:transparent;color:#dbe7f4}.version-pill{display:inline-flex;margin-top:8px;padding:4px 8px;border-radius:999px;background:#eaf1ff;color:#2457a7;font-size:11px;font-weight:800}.shortcut-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:15px}.shortcut-card{border:1px solid var(--line);background:#fff;border-radius:13px;padding:16px;text-align:left;min-height:102px}.shortcut-card strong{display:block;margin-bottom:7px}.shortcut-card:not(.disabled):hover{border-color:#9dbbff;box-shadow:0 7px 22px rgba(36,99,235,.1)}.shortcut-card.disabled{opacity:.55;cursor:not-allowed}.architecture-note{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:15px}.architecture-note>div{padding:13px;border:1px solid var(--line);border-radius:11px;background:#f8fafc}.architecture-note b{display:block;margin-bottom:4px}.user-department{display:block;color:#b9cce0;font-size:11px;margin-top:2px}@media(max-width:950px){.architecture-note{grid-template-columns:1fr}.sidebar{padding-bottom:24px}}`;
    document.head.appendChild(style);
  }

  function futureButton(label){
    const button=document.createElement("button");
    button.type="button";
    button.className="future-module";
    button.disabled=true;
    button.textContent="○ "+label;
    button.title="Module préparé dans l’architecture 0.4.0 — développement ultérieur";
    return button;
  }

  function section(title,buttons){
    const fragment=document.createDocumentFragment();
    const heading=document.createElement("div");
    heading.className="nav-section";
    heading.textContent=title;
    fragment.appendChild(heading);
    buttons.filter(Boolean).forEach(button=>fragment.appendChild(button));
    return fragment;
  }

  function findNavButton(nav,page,text){
    return nav.querySelector(`[data-page="${page}"]`)||[...nav.querySelectorAll("button")].find(button=>button.textContent.toLowerCase().includes(text.toLowerCase()));
  }

  function reorganizeNavigation(){
    const nav=document.querySelector(".sidebar .nav");
    if(!nav||nav.dataset.architectureVersion==="0.4.0")return;
    const dashboard=findNavButton(nav,"dashboard","Accueil");
    const inventory=findNavButton(nav,"inventory","Inventaire");
    const history=findNavButton(nav,"history","Historique");
    const articles=findNavButton(nav,"articles","Articles");
    const suggestions=findNavButton(nav,"suggestions","Suggestions");
    const settings=findNavButton(nav,"settings","Paramètres");
    const suppliers=findNavButton(nav,"suppliers","Fournisseurs");
    const users=findNavButton(nav,"users","Utilisateurs");
    if(inventory)inventory.textContent="▣ Inventaires";
    if(suggestions)suggestions.textContent="◌ Suggestions mensuelles";
    nav.replaceChildren();
    nav.appendChild(section("Accueil",[dashboard]));
    nav.appendChild(section("Opérations",[inventory,...futureModules.operations.map(futureButton)]));
    nav.appendChild(section("Cuisine & carte",[futureButton("Lunches"),suggestions,futureButton("Fiches plats"),futureButton("Photos")]));
    nav.appendChild(section("Documents",futureModules.documents.map(futureButton)));
    nav.appendChild(section("Activité",[history,...futureModules.activity.map(futureButton)]));
    nav.appendChild(section("Administration",[users,suppliers,articles,settings]));
    nav.dataset.architectureVersion="0.4.0";
  }

  function enhanceDashboard(){
    const dashboard=document.getElementById("dashboard");
    if(!dashboard||document.getElementById("stopflowShortcuts"))return;
    const block=document.createElement("div");
    block.className="card";
    block.id="stopflowShortcuts";
    block.innerHTML=`<div class="flex between wrap"><div><h2>Mes raccourcis</h2><p class="muted">Accès rapide aux opérations utiles selon votre rôle et votre département.</p></div><span class="version-pill">StopFlow 0.4.0</span></div>
      <div class="shortcut-grid">
        <button class="shortcut-card" data-shortcut-page="inventory"><strong>Démarrer un inventaire</strong><span class="muted">Créer ou reprendre un inventaire fournisseur.</span></button>
        <button class="shortcut-card" data-shortcut-page="history"><strong>Consulter l’activité</strong><span class="muted">Historique, brouillons et validations existantes.</span></button>
        <button class="shortcut-card disabled" disabled><strong>Faire une checklist</strong><span class="muted">Prévu pour la version 0.5.0.</span></button>
        <button class="shortcut-card disabled" disabled><strong>Encoder les températures</strong><span class="muted">Prévu pour la version 0.6.0.</span></button>
      </div>
      <div class="architecture-note"><div><b>Rôle</b><span class="muted">Employé, Responsable ou Administrateur</span></div><div><b>Département principal</b><span class="muted">Salle, Cuisine, Technicien de surface ou Bureau</span></div><div><b>Permissions complémentaires</b><span class="muted">Accès ciblés sans créer de rôles supplémentaires</span></div></div>`;
    const stats=dashboard.querySelector(".grid4");
    if(stats)stats.insertAdjacentElement("afterend",block);else dashboard.prepend(block);
    block.querySelectorAll("[data-shortcut-page]").forEach(button=>button.addEventListener("click",()=>{
      const page=button.dataset.shortcutPage;
      const target=document.querySelector(`.nav button[data-page="${page}"]`);
      if(target)target.click();
    }));
  }

  function updateVersionAndIdentity(){
    const loginVersion=[...document.querySelectorAll("#login .muted")].find(node=>node.textContent.includes("Version"));
    if(loginVersion)loginVersion.textContent="Version 0.4.0 — Architecture générale";
    const tagline=document.querySelector(".sidebar .tagline");
    if(tagline)tagline.innerHTML="La plateforme opérationnelle<br>de L’Union.";
    const role=document.getElementById("userRoleLabel");
    if(role&&!role.parentElement.querySelector(".user-department")){
      const department=document.createElement("small");
      department.className="user-department";
      department.textContent="Département : non défini";
      role.parentElement.appendChild(department);
    }
  }

  function applyStopFlow040(){
    injectArchitectureStyles();
    reorganizeNavigation();
    enhanceDashboard();
    updateVersionAndIdentity();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",applyStopFlow040);else applyStopFlow040();
  window.addEventListener("load",()=>setTimeout(applyStopFlow040,0));
})();
