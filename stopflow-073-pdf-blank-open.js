/* StopFlow 0.7.3 — ouvre uniquement les PDF Blob générés dans un onglet séparé. */
(function(){
  if(window.stopflow073PdfBlankOpen?.active)return;

  const nativeClick=HTMLAnchorElement.prototype.click;

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

  window.stopflow073PdfBlankOpen={
    active:true,
    version:'0.7.3'
  };
})();
