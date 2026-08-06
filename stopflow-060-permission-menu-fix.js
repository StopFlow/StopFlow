/* StopFlow 0.6.0 — aligner les entrées Bureau sur les autorisations réelles. */
(function(){
  if(window.stopflow060PermissionMenuFix)return;
  window.stopflow060PermissionMenuFix=true;

  const managedPages=["suppliers","articles","users","settings"];

  function sourceAllows(pageId){
    if(!document.getElementById(pageId))return false;
    if(pageId==="users"&&typeof canManageUsers==="function"&&!canManageUsers())return false;
    const source=document.querySelector(`.sidebar>.nav button[data-page="${pageId}"]`);
    return !source||!source.classList.contains("hidden");
  }

  function apply(){
    managedPages.forEach(pageId=>{
      const visible=sourceAllows(pageId);
      document.querySelectorAll(`[data-sf54="page:${pageId}"]`).forEach(button=>button.classList.toggle("hidden",!visible));
    });
  }

  if(typeof page==="function"){
    const previousPage=page;
    page=function(){const result=previousPage(...arguments);[0,80,250].forEach(delay=>setTimeout(apply,delay));return result};
  }
  if(typeof applyRole==="function"){
    const previousApplyRole=applyRole;
    applyRole=function(){const result=previousApplyRole(...arguments);[0,80,250].forEach(delay=>setTimeout(apply,delay));return result};
  }

  const observer=new MutationObserver(()=>setTimeout(apply,0));
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
  [0,100,400,900].forEach(delay=>setTimeout(apply,delay));
})();
