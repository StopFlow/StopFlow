/* StopFlow 0.11.2 — garde de démarrage et authentification robuste */
(function(){
 const VERSION='Version 0.11.2 test — architecture et checklists';

 function updateVersion(){
   const target=document.querySelector('.login-card p.muted');
   if(target)target.textContent=VERSION;
 }

 async function clearDevelopmentCache(){
   try{
     if('serviceWorker' in navigator){
       const regs=await navigator.serviceWorker.getRegistrations();
       await Promise.all(regs.map(reg=>reg.unregister().catch(()=>false)));
     }
     if('caches' in window){
       const keys=await caches.keys();
       await Promise.all(keys.map(key=>caches.delete(key)));
     }
   }catch(error){console.warn('Nettoyage du cache StopFlow',error)}
 }

 function exposeSharedGlobals(){
   try{
     if(typeof supabaseClient!=='undefined')window.supabaseClient=supabaseClient;
     if(typeof isCloudMode==='function')window.isCloudMode=isCloudMode;
   }catch(error){console.warn('Initialisation des modules StopFlow',error)}
 }

 function installRobustAuthentication(){
   if(typeof signInWithSupabase!=='function'||typeof loadAuthenticatedProfile!=='function')return;

   signInWithSupabase=async function(email,password){
     if(!supabaseClient)throw new Error('La bibliothèque de connexion Supabase n’est pas disponible. Rechargez la page.');

     const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
     if(error||!data?.user){
       const detail=error?.message?` (${error.message})`:'';
       throw new Error(`Connexion refusée${detail}`);
     }

     const user=data.user;
     const {data:profile,error:profileError}=await supabaseClient
       .from('profiles')
       .select('id,email,prenom,nom,role,actif,departement')
       .eq('id',user.id)
       .single();

     if(profileError||!profile){
       await supabaseClient.auth.signOut();
       throw new Error(`Compte reconnu, mais profil StopFlow inaccessible${profileError?.message?` (${profileError.message})`:''}.`);
     }
     if(profile.actif!==true){
       await supabaseClient.auth.signOut();
       throw new Error('Ce compte StopFlow est désactivé.');
     }

     const mappedRole=mapProfileRole(profile.role);
     if(!mappedRole){
       await supabaseClient.auth.signOut();
       throw new Error(`Le rôle « ${profile.role||'non défini'} » n’est pas reconnu.`);
     }

     session={
       id:user.id,
       name:profileDisplayName(profile,user),
       role:mappedRole,
       email:user.email||profile.email,
       departement:profile.departement||null,
       authMode:'supabase'
     };
     window.supabaseClient=supabaseClient;
     window.isCloudMode=typeof isCloudMode==='function'?isCloudMode:undefined;
     localStorage.removeItem('stopflowLogged');

     /* L’accès à l’application ne dépend plus du chargement des catalogues. */
     showApp();
     setLoginMessage('Connexion réussie. Chargement des données…','success');

     const jobs=[];
     if(typeof loadSharedOrders==='function')jobs.push(Promise.resolve().then(()=>loadSharedOrders()));
     if(typeof loadSharedCatalog==='function')jobs.push(Promise.resolve().then(()=>loadSharedCatalog()));
     const results=await Promise.allSettled(jobs);
     const failures=results.filter(result=>result.status==='rejected');
     if(failures.length){
       console.error('Modules StopFlow non chargés',failures.map(x=>x.reason));
       setTimeout(()=>alert(`Connexion réussie, mais ${failures.length} module(s) de données n’ont pas pu être chargés. Le compte fonctionne ; le détail technique est visible dans la console.`),100);
     }else{
       try{renderDashboard()}catch{}
     }
   };
 }

 function addRecoveryButton(){
   const card=document.querySelector('.login-card');
   if(!card||document.querySelector('#sfResetConnection'))return;
   const button=document.createElement('button');
   button.id='sfResetConnection';
   button.type='button';
   button.className='btn ghost';
   button.style.marginTop='10px';
   button.textContent='Réinitialiser la connexion sur cet appareil';
   button.onclick=async()=>{
     try{if(typeof supabaseClient!=='undefined'&&supabaseClient)await supabaseClient.auth.signOut()}catch{}
     try{localStorage.removeItem('stopflowLogged')}catch{}
     await clearDevelopmentCache();
     location.replace(location.pathname+'?clean='+Date.now());
   };
   card.appendChild(button);
 }

 updateVersion();
 exposeSharedGlobals();
 installRobustAuthentication();
 addRecoveryButton();
 clearDevelopmentCache();
 document.addEventListener('DOMContentLoaded',()=>{
   updateVersion();
   exposeSharedGlobals();
   installRobustAuthentication();
   addRecoveryButton();
 });
})();