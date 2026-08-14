/* StopFlow 0.7.3 — ouverture PDF séparée + écran final simplifié. */
(function(){
  if(window.stopflow073PdfBlankOpen?.active)return;

  const nativeClick=HTMLAnchorElement.prototype.click;
  let observer=null;
  let scheduled=false;

  HTMLAnchorElement.prototype.click=function(){
    try{
      const href=String(this.href||'');
      const download=String(this.getAttribute('download')||'');
      const isGeneratedPdf=/^blob:/i.test(href)&&/\.pdf$/i.test(download);

      if(isGeneratedPdf){
        this.target='_blank';
        this.rel='noopener noreferrer';
        this.removeAttribute('download');
      }
    }catch(error){
      console.warn('StopFlow 0.7.3 — ouverture PDF séparée',error);
    }

    return nativeClick.call(this);
  };

  function simplifyCompletion(){
    const page=document.getElementById('sf73InventoryComplete');
    if(!page)return;

    const share=page.querySelector('#sf73DoneShare');
    if(share)share.remove();

    const pdf=page.querySelector('#sf73DonePdf');
    if(pdf){
      if(String(pdf.textContent||'').trim()!=='Ouvrir le PDF')pdf.textContent='Ouvrir le PDF';
      pdf.setAttribute('aria-label','Ouvrir le PDF');
      pdf.setAttribute('title','Ouvrir le PDF dans une page séparée');
    }
  }

  function scheduleSimplify(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      simplifyCompletion();
    });
  }

  function installCompletionObserver(){
    if(observer||!document.body)return;
    const root=document.getElementById('app')||document.body;
    observer=new MutationObserver(scheduleSimplify);
    observer.observe(root,{childList:true,subtree:true});
  }

  window.stopflow073PdfBlankOpen={
    active:true,
    version:'0.7.3',
    refresh:scheduleSimplify
  };

  installCompletionObserver();
  simplifyCompletion();
})();
