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
