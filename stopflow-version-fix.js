/* StopFlow version/cache guard 0.11.2 */
(function(){
 const VERSION='Version 0.11.2 test — architecture et checklists';
 function updateVersion(){
   document.querySelectorAll('.login-card .muted, .login-card p, .login-card div').forEach(el=>{
     const text=(el.textContent||'').trim();
     if(/^Version\s+0\./i.test(text))el.textContent=VERSION;
   });
 }
 async function refreshServiceWorker(){
   if(!('serviceWorker' in navigator))return;
   try{
     const regs=await navigator.serviceWorker.getRegistrations();
     await Promise.all(regs.map(reg=>reg.update().catch(()=>null)));
     await navigator.serviceWorker.register('/service-worker.js?v=0112-2',{updateViaCache:'none'});
   }catch(error){console.warn('Mise à jour PWA',error)}
 }
 updateVersion();
 document.addEventListener('DOMContentLoaded',updateVersion);
 setTimeout(updateVersion,500);
 refreshServiceWorker();
})();