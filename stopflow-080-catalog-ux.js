/* StopFlow 0.8.0 — améliore l’ergonomie Articles / Fournisseurs sans toucher aux données. */
(function(){
  if(window.stopflow080CatalogUx?.active)return;

  let scheduled=false;

  function injectStyles(){
    if(document.getElementById('stopflow080CatalogUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080CatalogUxStyles';
    style.textContent=`
      #articles > .card,#suppliers > .card{margin-top:0}
      #articles .tablewrap,#suppliers .tablewrap{margin-top:14px}
      #articles [data-price],#articles [data-target]{max-width:100%}

      @media(max-width:620px){
        #articles,#suppliers{padding-bottom:84px}
        #articles > .card,#suppliers > .card{padding:15px}
        #articles > .card > .flex.between,#suppliers > .card > .flex.between{
          display:grid!important;
          grid-template-columns:1fr!important;
          align-items:start!important;
          gap:12px!important;
        }
        #articles > .card > .flex.between h2,#suppliers > .card > .flex.between h2{
          font-size:20px;line-height:1.2
        }
        #articles > .card > .flex.between p,#suppliers > .card > .flex.between p{
          font-size:13px;line-height:1.4;margin:4px 0 0
        }
        #articles > .card > .flex.between > .flex{
          display:grid!important;
          grid-template-columns:1fr!important;
          width:100%!important;
          gap:9px!important;
        }
        #articles #articleSupplier,#articles #addArticle,#suppliers #addSupplier{
          width:100%!important;min-height:48px;font-size:16px
        }
        #suppliers .kpis{
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          gap:8px!important;
          margin:12px 0!important;
        }
        #suppliers .kpi{padding:10px 8px!important}
        #suppliers .kpi span{font-size:11px}
        #suppliers .kpi strong{font-size:22px;margin-top:4px}
        #suppliers #supplierSearch{font-size:16px;min-height:46px}

        #articles table[data-sf73-mobile-layout="cards"] tbody>tr,
        #suppliers table[data-sf73-mobile-layout="cards"] tbody>tr{
          padding:3px 12px!important
        }
        #articles table[data-sf73-mobile-layout="cards"] tbody>tr>td,
        #suppliers table[data-sf73-mobile-layout="cards"] tbody>tr>td{
          grid-template-columns:minmax(90px,34%) minmax(0,1fr)!important;
          gap:8px!important;
          padding:9px 0!important
        }
        #articles table[data-sf73-mobile-layout="cards"] input.input{
          width:100%!important;min-width:82px!important;font-size:16px
        }
        #articles table[data-sf73-mobile-layout="cards"] input[type="checkbox"],
        #suppliers table[data-sf73-mobile-layout="cards"] input[type="checkbox"]{
          width:24px;height:24px;accent-color:var(--blue)
        }
        #articles table[data-sf73-mobile-layout="cards"] .flex{
          width:100%;justify-content:flex-end;gap:5px!important
        }
        #articles table[data-sf73-mobile-layout="cards"] .btn,
        #suppliers table[data-sf73-mobile-layout="cards"] .btn{
          min-height:44px!important
        }

        #modalBox:has(#mName) .filters,
        #modalBox:has(#supplierName) .filters{
          grid-template-columns:1fr!important;
          gap:10px!important;
        }
        #modalBox:has(#mName) .input,
        #modalBox:has(#supplierName) .input{
          width:100%!important;font-size:16px;min-height:46px
        }
        #modalBox:has(#mName) textarea.input,
        #modalBox:has(#supplierName) textarea.input{min-height:92px}
        #modalBox:has(#mName) #saveArticle,
        #modalBox:has(#supplierName) #saveSupplier{
          width:100%!important;min-height:48px
        }
      }
    `;
    document.head.appendChild(style);
  }

  function setInputMode(selector,mode){
    document.querySelectorAll(selector).forEach(input=>{
      if(input.getAttribute('inputmode')!==mode)input.setAttribute('inputmode',mode);
    });
  }

  function enhance(){
    injectStyles();
    const articles=document.getElementById('articles');
    const suppliers=document.getElementById('suppliers');
    if(articles)articles.dataset.sf80CatalogUx='1';
    if(suppliers)suppliers.dataset.sf80CatalogUx='1';

    setInputMode('#articles [data-price],#mPrice','decimal');
    setInputMode('#articles [data-target],#mTarget,#supplierSort','numeric');
    setInputMode('#supplierPhone','tel');
    setInputMode('#supplierEmail','email');

    document.querySelectorAll('#articles [data-edit],#suppliers [data-edit-supplier]').forEach(button=>{
      if(!button.getAttribute('aria-label'))button.setAttribute('aria-label','Modifier');
    });
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;enhance()});
  }

  const observer=new MutationObserver(schedule);
  if(document.body)observer.observe(document.body,{subtree:true,childList:true});

  window.stopflow080CatalogUx={active:true,version:'0.8.0',refresh:schedule};
  schedule();
  [100,300,800,1600].forEach(delay=>setTimeout(schedule,delay));
})();
