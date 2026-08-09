/* StopFlow 0.7.0 — rechargement fiable des permissions dans la gestion des profils. */
(function(){
  if(window.stopflow070ProfilePermissionsReloadFix)return;
  window.stopflow070ProfilePermissionsReloadFix=true;

  async function reloadProfilePermissions(){
    if(typeof canManageUsers!=="function"||!canManageUsers()||!supabaseClient)return sharedUsers;
    const {data,error}=await supabaseClient
      .from("profile_permissions")
      .select("profile_id,permission_key,scope")
      .order("scope")
      .order("permission_key");
    if(error)throw error;

    const map=new Map();
    (data||[]).forEach(row=>{
      const list=map.get(row.profile_id)||[];
      list.push({permission_key:row.permission_key,scope:row.scope});
      map.set(row.profile_id,list);
    });

    sharedUsers=sharedUsers.map(user=>({
      ...user,
      permissions:map.get(user.id)||[],
      fullAccess:user.role==="admin"
    }));
    return sharedUsers;
  }

  if(typeof loadSharedUsers==="function"){
    const previousLoadSharedUsers=loadSharedUsers;
    loadSharedUsers=async function(){
      await previousLoadSharedUsers(...arguments);
      await reloadProfilePermissions();
      return sharedUsers;
    };
  }

  window.stopflow070ReloadProfilePermissions=reloadProfilePermissions;

  if(typeof canManageUsers==="function"&&canManageUsers()){
    reloadProfilePermissions()
      .then(()=>{if(typeof renderUsers==="function")renderUsers()})
      .catch(error=>console.warn("StopFlow 0.7.0 — rechargement permissions impossible",error));
  }
})();
