/* StopFlow 0.8.0 — ergonomie Historique + Paramètres, sans toucher aux données ni aux actions. */
(function(){
  if(window.stopflow080HistorySettingsUx?.active)return;

  function injectStyles(){
    if(document.getElementById('stopflow080HistorySettingsUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080HistorySettingsUxStyles';
    style.textContent=`
      #history,#settings{max-width:1120px}
      #history > .card:first-child,#settings > .card:first-child{margin-top:0}

      @media(max-width:720px){
        #history,#settings{padding-bottom:84px}
        #history > .card,#settings > .card{padding:15px;margin-top:12px}
        #history > .card:first-child,#settings > .card:first-child{margin-top:0}

        /* Historique */
        #history > .card > .flex.between{
          display:grid!important;
          grid-template-columns:1fr!important;
          align-items:start!important;
          gap:11px!important;
        }
        #history > .card > .flex.between h2{font-size:20px;line-height:1.2}
        #history > .card > .flex.between p{font-size:13px;line-height:1.4;margin:4px 0 0}
        #history #historyNew{width:100%!important;min-height:48px!important}
        #history .filters{grid-template-columns:1fr!important;gap:9px!important;margin-bottom:12px!important}
        #history .filters .input{width:100%!important;min-height:46px!important;font-size:16px!important}
        #history table[data-sf73-mobile-layout="cards"] tbody>tr{padding:3px 12px!important}
        #history table[data-sf73-mobile-layout="cards"] tbody>tr>td{
          grid-template-columns:minmax(88px,32%) minmax(0,1fr)!important;
          gap:8px!important;
          padding:9px 0!important;
        }
        #history table[data-sf73-mobile-layout="cards"] tbody>tr>td .badge{justify-self:end}
        #history table[data-sf73-mobile-layout="cards"] .btn{width:100%!important;min-height:44px!important}

        /* Détail d'un document dans la modale principale */
        #modalBox:has(#openPdf),
        #modalBox:has(#resumeDraft),
        #modalBox:has(#approvePending){padding:16px!important}
        #modalBox:has(#openPdf) > .flex.between,
        #modalBox:has(#resumeDraft) > .flex.between,
        #modalBox:has(#approvePending) > .flex.between{
          display:grid!important;
          grid-template-columns:1fr!important;
          align-items:start!important;
          gap:10px!important;
        }
        #modalBox:has(#openPdf) > .flex.between .btn,
        #modalBox:has(#resumeDraft) > .flex.between .btn,
        #modalBox:has(#approvePending) > .flex.between .btn{width:100%!important}
        #modalBox:has(#openPdf) > .flex.wrap,
        #modalBox:has(#resumeDraft) > .flex.wrap,
        #modalBox:has(#approvePending) > .flex.wrap{
          display:grid!important;
          grid-template-columns:1fr!important;
          width:100%!important;
          gap:8px!important;
        }
        #modalBox:has(#openPdf) > .flex.wrap .btn,
        #modalBox:has(#resumeDraft) > .flex.wrap .btn,
        #modalBox:has(#approvePending) > .flex.wrap .btn{width:100%!important;min-height:46px!important}
        #modalBox:has(#openPdf) .tablewrap,
        #modalBox:has(#resumeDraft) .tablewrap,
        #modalBox:has(#approvePending) .tablewrap{margin-top:10px}

        /* Paramètres */
        #settings h2{font-size:20px;line-height:1.2}
        #settings .filters{grid-template-columns:1fr!important;gap:10px!important}
        #settings .input{width:100%!important;min-height:46px!important;font-size:16px!important}
        #settings #saveSettings{width:100%!important;min-height:48px!important;margin-top:12px!important}
        #settings .flex.wrap{display:grid!important;grid-template-columns:1fr!important;width:100%!important;gap:8px!important}
        #settings .flex.wrap .btn,
        #settings .flex.wrap label.btn{width:100%!important;min-height:46px!important;text-align:center}
        #settings .card p.muted{font-size:13px;line-height:1.45}
      }
    `;
    document.head.appendChild(style);
  }

  function applyHints(){
    const search=document.getElementById('historySearch');
    if(search&&!search.getAttribute('enterkeyhint'))search.setAttribute('enterkeyhint','search');
    ['establishment','manager','footerText'].forEach(id=>{
      const field=document.getElementById(id);
      if(field&&!field.getAttribute('enterkeyhint'))field.setAttribute('enterkeyhint','done');
    });
  }

  function refresh(){injectStyles();applyHints()}

  window.stopflow080HistorySettingsUx={active:true,version:'0.8.0',refresh};
  refresh();
  [100,300,800,1600,3000].forEach(delay=>setTimeout(refresh,delay));
})();
