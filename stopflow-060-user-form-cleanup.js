/* StopFlow 0.6.0 — nettoyage ciblé des formulaires utilisateurs. */
(function(){
  if(window.stopflow060UserFormCleanup)return;
  window.stopflow060UserFormCleanup=true;

  function cleanDuplicatePrimaryDepartment(){
    const modal=document.querySelector("#modalBox");
    if(!modal||!modal.querySelector(".sf60-access-block"))return;
    modal.querySelectorAll(".field").forEach(field=>{
      if(field.closest(".sf60-access-block"))return;
      const label=field.querySelector(":scope > label");
      const text=String(label?.textContent||"").trim().toLocaleLowerCase("fr");
      if(text==="département principal")field.remove();
    });
  }

  function patch(){
    if(window.stopflow060UserFormCleanupPatched)return true;
    if(!window.stopflow060MultiDepartments||!window.stopflow060MenuAuthFix)return false;
    if(typeof showEditUserModal!=="function"||typeof showCreateUserModal!=="function")return false;

    const previousEdit=showEditUserModal;
    showEditUserModal=function(){
      const result=previousEdit(...arguments);
      [0,40,120].forEach(delay=>setTimeout(cleanDuplicatePrimaryDepartment,delay));
      return result;
    };

    const previousCreate=showCreateUserModal;
    showCreateUserModal=function(){
      const result=previousCreate(...arguments);
      [0,40,120].forEach(delay=>setTimeout(cleanDuplicatePrimaryDepartment,delay));
      return result;
    };

    window.stopflow060UserFormCleanupPatched=true;
    cleanDuplicatePrimaryDepartment();
    return true;
  }

  [0,120,300,700,1400].forEach(delay=>setTimeout(patch,delay));
})();
