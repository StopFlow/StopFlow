/* StopFlow 0.7.0 — identification claire des previews de développement. */
(function(){
  if(window.stopflow070PreviewLabel)return;
  window.stopflow070PreviewLabel=true;
  const productionHosts=new Set(['stopflow-app.vercel.app']);
  if(productionHosts.has(location.hostname))return;
  function apply(){
    const login=document.getElementById('login');if(!login)return;
    const candidates=[...login.querySelectorAll('.login-card p.muted')];
    const version=candidates.find(node=>/Version\s+/i.test(node.textContent||''))||candidates[0];
    if(version)version.textContent='Version 0.7.0 — Preview de développement';
  }
  [0,100,300,800,1600,3000].forEach(delay=>setTimeout(apply,delay));
})();
