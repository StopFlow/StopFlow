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

/* Charge les modules autonomes validés 0.5.0, puis l’installation 0.5.1. */
(function(){
  if(document.querySelector('script[data-stopflow-checklists="0.5.0"]'))return;
  const script=document.createElement("script");
  script.src="stopflow-checklists.js?v=0500";
  script.async=false;
  script.dataset.stopflowChecklists="0.5.0";
  script.onload=()=>{
    if(document.querySelector('script[data-stopflow-checklists-correction="0.5.0"]'))return;
    const correction=document.createElement("script");
    correction.src="stopflow-050-correction.js?v=0500c2";
    correction.async=false;
    correction.dataset.stopflowChecklistsCorrection="0.5.0";
    correction.onload=()=>{
      if(document.querySelector('script[data-stopflow-checklists-history="0.5.0"]'))return;
      const history=document.createElement("script");
      history.src="stopflow-050-history.js?v=0500h2";
      history.async=false;
      history.dataset.stopflowChecklistsHistory="0.5.0";
      history.onload=()=>{
        if(document.querySelector('script[data-stopflow-checklists-history-pdf="0.5.0"]'))return;
        const historyPdf=document.createElement("script");
        historyPdf.src="stopflow-050-history-pdf.js?v=0500p1";
        historyPdf.async=false;
        historyPdf.dataset.stopflowChecklistsHistoryPdf="0.5.0";
        historyPdf.onload=()=>{
          if(document.querySelector('script[data-stopflow-pwa="0.5.1"]'))return;
          const pwa=document.createElement("script");
          pwa.src="stopflow-pwa.js?v=0510";
          pwa.async=false;
          pwa.dataset.stopflowPwa="0.5.1";
          pwa.onload=()=>{
            if(document.querySelector('script[data-stopflow-pwa-iphone-fix="0.5.1"]'))return;
            const fix=document.createElement("script");
            fix.src="stopflow-051-iphone-fix.js?v=0511";
            fix.async=false;
            fix.dataset.stopflowPwaIphoneFix="0.5.1";
            document.head.appendChild(fix);
          };
          document.head.appendChild(pwa);
        };
        document.head.appendChild(historyPdf);
      };
      document.head.appendChild(history);
    };
    document.head.appendChild(correction);
  };
  document.head.appendChild(script);
})();
