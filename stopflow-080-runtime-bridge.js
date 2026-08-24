/* StopFlow 0.8.0 — pont minimal vers les globals historiques nécessaires aux extensions. */
(function(){
  try{
    if(typeof supabaseClient!=='undefined'&&!window.supabaseClient)window.supabaseClient=supabaseClient;
  }catch{}
})();
