/* StopFlow 0.6.0 — stabilité du menu et réinitialisation des mots de passe. */
(function(){
  const S=window.SF54;
  if(!S||window.stopflow060MenuAuthFix)return;
  window.stopflow060MenuAuthFix=true;

  const OPERATIONAL=["salle","cuisine","nettoyage"];
  const LABELS={salle:"Salle",cuisine:"Cuisine",nettoyage:"Entretien & hygiène",bureau:"Bureau"};
  const isManager=()=>typeof S.manager==="function"&&S.manager();
  const allowed=()=>isManager()?new Set(OPERATIONAL):new Set((session?.departments||[session?.department||session?.departement]).filter(code=>OPERATIONAL.includes(code)));

  const departmentEntries=department=>[
    ["Inventaires & fournisseurs","department",department],
    ["Checklists","checklists",department],
    ["Historique","history",department],
    ...(department==="cuisine"?[
      ["Suggestions du mois","suggestions-month",department],
      ["Lunchs hebdomadaires","lunchs",department],
      ["Températures","temperatures",department]
    ]:[])
  ];
  const bureauEntries=()=>[
    ["Vue globale","bureau",null],
    ["Tous les inventaires","all-inventories",null],
    ["Toutes les checklists","all-checklists",null],
    ["Tous les historiques","all-history",null],
    ["Validations en attente","pending",null],
    ["Anomalies & températures","alerts",null],
    ["Messages d’équipe","banners",null],
    ["Fournisseurs","page:suppliers",null],
    ["Articles","page:articles",null],
    ["Utilisateurs","page:users",null],
    ["Paramètres","page:settings",null]
  ];
  const commonEntries=()=>[
    ["Idées & améliorations","page:suggestions",null],
    ["Installation de StopFlow","page:installation",null]
  ];

  function entriesFor(id){
    if(OPERATIONAL.includes(id))return departmentEntries(id);
    if(id==="bureau"&&isManager())return [...departmentEntries("bureau"),...bureauEntries()];
    if(id==="common")return commonEntries();
    return [];
  }

  function runAction(action,department){
    if(action.startsWith("page:"))return typeof page==="function"?page(action.slice(5)):undefined;
    return typeof S.action==="function"?S.action(action,department):undefined;
  }

  function buildButton(label,action,department,desktop){
    const button=document.createElement("button");
    button.type="button";
    button.className=desktop?"sf53-nav-item sf54-menu-entry":"sf52-nav-item sf54-menu-entry";
    button.dataset.sf54=action;
    if(department)button.dataset.department=department;
    button.innerHTML=desktop?`<span class="sf53-icon"></span><span class="sf53-label">${label}</span>`:`<span></span><span>${label}</span>`;
    button.addEventListener("click",()=>runAction(action,department));
    return button;
  }

  function canonicalizeGroup(group,id,desktop){
    const panel=group.querySelector(desktop?".sf53-group-panel":".sf52-nav-panel");
    if(!panel)return;
    const entries=entriesFor(id);
    const signature=entries.map(entry=>entry.join("|")).join(";");
    if(panel.dataset.sf60Canonical===signature&&panel.children.length===entries.length)return;
    panel.dataset.sf60Canonical=signature;
    panel.dataset.sf54="0.6.0";
    panel.innerHTML="";
    entries.forEach(([label,action,department])=>panel.appendChild(buildButton(label,action,department,desktop)));
  }

  function refreshMenus(){
    const access=allowed();
    document.querySelectorAll("#sf52DrawerContent .sf52-nav-group").forEach(group=>{
      const toggle=group.querySelector(".sf52-nav-group-toggle");
      const id=toggle?.dataset.group;
      if(!id)return;
      const label=toggle.querySelector("span:nth-child(2)");
      if(id==="common"&&label)label.textContent="Pour tous et toutes";
      const visible=id==="common"||(id==="bureau"&&isManager())||access.has(id);
      group.classList.toggle("hidden",!visible);
      if(visible)canonicalizeGroup(group,id,false);
    });
    document.querySelectorAll("#sf53DesktopNav .sf53-group").forEach(group=>{
      const id=group.dataset.group;
      if(!id)return;
      const label=group.querySelector(".sf53-group-toggle .sf53-label");
      if(id==="common"&&label)label.textContent="Pour tous et toutes";
      const visible=id==="common"||(id==="bureau"&&isManager())||access.has(id);
      group.classList.toggle("hidden",!visible);
      if(visible)canonicalizeGroup(group,id,true);
    });
  }
  S.refreshMenus=refreshMenus;

  function collapseMenus(){
    localStorage.removeItem("stopflow-052-open-group");
    localStorage.removeItem("stopflow-053-desktop-open-group");
    document.querySelectorAll(".sf52-nav-group-toggle,.sf53-group-toggle").forEach(toggle=>toggle.setAttribute("aria-expanded","false"));
    document.querySelectorAll(".sf52-nav-panel,.sf53-group-panel").forEach(panel=>panel.classList.remove("open"));
  }

  let refreshTimer=null;
  function scheduleRefresh(delays=[0,80,250,700]){
    clearTimeout(refreshTimer);
    delays.forEach(delay=>setTimeout(refreshMenus,delay));
  }

  function stabilizeInitialView(){
    [0,120,450,900].forEach(delay=>setTimeout(()=>{refreshMenus();collapseMenus()},delay));
  }

  if(typeof showApp==="function"){
    const previousShowApp=showApp;
    showApp=function(){
      const result=previousShowApp(...arguments);
      stabilizeInitialView();
      return result;
    };
  }
  if(typeof page==="function"){
    const previousPage=page;
    page=function(){
      const result=previousPage(...arguments);
      scheduleRefresh();
      return result;
    };
  }
  if(typeof applyRole==="function"){
    const previousApplyRole=applyRole;
    applyRole=function(){
      const result=previousApplyRole(...arguments);
      scheduleRefresh();
      return result;
    };
  }

  const observer=new MutationObserver(()=>{
    const stale=Boolean(document.querySelector("#sf52DrawerContent .sf52-nav-panel:not([data-sf60-canonical]),#sf53DesktopNav .sf53-group-panel:not([data-sf60-canonical])"));
    if(stale)scheduleRefresh([0,60,180]);
  });
  observer.observe(document.body,{childList:true,subtree:true});

  function temporaryPassword(){
    if(typeof generateTemporaryPassword==="function")return generateTemporaryPassword();
    const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    const values=new Uint32Array(16);crypto.getRandomValues(values);
    return [...values].map(value=>alphabet[value%alphabet.length]).join("");
  }

  function injectPasswordReset(user){
    if(!user||user.id===session?.id||typeof canManageUsers!=="function"||!canManageUsers())return;
    const modal=document.querySelector("#modalBox");
    if(!modal||document.querySelector("#sf60PasswordReset"))return;
    const block=document.createElement("div");
    block.id="sf60PasswordReset";
    block.style.cssText="margin-top:20px;padding-top:18px;border-top:1px solid var(--line)";
    block.innerHTML=`
      <div class="notice"><b>Réinitialiser le mot de passe</b><br>Crée un nouveau mot de passe temporaire sans supprimer le compte ni ses historiques.</div>
      <div class="field" style="margin-top:12px"><label>Nouveau mot de passe temporaire</label><div class="flex"><input id="sf60TemporaryPassword" class="input" style="width:100%" autocomplete="new-password"><button class="btn ghost" id="sf60GeneratePassword" type="button">Générer</button><button class="btn ghost" id="sf60CopyPassword" type="button">Copier</button></div></div>
      <button class="btn secondary" id="sf60ResetPasswordButton" type="button">Appliquer le nouveau mot de passe</button>
      <div class="muted" id="sf60PasswordStatus" style="margin-top:8px"></div>`;
    const deleteBlock=document.querySelector("#deleteUserButton")?.parentElement;
    if(deleteBlock)modal.insertBefore(block,deleteBlock);else modal.appendChild(block);
    const input=document.querySelector("#sf60TemporaryPassword");
    input.value=temporaryPassword();
    document.querySelector("#sf60GeneratePassword").onclick=()=>{input.value=temporaryPassword();document.querySelector("#sf60PasswordStatus").textContent=""};
    document.querySelector("#sf60CopyPassword").onclick=async()=>{await navigator.clipboard.writeText(input.value);document.querySelector("#sf60CopyPassword").textContent="Copié"};
    document.querySelector("#sf60ResetPasswordButton").onclick=async()=>{
      const password=String(input.value||"");
      if(password.length<10)return alert("Le mot de passe temporaire doit contenir au moins 10 caractères.");
      if(!confirm(`Réinitialiser le mot de passe de ${user.email} ?`))return;
      const button=document.querySelector("#sf60ResetPasswordButton");
      button.disabled=true;button.textContent="Réinitialisation…";
      try{
        await invokeUserAdmin("reset_password",{id:user.id,password});
        document.querySelector("#sf60PasswordStatus").innerHTML="<b>Mot de passe réinitialisé.</b> Copie-le avant de fermer cette fenêtre.";
        button.textContent="Mot de passe appliqué";
      }catch(error){
        alert(userAdminErrorMessage(error,"Réinitialisation impossible."));
        button.disabled=false;button.textContent="Appliquer le nouveau mot de passe";
      }
    };
  }

  if(typeof showEditUserModal==="function"){
    const previousEditUserModal=showEditUserModal;
    showEditUserModal=function(id){
      const result=previousEditUserModal(id);
      const user=sharedUsers.find(item=>item.id===id);
      setTimeout(()=>injectPasswordReset(user),0);
      return result;
    };
  }

  if(!document.querySelector("#app")?.classList.contains("hidden"))stabilizeInitialView();
  scheduleRefresh();
})();
