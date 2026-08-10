/* StopFlow 0.7.0 — navigation retour cohérente. */
(function(){
  if(window.stopflow070BackNavigation?.active)return;

  const LABELS={cuisine:'Cuisine',salle:'Salle',nettoyage:'Entretien & hygiène',general:'Général'};
  window.stopflow070BackNavigation={active:true,refresh:apply};

  function injectStyles(){
    if(document.getElementById('sf70BackNavigationStyles'))return;
    const style=document.createElement('style');
    style.id='sf70BackNavigationStyles';
    style.textContent=`.sf70-coherent-back{display:inline-flex;align-items:center;border:0;background:transparent;color:var(--blue);font-weight:800;padding:4px 0 10px;margin:0 0 2px;cursor:pointer;touch-action:manipulation}.sf70-coherent-back:hover{text-decoration:underline}.sf70-coherent-back:focus-visible{outline:3px solid #dce8ff;outline-offset:3px;border-radius:6px}`;
    document.head.appendChild(style);
  }

  function navigation(){return window.stopflow070CardNavigation}

  function currentPage(){
    return [...document.querySelectorAll('#app .page')].find(node=>!node.classList.contains('hidden'))||null;
  }

  function targetFor(pageNode){
    if(!pageNode)return null;
    const id=pageNode.id||'';
    if(id==='sf70Home'||id==='sf70TemperatureV3'||id==='sf70GeneralDetail')return null;
    const zone=navigation()?.runtime?.currentZone||'home';
    if(id==='sf70ZonePage'&&LABELS[zone])return {id:'home',label:'Accueil'};
    if(LABELS[zone])return {id:zone,label:LABELS[zone]};
    return null;
  }

  function navigate(target){
    const nav=navigation();
    if(!nav)return;
    if(target==='home')nav.openHome?.();
    else if(LABELS[target])nav.openZone?.(target);
    setTimeout(apply,0);
    setTimeout(apply,100);
  }

  function ensureButton(pageNode,target){
    let button=pageNode.querySelector(':scope > .sf70-coherent-back');
    if(!target){button?.remove();return}
    if(pageNode.querySelector(':scope > .sf70-back-button, :scope > .sf70-tv3-back')){button?.remove();return}
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='sf70-coherent-back';
      pageNode.prepend(button);
      button.addEventListener('pointerdown',event=>{
        if(event.button!=null&&event.button!==0)return;
        event.preventDefault();
        navigate(button.dataset.target);
      });
      button.addEventListener('click',event=>event.preventDefault());
    }
    button.dataset.target=target.id;
    button.textContent=`← Retour à ${target.label}`;
  }

  function apply(){
    injectStyles();
    const pageNode=currentPage();
    document.querySelectorAll('.sf70-coherent-back').forEach(button=>{
      if(!pageNode||!pageNode.contains(button))button.remove();
    });
    if(pageNode)ensureButton(pageNode,targetFor(pageNode));
  }

  document.addEventListener('click',()=>{
    setTimeout(apply,0);
    setTimeout(apply,120);
  });
  document.addEventListener('pointerup',()=>setTimeout(apply,40));

  let count=0;
  const timer=setInterval(()=>{
    apply();
    if(++count>=40)clearInterval(timer);
  },100);
  [0,300,900,1800,3000].forEach(delay=>setTimeout(apply,delay));
})();
