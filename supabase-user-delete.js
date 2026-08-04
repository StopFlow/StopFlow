/* StopFlow — suppression définitive sécurisée des comptes utilisateurs. */

const stopflowOriginalShowEditUserModal=showEditUserModal;
const stopflowOriginalShowCreateUserModal=showCreateUserModal;

showCreateUserModal=function(){
  stopflowOriginalShowCreateUserModal();
  const intro=document.querySelector("#modalBox h2 + p");
  if(intro)intro.textContent="Le compte sera immédiatement actif. Aucun e-mail de confirmation ne sera envoyé : vérifiez soigneusement l’adresse avant de créer le compte.";
  const firstName=document.querySelector("#newUserFirstName");
  const lastName=document.querySelector("#newUserLastName");
  if(firstName)firstName.required=true;
  if(lastName)lastName.required=true;
};

showEditUserModal=function(id){
  stopflowOriginalShowEditUserModal(id);
  const user=sharedUsers.find(item=>item.id===id);
  if(!user||user.protege===true||user.id===session.id)return;

  const modalBox=document.querySelector("#modalBox");
  if(!modalBox||document.querySelector("#deleteUserButton"))return;

  const block=document.createElement("div");
  block.style.cssText="margin-top:20px;padding-top:18px;border-top:1px solid var(--line)";
  block.innerHTML=`
    <div class="notice" style="background:#fff5f5;border-color:#ffd0d0;color:#8f2525">
      <b>Suppression définitive</b><br>
      Cette opération libère l’adresse e-mail, met fin aux sessions et supprime le compte de connexion. Les noms déjà inscrits dans les anciens bons restent visibles.
    </div>
    <button class="btn danger" id="deleteUserButton" style="margin-top:12px">Supprimer définitivement ce compte</button>`;
  modalBox.appendChild(block);

  document.querySelector("#deleteUserButton").onclick=async()=>{
    const expected=String(user.email||"").toLowerCase();
    const typed=prompt(`Suppression irréversible.\n\nRecopiez exactement l’adresse e-mail suivante pour confirmer :\n${user.email}`);
    if(typed===null)return;
    if(String(typed).trim().toLowerCase()!==expected){
      alert("L’adresse saisie ne correspond pas. Le compte n’a pas été supprimé.");
      return;
    }
    if(!confirm(`Supprimer définitivement ${user.email} ?\n\nCette adresse pourra ensuite être utilisée pour créer un nouveau compte.`))return;

    const button=document.querySelector("#deleteUserButton");
    button.disabled=true;
    button.textContent="Suppression…";
    try{
      await invokeUserAdmin("delete",{id:user.id,confirmationEmail:typed});
      await loadSharedUsers();
      renderUsers();
      document.querySelector("#modal").classList.add("hidden");
      alert(`Le compte ${user.email} a été supprimé. L’adresse e-mail est de nouveau disponible.`);
    }catch(error){
      alert(userAdminErrorMessage(error,"Suppression impossible."));
      button.disabled=false;
      button.textContent="Supprimer définitivement ce compte";
    }
  };
};

const usersDescription=document.querySelector("#users .card .flex.between .muted");
if(usersDescription)usersDescription.textContent="Créer les comptes, attribuer les rôles, désactiver temporairement ou supprimer définitivement les accès.";

/* Charge le module autonome 0.5.0 après les extensions utilisateurs. */
(function(){
  if(document.querySelector('script[data-stopflow-checklists="0.5.0"]'))return;
  const script=document.createElement("script");
  script.src="stopflow-checklists.js?v=0500";
  script.async=false;
  script.dataset.stopflowChecklists="0.5.0";
  document.head.appendChild(script);
})();
