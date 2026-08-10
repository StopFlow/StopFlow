/* StopFlow 0.7.0 — fermeture tactile fiable des modales Températures V3. */
(function(){
  if(window.stopflow070TemperatureV3ModalFix)return;
  window.stopflow070TemperatureV3ModalFix=true;

  function closeOverlay(){
    const overlay=document.getElementById('sf70Tv3Overlay');
    if(!overlay)return;
    overlay.classList.add('hidden');
  }

  function shouldClose(event){
    const overlay=document.getElementById('sf70Tv3Overlay');
    if(!overlay||overlay.classList.contains('hidden'))return false;
    return event.target===overlay||Boolean(event.target.closest?.('[data-tv3-modal="close"]'));
  }

  function handleClose(event){
    if(!shouldClose(event))return;
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    closeOverlay();
  }

  function install(){
    const overlay=document.getElementById('sf70Tv3Overlay');
    if(!overlay||overlay.dataset.sf70ModalCloseFix==='1')return Boolean(overlay);
    overlay.dataset.sf70ModalCloseFix='1';
    overlay.addEventListener('pointerup',handleClose,true);
    overlay.addEventListener('touchend',handleClose,{capture:true,passive:false});
    overlay.addEventListener('click',handleClose,true);
    const button=overlay.querySelector('[data-tv3-modal="close"]');
    if(button)button.style.touchAction='manipulation';
    return true;
  }

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')closeOverlay();
  });

  let attempts=0;
  const timer=setInterval(()=>{
    if(install()||++attempts>=50)clearInterval(timer);
  },100);
  [0,200,600,1200].forEach(delay=>setTimeout(install,delay));
})();
