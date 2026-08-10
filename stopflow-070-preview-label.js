/* StopFlow 0.7.1 — identification fiable de la version publiée ou preview. */
(function(){
  if(window.stopflow071VersionLabel)return;
  window.stopflow071VersionLabel=true;

  const productionHosts=new Set(['stopflow-app.vercel.app']);
  const isProduction=()=>productionHosts.has(location.hostname);
  const loginLabel=()=>isProduction()?'Version 0.7.1':'Version 0.7.1 — Preview de développement';
  const pillLabel=()=>isProduction()?'StopFlow 0.7.1':'StopFlow 0.7.1 — Preview';

  function apply(){
    const login=document.getElementById('login');
    if(login){
      const candidates=[...login.querySelectorAll('.login-card p.muted')];
      const version=candidates.find(node=>/Version\s+/i.test(node.textContent||''))||candidates[0];
      if(version&&version.textContent!==loginLabel())version.textContent=loginLabel();
    }

    document.querySelectorAll('.version-pill').forEach(node=>{
      if(node.textContent!==pillLabel())node.textContent=pillLabel();
    });
  }

  let scheduled=false;
  const scheduleApply=()=>{
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;apply()});
  };

  const observer=new MutationObserver(scheduleApply);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});

  [0,100,300,800,1600,3000,5000].forEach(delay=>setTimeout(apply,delay));
})();
