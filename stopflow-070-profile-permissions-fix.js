/* StopFlow 0.7.0 — fiabilisation du formulaire de permissions. */
(function(){
  if(window.stopflow070ProfilePermissionsFix)return;
  window.stopflow070ProfilePermissionsFix=true;
  if(!window.stopflow070ProfilePermissions)return;

  const esc=value=>typeof escapeUserHtml==='function'?escapeUserHtml(value):String(value??'').replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[char]));

  function readVisiblePermissions(holder){
    if(!holder)return [];
    return [...holder.querySelectorAll('[data-sf70-permission]:checked')].map(input=>({permission_key:input.dataset.sf70Permission,scope:input.dataset.sf70Scope}));
  }

  function restorePermissions(holder,permissions){
    if(!holder||!Array.isArray(permissions))return;
    const wanted=new Set(permissions.map(item=>`${item.permission_key}|${item.scope}`));
    holder.querySelectorAll('[data-sf70-permission]').forEach(input=>{
      input.checked=wanted.has(`${input.dataset.sf70Permission}|${input.dataset.sf70Scope}`);
    });
    const lunch=holder.querySelector('[data-sf70-permission="lunchs.view"][data-sf70-scope="cuisine"]');
    const lunchManage=holder.querySelector('[data-sf70-permission="lunchs.manage"][data-sf70-scope="cuisine"]');
    if(lunchManage?.checked&&lunch)lunch.checked=true;
    lunchManage?.closest('.sf70-switch-row')?.classList.toggle('hidden',!lunch?.checked);
    const monthly=holder.querySelector('[data-sf70-permission="monthly_suggestions.view"][data-sf70-scope="cuisine"]');
    const monthlyManage=holder.querySelector('[data-sf70-permission="monthly_suggestions.manage"][data-sf70-scope="cuisine"]');
    if(monthlyManage?.checked&&monthly)monthly.checked=true;
    monthlyManage?.closest('.sf70-switch-row')?.classList.toggle('hidden',!monthly?.checked);
    const checked=holder.querySelectorAll('[data-sf70-permission]:checked').length;
    const count=holder.querySelector('.sf70-permission-count');
    if(count)count.textContent=`${checked} droit${checked>1?'s':''} actif${checked>1?'s':''}`;
  }

  function preserveAcrossRoleChanges(box,prefix,initialPermissions){
    const select=box.querySelector(`#${prefix}UserRole`),holder=box.querySelector('.sf70-permissions-holder');
    if(!select||!holder)return;
    let previousRole=select.value;
    let cached=Array.isArray(initialPermissions)?structuredClone(initialPermissions):readVisiblePermissions(holder);
    select.addEventListener('change',()=>{
      if(previousRole!=='admin')cached=readVisiblePermissions(holder);
    },true);
    select.addEventListener('change',()=>{
      const nextRole=select.value;
      if(previousRole==='admin'&&nextRole!=='admin')restorePermissions(holder,cached);
      else if(nextRole!=='admin')cached=readVisiblePermissions(holder);
      previousRole=nextRole;
    });
  }

  function compatibilityFromPermissions(role,permissions){
    if(role!=='employe')return {departement:'bureau',departments:[]};
    const scopes=[...new Set((permissions||[]).map(item=>item.scope).filter(scope=>['cuisine','salle','nettoyage'].includes(scope)))];
    if(!scopes.length)return {departement:'cuisine',departments:['cuisine']};
    const order=['cuisine','salle','nettoyage'];scopes.sort((a,b)=>order.indexOf(a)-order.indexOf(b));
    return {departement:scopes[0],departments:scopes};
  }

  async function saveExactPermissions({id,prenom,nom,role,actif,permissions}){
    const {data,error}=await supabaseClient.rpc('admin_set_user_profile_permissions_070',{
      p_profile_id:id,p_prenom:prenom,p_nom:nom,p_role:role,p_actif:actif,p_permissions:permissions,p_audit_action:'update'
    });
    if(error)throw error;
    return data;
  }

  function patchCreate(){
    const box=document.getElementById('modalBox'),button=document.getElementById('createUserButton');
    if(!box||!button||!box.querySelector('.sf70-permissions-holder'))return;
    preserveAcrossRoleChanges(box,'new',[{permission_key:'ideas.share',scope:'global'}]);
    button.onclick=async()=>{
      const role=document.getElementById('newUserRole').value;
      const holder=box.querySelector('.sf70-permissions-holder');
      const permissions=role==='admin'?[]:readVisiblePermissions(holder);
      const payload={
        email:document.getElementById('newUserEmail').value.trim().toLowerCase(),
        prenom:document.getElementById('newUserFirstName').value.trim(),
        nom:document.getElementById('newUserLastName').value.trim(),
        role,
        password:document.getElementById('newUserPassword').value
      };
      if(!payload.email)return alert('L’adresse e-mail est obligatoire.');
      if(!payload.prenom||!payload.nom)return alert('Le prénom et le nom sont obligatoires.');
      if(payload.password.length<10)return alert('Le mot de passe temporaire doit contenir au moins 10 caractères.');
      button.disabled=true;button.textContent='Création…';
      let createdId=null;
      try{
        const compatibility=compatibilityFromPermissions(role,permissions);
        const created=await invokeUserAdmin('create',{...payload,...compatibility});
        createdId=created?.user?.id||null;
        if(!createdId)throw new Error('Le compte a été créé sans identifiant exploitable.');
        await saveExactPermissions({id:createdId,prenom:payload.prenom,nom:payload.nom,role,actif:true,permissions});
        await loadSharedUsers();renderUsers();
        box.classList.remove('sf70-permissions-modal');
        box.innerHTML=`<h2>Compte créé</h2><p>Le compte <b>${esc(payload.email)}</b> est actif avec le rôle <b>${esc(userRoleLabel(role))}</b>.</p><div class="notice"><b>${role==='admin'?'Accès complet Administrateur':permissions.length+' permission(s) attribuée(s)'}</b></div><div class="notice" style="margin-top:10px"><b>Mot de passe temporaire</b><div class="flex" style="margin-top:8px"><code id="createdTemporaryPassword" style="font-size:17px;word-break:break-all">${esc(payload.password)}</code><button class="btn ghost" id="copyCreatedPassword">Copier</button></div></div><button class="btn primary" id="finishUserCreation" style="margin-top:14px">Terminer</button>`;
        document.getElementById('copyCreatedPassword').onclick=async()=>{await navigator.clipboard.writeText(payload.password);document.getElementById('copyCreatedPassword').textContent='Copié'};
        document.getElementById('finishUserCreation').onclick=()=>document.getElementById('modal').classList.add('hidden');
      }catch(error){
        if(createdId){
          try{await invokeUserAdmin('delete',{id:createdId,confirmationEmail:payload.email})}
          catch(rollbackError){console.error('StopFlow 0.7.0 — rollback création utilisateur impossible',rollbackError)}
        }
        alert(userAdminErrorMessage(error,'Création du compte ou attribution des permissions impossible.'));
        button.disabled=false;button.textContent='Créer le compte';
      }
    };
  }

  function patchEdit(id){
    const box=document.getElementById('modalBox');if(!box||!box.querySelector('.sf70-permissions-holder'))return;
    const user=sharedUsers.find(item=>item.id===id);
    preserveAcrossRoleChanges(box,'edit',user?.permissions||[]);
  }

  const previousCreate=showCreateUserModal;
  showCreateUserModal=function(){const result=previousCreate(...arguments);patchCreate();return result};
  const previousEdit=showEditUserModal;
  showEditUserModal=function(id){const result=previousEdit(...arguments);patchEdit(id);return result};
})();