/* StopFlow 0.7.0 — interface de permissions par fonction pour les profils. */
(function(){
  if(window.stopflow070ProfilePermissions)return;
  window.stopflow070ProfilePermissions=true;

  const ZONES=[
    {id:"cuisine",label:"Cuisine",permissions:[
      ["inventory.use","Inventaires"],["checklists.run","Checklists"],["temperatures.use","Températures"],["history.view","Historique"],
      ["lunchs.view","Lunchs hebdomadaires"],["lunchs.manage","Modifier les lunchs","lunchs.view"],
      ["monthly_suggestions.view","Suggestions du mois"],["monthly_suggestions.manage","Modifier les suggestions","monthly_suggestions.view"]
    ]},
    {id:"salle",label:"Salle",permissions:[["inventory.use","Inventaires"],["checklists.run","Checklists"],["history.view","Historique"]]},
    {id:"nettoyage",label:"Entretien & hygiène",permissions:[["inventory.use","Inventaires"],["checklists.run","Checklists"],["history.view","Historique"]]}
  ];
  const GENERAL_SIMPLE=[
    ["ideas.share","global","Partager une idée"],
    ["banners.manage","global","Publier des messages d’équipe"],
    ["settings.manage","global","Paramètres"]
  ];
  const GENERAL_SCOPED=[
    ["orders.manage","Gestion des commandes"],
    ["checklists.review","Contrôle des checklists"],
    ["checklists.templates.manage","Gestion des modèles de checklists"],
    ["alerts.view","Anomalies & températures"],
    ["suppliers.manage","Gérer les fournisseurs"],
    ["articles.manage","Gérer les articles"]
  ];
  const SCOPE_LABELS={cuisine:"Cuisine",salle:"Salle",nettoyage:"Entretien & hygiène"};
  const esc=value=>typeof escapeUserHtml==="function"?escapeUserHtml(value):String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const signature=(key,scope)=>`${key}|${scope}`;

  function injectStyles(){
    if(document.getElementById("stopflow070ProfilePermissionStyles"))return;
    const style=document.createElement("style");
    style.id="stopflow070ProfilePermissionStyles";
    style.textContent=`
      .sf70-permissions-modal{width:min(900px,100%)!important}
      .sf70-permission-head{margin-top:18px;display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap}
      .sf70-permission-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
      .sf70-permission-section{border:1px solid var(--line);border-radius:14px;background:#f8fafc;overflow:hidden}
      .sf70-permission-section h3{margin:0;padding:13px 14px;background:#fff;border-bottom:1px solid var(--line);font-size:15px}
      .sf70-permission-list{padding:6px 10px}
      .sf70-switch-row{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid #e8edf4;cursor:pointer;min-height:44px}
      .sf70-switch-row:last-child{border-bottom:0}.sf70-switch-row:hover{background:rgba(36,99,235,.035)}
      .sf70-switch-row.sf70-child{margin-left:25px;color:var(--muted);font-size:13px}
      .sf70-switch{position:relative;width:42px;height:24px;flex:0 0 42px}.sf70-switch input{position:absolute;opacity:0;pointer-events:none}
      .sf70-track{position:absolute;inset:0;border:1px solid #c7d1dc;border-radius:999px;background:#e6ebf1;transition:.18s}
      .sf70-thumb{position:absolute;width:16px;height:16px;left:4px;top:4px;border-radius:50%;background:#8c99a8;box-shadow:0 1px 3px rgba(0,0,0,.18);transition:.18s}
      .sf70-switch input:checked~.sf70-track{background:#e8f8ef;border-color:#7bd5a1}.sf70-switch input:checked~.sf70-thumb{transform:translateX(18px);background:#18a45f}
      .sf70-switch input:focus-visible~.sf70-track{box-shadow:0 0 0 3px #dce8ff}
      .sf70-switch-label{font-weight:700;color:var(--text)}.sf70-child .sf70-switch-label{font-weight:600}
      .sf70-general{grid-column:1/-1}.sf70-scope-group{padding:10px 4px;border-bottom:1px solid #e8edf4}.sf70-scope-group:last-child{border-bottom:0}
      .sf70-scope-title{font-weight:800;margin-bottom:7px}.sf70-scope-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px 12px;padding-left:2px}
      .sf70-scope-list .sf70-switch-row{border:0;padding:6px 0;min-height:36px;font-size:13px}
      .sf70-admin-access{margin-top:12px;padding:16px;border:1px solid #b9dfc8;border-radius:13px;background:#eef9f2;color:#17623c}
      .sf70-permission-count{font-size:12px;color:var(--muted);font-weight:700}
      .sf70-user-permission-summary{display:block;margin-top:3px;font-size:11px;color:var(--muted)}
      .sf70-status-row{display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#fff;min-height:44px}
      @media(max-width:720px){.sf70-permission-grid{grid-template-columns:1fr}.sf70-general{grid-column:auto}.sf70-scope-list{grid-template-columns:1fr}.sf70-permissions-modal{max-height:94vh!important}}
    `;
    document.head.appendChild(style);
  }

  function switchHtml(key,scope,label,checked=false,extra=""){
    return `<label class="sf70-switch-row ${extra}"><span class="sf70-switch"><input type="checkbox" data-sf70-permission="${esc(key)}" data-sf70-scope="${esc(scope)}" ${checked?"checked":""}><span class="sf70-track"></span><span class="sf70-thumb"></span></span><span class="sf70-switch-label">${esc(label)}</span></label>`;
  }

  function permissionSet(rows){
    const set=new Set();
    (Array.isArray(rows)?rows:[]).forEach(row=>{if(row?.permission_key&&row?.scope)set.add(signature(row.permission_key,row.scope))});
    return set;
  }

  function permissionsHtml(rows,role){
    if(role==="admin")return `<div class="sf70-admin-access"><b>Accès complet Administrateur</b><br>Toutes les fonctions et tous les départements sont autorisés automatiquement. Aucun interrupteur n’est nécessaire.</div>`;
    const set=permissionSet(rows);
    const zoneHtml=ZONES.map(zone=>`<section class="sf70-permission-section"><h3>${esc(zone.label)}</h3><div class="sf70-permission-list">${zone.permissions.map(([key,label,parent])=>switchHtml(key,zone.id,label,set.has(signature(key,zone.id)),parent?"sf70-child":"")).join("")}</div></section>`).join("");
    const simple=GENERAL_SIMPLE.map(([key,scope,label])=>switchHtml(key,scope,label,set.has(signature(key,scope)))).join("");
    const scoped=GENERAL_SCOPED.map(([key,label])=>`<div class="sf70-scope-group"><div class="sf70-scope-title">${esc(label)}</div><div class="sf70-scope-list">${Object.entries(SCOPE_LABELS).map(([scope,scopeLabel])=>switchHtml(key,scope,scopeLabel,set.has(signature(key,scope)))).join("")}</div></div>`).join("");
    return `<div class="sf70-permission-head"><div><b>Permissions du profil</b><div class="muted" style="font-size:12px">Vert = autorisé. Les rubriques du menu apparaîtront selon les droits activés.</div></div><span class="sf70-permission-count"></span></div><div class="sf70-permission-grid">${zoneHtml}<section class="sf70-permission-section sf70-general"><h3>Général</h3><div class="sf70-permission-list">${simple}${scoped}</div></section></div>`;
  }

  function normalizeDependencies(root){
    [["lunchs.view","lunchs.manage"],["monthly_suggestions.view","monthly_suggestions.manage"]].forEach(([parent,child])=>{
      const parentInput=root.querySelector(`[data-sf70-permission="${parent}"][data-sf70-scope="cuisine"]`);
      const childInput=root.querySelector(`[data-sf70-permission="${child}"][data-sf70-scope="cuisine"]`);
      const childRow=childInput?.closest('.sf70-switch-row');
      if(!parentInput||!childInput)return;
      if(!parentInput.checked)childInput.checked=false;
      childRow?.classList.toggle('hidden',!parentInput.checked);
    });
    const count=root.querySelectorAll('[data-sf70-permission]:checked').length;
    const node=root.querySelector('.sf70-permission-count');
    if(node)node.textContent=`${count} droit${count>1?'s':''} actif${count>1?'s':''}`;
  }

  function bindPermissionDependencies(root){
    root.querySelectorAll('[data-sf70-permission]').forEach(input=>input.addEventListener('change',()=>{
      if(input.dataset.sf70Permission==='lunchs.manage'&&input.checked){const p=root.querySelector('[data-sf70-permission="lunchs.view"][data-sf70-scope="cuisine"]');if(p)p.checked=true}
      if(input.dataset.sf70Permission==='monthly_suggestions.manage'&&input.checked){const p=root.querySelector('[data-sf70-permission="monthly_suggestions.view"][data-sf70-scope="cuisine"]');if(p)p.checked=true}
      normalizeDependencies(root);
    }));
    normalizeDependencies(root);
  }

  function readPermissions(root,role){
    if(role==='admin')return [];
    return [...root.querySelectorAll('[data-sf70-permission]:checked')].map(input=>({permission_key:input.dataset.sf70Permission,scope:input.dataset.sf70Scope}));
  }

  async function attachPermissions(){
    if(typeof canManageUsers!=="function"||!canManageUsers()||!window.supabaseClient)return sharedUsers;
    const {data,error}=await supabaseClient.from('profile_permissions').select('profile_id,permission_key,scope').order('scope').order('permission_key');
    if(error)throw error;
    const map=new Map();
    (data||[]).forEach(row=>{const list=map.get(row.profile_id)||[];list.push({permission_key:row.permission_key,scope:row.scope});map.set(row.profile_id,list)});
    sharedUsers=sharedUsers.map(user=>({...user,permissions:map.get(user.id)||[],fullAccess:user.role==='admin'}));
    return sharedUsers;
  }

  if(typeof loadSharedUsers==='function'){
    const previousLoadSharedUsers=loadSharedUsers;
    loadSharedUsers=async function(){await previousLoadSharedUsers();await attachPermissions();return sharedUsers};
  }

  function zoneSummary(user){
    if(user.role==='admin')return 'Accès complet';
    const set=permissionSet(user.permissions);
    const labels=[];
    for(const zone of ZONES){if([...set].some(value=>value.endsWith('|'+zone.id)))labels.push(zone.label)}
    if([...set].some(value=>value.endsWith('|global')))labels.push('Général');
    return labels.length?labels.join(' · '):'Aucun droit métier';
  }

  if(typeof renderUsers==='function'){
    const previousRenderUsers=renderUsers;
    renderUsers=function(){
      previousRenderUsers();
      document.querySelectorAll('.sf60-user-row-departments,.user-department-inline').forEach(node=>node.remove());
      document.querySelectorAll('[data-user-edit]').forEach(button=>{
        const user=sharedUsers.find(item=>item.id===button.dataset.userEdit),cell=button.closest('tr')?.children?.[1];
        if(!user||!cell)return;
        const small=document.createElement('small');small.className='sf70-user-permission-summary';small.textContent=zoneSummary(user);cell.appendChild(small);
      });
    };
  }

  async function savePermissionsProfile({id,prenom,nom,role,actif,permissions}){
    const {data,error}=await supabaseClient.rpc('admin_set_user_profile_permissions_070',{
      p_profile_id:id,p_prenom:prenom,p_nom:nom,p_role:role,p_actif:actif,p_permissions:permissions,p_audit_action:'update'
    });
    if(error)throw error;
    return data;
  }

  function roleChanged(modal,prefix){
    const role=modal.querySelector(`#${prefix}UserRole`)?.value||'employe';
    const holder=modal.querySelector('.sf70-permissions-holder');
    if(!holder)return;
    const current=readPermissions(holder,role==='admin'?'employe':role);
    holder.innerHTML=permissionsHtml(current,role);
    bindPermissionDependencies(holder);
  }

  function injectStatusSwitch(checked,disabled=false){
    return `<div class="sf70-status-row"><span class="sf70-switch"><input id="editUserActive" type="checkbox" ${checked?'checked':''} ${disabled?'disabled':''}><span class="sf70-track"></span><span class="sf70-thumb"></span></span><label for="editUserActive" style="font-weight:700;cursor:pointer">Compte actif</label></div>`;
  }

  function passwordResetBlock(user){
    if(!user||user.id===session?.id)return '';
    return `<div id="sf70PasswordReset" style="margin-top:20px;padding-top:18px;border-top:1px solid var(--line)"><div class="notice"><b>Réinitialiser le mot de passe</b><br>Crée un nouveau mot de passe temporaire sans modifier les permissions ni les historiques.</div><div class="field" style="margin-top:12px"><label>Nouveau mot de passe temporaire</label><div class="flex"><input id="sf70TemporaryPassword" class="input" style="width:100%" autocomplete="new-password"><button class="btn ghost" id="sf70GeneratePassword" type="button">Générer</button><button class="btn ghost" id="sf70CopyPassword" type="button">Copier</button></div></div><button class="btn secondary" id="sf70ResetPasswordButton" type="button">Appliquer le nouveau mot de passe</button><div class="muted" id="sf70PasswordStatus" style="margin-top:8px"></div></div>`;
  }

  function deleteBlock(user){
    if(!user||user.protege===true||user.id===session?.id)return '';
    return `<div id="sf70DeleteUser" style="margin-top:20px;padding-top:18px;border-top:1px solid var(--line)"><div class="notice" style="background:#fff5f5;border-color:#ffd0d0;color:#8f2525"><b>Suppression définitive</b><br>Supprime le compte de connexion. Les historiques déjà enregistrés restent conservés.</div><button class="btn danger" id="deleteUserButton" style="margin-top:12px">Supprimer définitivement ce compte</button></div>`;
  }

  function bindPasswordReset(user){
    const input=document.getElementById('sf70TemporaryPassword');if(!input)return;
    const generate=()=>typeof generateTemporaryPassword==='function'?generateTemporaryPassword():String(Math.random()).slice(2)+'StopFlow!';
    input.value=generate();
    document.getElementById('sf70GeneratePassword').onclick=()=>{input.value=generate();document.getElementById('sf70PasswordStatus').textContent=''};
    document.getElementById('sf70CopyPassword').onclick=async()=>{await navigator.clipboard.writeText(input.value);document.getElementById('sf70CopyPassword').textContent='Copié'};
    document.getElementById('sf70ResetPasswordButton').onclick=async()=>{
      const password=String(input.value||'');if(password.length<10)return alert('Le mot de passe temporaire doit contenir au moins 10 caractères.');
      if(!confirm(`Réinitialiser le mot de passe de ${user.email} ?`))return;
      const button=document.getElementById('sf70ResetPasswordButton');button.disabled=true;button.textContent='Réinitialisation…';
      try{await invokeUserAdmin('reset_password',{id:user.id,password});document.getElementById('sf70PasswordStatus').innerHTML='<b>Mot de passe réinitialisé.</b> Copie-le avant de fermer cette fenêtre.';button.textContent='Mot de passe appliqué'}
      catch(error){alert(userAdminErrorMessage(error,'Réinitialisation impossible.'));button.disabled=false;button.textContent='Appliquer le nouveau mot de passe'}
    };
  }

  function bindDelete(user){
    const button=document.getElementById('deleteUserButton');if(!button)return;
    button.onclick=async()=>{
      const expected=String(user.email||'').toLowerCase();
      const typed=prompt(`Suppression irréversible.\n\nRecopiez exactement l’adresse e-mail suivante pour confirmer :\n${user.email}`);
      if(typed===null)return;if(String(typed).trim().toLowerCase()!==expected)return alert('L’adresse saisie ne correspond pas. Le compte n’a pas été supprimé.');
      if(!confirm(`Supprimer définitivement ${user.email} ?`))return;
      button.disabled=true;button.textContent='Suppression…';
      try{await invokeUserAdmin('delete',{id:user.id,confirmationEmail:typed});await loadSharedUsers();renderUsers();document.getElementById('modal').classList.add('hidden');alert(`Le compte ${user.email} a été supprimé.`)}
      catch(error){alert(userAdminErrorMessage(error,'Suppression impossible.'));button.disabled=false;button.textContent='Supprimer définitivement ce compte'}
    };
  }

  showCreateUserModal=function(){
    if(!canManageUsers())return alert('Action non autorisée.');
    const temporaryPassword=generateTemporaryPassword();
    const starter=[{permission_key:'ideas.share',scope:'global'}];
    document.getElementById('modalBox').classList.add('sf70-permissions-modal');
    document.getElementById('modalBox').innerHTML=`<div class="flex between"><div><h2>Ajouter un utilisateur</h2><p class="muted">Définissez uniquement les fonctions utiles à son poste.</p></div><button class="btn ghost" id="closeModal">Fermer</button></div><div class="filters" style="grid-template-columns:1fr 1fr;margin-top:14px"><div class="field"><label>Prénom</label><input id="newUserFirstName" class="input" autocomplete="off" required></div><div class="field"><label>Nom</label><input id="newUserLastName" class="input" autocomplete="off" required></div></div><div class="field"><label>Adresse e-mail</label><input id="newUserEmail" class="input" type="email" autocomplete="off"></div><div class="filters" style="grid-template-columns:1fr 1fr;margin-top:14px"><div class="field"><label>Rôle</label><select id="newUserRole" class="input"><option value="employe">Employé</option><option value="responsable">Responsable</option><option value="admin">Administrateur</option></select></div><div class="field"><label>Mot de passe temporaire</label><div class="flex"><input id="newUserPassword" class="input" style="width:100%" value="${esc(temporaryPassword)}" autocomplete="new-password"><button class="btn ghost" id="generateUserPassword" type="button">Générer</button></div></div></div><div class="sf70-permissions-holder">${permissionsHtml(starter,'employe')}</div><div class="notice" style="margin-top:14px">Starter pack : <b>Partager une idée</b> est activé par défaut. Tout le reste dépend du poste réel.</div><button class="btn primary" id="createUserButton" style="margin-top:16px">Créer le compte</button>`;
    const modal=document.getElementById('modal');modal.classList.remove('hidden');
    const box=document.getElementById('modalBox');bindPermissionDependencies(box.querySelector('.sf70-permissions-holder'));
    document.getElementById('closeModal').onclick=()=>modal.classList.add('hidden');
    document.getElementById('generateUserPassword').onclick=()=>document.getElementById('newUserPassword').value=generateTemporaryPassword();
    document.getElementById('newUserRole').addEventListener('change',()=>roleChanged(box,'new'));
    document.getElementById('createUserButton').onclick=async()=>{
      const button=document.getElementById('createUserButton');
      const role=document.getElementById('newUserRole').value;
      const permissions=readPermissions(box.querySelector('.sf70-permissions-holder'),role);
      const payload={email:document.getElementById('newUserEmail').value.trim().toLowerCase(),prenom:document.getElementById('newUserFirstName').value.trim(),nom:document.getElementById('newUserLastName').value.trim(),role,password:document.getElementById('newUserPassword').value};
      if(!payload.email)return alert('L’adresse e-mail est obligatoire.');if(!payload.prenom||!payload.nom)return alert('Le prénom et le nom sont obligatoires.');if(payload.password.length<10)return alert('Le mot de passe temporaire doit contenir au moins 10 caractères.');
      button.disabled=true;button.textContent='Création…';
      try{
        const compatibility=role==='employe'?{departement:'cuisine',departments:['cuisine']}:{departement:'bureau',departments:[]};
        const created=await invokeUserAdmin('create',{...payload,...compatibility});
        await savePermissionsProfile({id:created.user.id,prenom:payload.prenom,nom:payload.nom,role,actif:true,permissions});
        await loadSharedUsers();renderUsers();
        box.classList.remove('sf70-permissions-modal');
        box.innerHTML=`<h2>Compte créé</h2><p>Le compte <b>${esc(payload.email)}</b> est actif avec le rôle <b>${esc(userRoleLabel(role))}</b>.</p><div class="notice"><b>${role==='admin'?'Accès complet Administrateur':permissions.length+' permission(s) attribuée(s)'}</b></div><div class="notice" style="margin-top:10px"><b>Mot de passe temporaire</b><div class="flex" style="margin-top:8px"><code id="createdTemporaryPassword" style="font-size:17px;word-break:break-all">${esc(payload.password)}</code><button class="btn ghost" id="copyCreatedPassword">Copier</button></div></div><button class="btn primary" id="finishUserCreation" style="margin-top:14px">Terminer</button>`;
        document.getElementById('copyCreatedPassword').onclick=async()=>{await navigator.clipboard.writeText(payload.password);document.getElementById('copyCreatedPassword').textContent='Copié'};
        document.getElementById('finishUserCreation').onclick=()=>modal.classList.add('hidden');
      }catch(error){alert(userAdminErrorMessage(error));button.disabled=false;button.textContent='Créer le compte'}
    };
  };

  showEditUserModal=function(id){
    const user=sharedUsers.find(item=>item.id===id);if(!user)return alert('Utilisateur introuvable.');
    const protectedAccount=user.protege===true;
    const box=document.getElementById('modalBox');box.classList.add('sf70-permissions-modal');
    box.innerHTML=`<div class="flex between"><div><h2>Modifier l’utilisateur</h2><p class="muted">${esc(user.email)}</p></div><button class="btn ghost" id="closeModal">Fermer</button></div>${protectedAccount?'<div class="notice">Compte protégé : son rôle et son activation restent verrouillés. Ses permissions peuvent être adaptées sauf pour un Administrateur, qui conserve toujours l’accès complet.</div>':''}<div class="filters" style="grid-template-columns:1fr 1fr;margin-top:14px"><div class="field"><label>Prénom</label><input id="editUserFirstName" class="input" value="${esc(user.prenom)}"></div><div class="field"><label>Nom</label><input id="editUserLastName" class="input" value="${esc(user.nom)}"></div></div><div class="filters" style="grid-template-columns:1fr 1fr;margin-top:14px"><div class="field"><label>Rôle</label><select id="editUserRole" class="input" ${protectedAccount?'disabled':''}><option value="employe" ${user.role==='employe'?'selected':''}>Employé</option><option value="responsable" ${user.role==='responsable'?'selected':''}>Responsable</option><option value="admin" ${user.role==='admin'?'selected':''}>Administrateur</option></select></div><div class="field"><label>Statut</label>${injectStatusSwitch(user.actif,protectedAccount)}</div></div><div class="sf70-permissions-holder">${permissionsHtml(user.permissions||[],user.role)}</div><button class="btn primary" id="saveUserButton" style="margin-top:16px">Enregistrer</button>${passwordResetBlock(user)}${deleteBlock(user)}`;
    const modal=document.getElementById('modal');modal.classList.remove('hidden');bindPermissionDependencies(box.querySelector('.sf70-permissions-holder'));
    document.getElementById('closeModal').onclick=()=>modal.classList.add('hidden');
    document.getElementById('editUserRole').addEventListener('change',()=>roleChanged(box,'edit'));
    bindPasswordReset(user);bindDelete(user);
    document.getElementById('saveUserButton').onclick=async()=>{
      const button=document.getElementById('saveUserButton');const role=protectedAccount?user.role:document.getElementById('editUserRole').value;const actif=protectedAccount?user.actif:document.getElementById('editUserActive').checked;
      if(user.actif&&!actif&&!confirm('Désactiver ce compte ? La personne ne pourra plus se connecter à StopFlow.'))return;
      const payload={id:user.id,prenom:document.getElementById('editUserFirstName').value.trim(),nom:document.getElementById('editUserLastName').value.trim(),role,actif,permissions:readPermissions(box.querySelector('.sf70-permissions-holder'),role)};
      if(!payload.prenom||!payload.nom)return alert('Le prénom et le nom sont obligatoires.');
      button.disabled=true;button.textContent='Enregistrement…';
      try{await savePermissionsProfile(payload);await loadSharedUsers();renderUsers();modal.classList.add('hidden');alert('Utilisateur et permissions mis à jour.')}
      catch(error){alert(userAdminErrorMessage(error,'Mise à jour des permissions impossible.'));button.disabled=false;button.textContent='Enregistrer'}
    };
  };

  injectStyles();
  if(typeof canManageUsers==='function'&&canManageUsers()&&!document.querySelector('#app')?.classList.contains('hidden'))attachPermissions().then(()=>{try{renderUsers()}catch{}}).catch(console.warn);
})();