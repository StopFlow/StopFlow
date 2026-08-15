/* StopFlow 0.8.0 — ergonomie terrain Checklists + Températures, sans modifier la logique métier. */
(function(){
  if(window.stopflow080TerrainUx?.active)return;

  function injectStyles(){
    if(document.getElementById('stopflow080TerrainUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080TerrainUxStyles';
    style.textContent=`
      /* Checklists */
      #checklists{max-width:1080px}
      #checklists .checklist-template{min-width:0}
      #checklists .checklist-run-row{min-width:0}
      #checklists .checklist-item-label{line-height:1.35;overflow-wrap:anywhere}
      #checklists .checklist-item-help{line-height:1.35}
      #checklists .checklist-anomaly textarea{width:100%}

      /* Températures V3 */
      #sf70TemperatureV3 .sf70-tv3-value,
      #sf70TemperatureV3 .sf70-tv3-note{width:100%}
      #sf70TemperatureV3 .sf70-tv3-round-head{min-height:48px;touch-action:manipulation}
      #sf70TemperatureV3 .sf70-tv3-history-line{align-items:flex-start}

      @media(max-width:720px){
        #checklists,#sf70TemperatureV3{padding-bottom:84px}

        /* Checklists : actions directes et cartes lisibles */
        #checklists .checklist-toolbar{
          display:grid!important;
          grid-template-columns:1fr!important;
          align-items:start!important;
          gap:10px!important;
        }
        #checklists .checklist-toolbar > .btn,
        #checklists #refreshChecklists,
        #checklists #backToChecklists{
          width:100%!important;
          min-height:46px!important;
        }
        #checklists .checklist-toolbar h2{font-size:21px;line-height:1.2}
        #checklists .checklist-toolbar p{font-size:13px;line-height:1.4;margin:4px 0 0}
        #checklists .card{padding:15px;margin-top:12px}
        #checklists .card:first-child{margin-top:0}
        #checklists .card h2{font-size:19px;line-height:1.2}
        #checklists .checklist-template-grid{grid-template-columns:1fr!important;gap:9px!important}
        #checklists .checklist-template{padding:13px!important;gap:8px!important}
        #checklists .checklist-template h3{font-size:16px;line-height:1.25}
        #checklists .checklist-template .btn{width:100%;min-height:46px}
        #checklists .checklist-pill{font-size:10px;padding:4px 7px}
        #checklists .checklist-run-row{padding:12px!important;gap:8px!important}
        #checklists .checklist-run-row .btn{min-height:44px}
        #checklists .filters{grid-template-columns:1fr!important;gap:10px!important}
        #checklists .filters .input{width:100%;font-size:16px;min-height:46px}
        #checklists #submitChecklistSuggestion,
        #checklists #createChecklistTemplate{width:100%!important;min-height:48px!important}
        #checklists #checklistManagerPanel > .flex.between{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}

        /* Runner : une tâche = une carte tactile simple */
        #checklists #checklistRunner .card{padding:14px}
        #checklists #checklistRunnerActions{width:100%;display:grid!important;grid-template-columns:1fr!important;gap:8px!important}
        #checklists #checklistRunnerActions .btn{width:100%!important;min-height:46px!important}
        #checklists .checklist-section{border-radius:13px;margin-top:10px}
        #checklists .checklist-section-title{padding:10px 12px;font-size:14px}
        #checklists .checklist-item{display:block!important;padding:12px!important}
        #checklists .checklist-item-main{gap:10px;align-items:flex-start}
        #checklists .checklist-item-main input[type="checkbox"]{width:26px!important;height:26px!important;margin-top:0!important}
        #checklists .checklist-item-label{font-size:15px}
        #checklists .checklist-item-help{font-size:12px;margin-top:4px}
        #checklists .checklist-item-actions{display:grid!important;grid-template-columns:1fr!important;width:100%;gap:7px!important;margin-top:10px}
        #checklists .checklist-item-actions .btn,
        #checklists .checklist-item-actions button{width:100%!important;min-height:44px!important}
        #checklists .checklist-anomaly{margin:0 12px 12px!important;padding:10px!important}
        #checklists .checklist-anomaly textarea{font-size:16px;min-height:92px}
        #checklists .checklist-progress-line{font-size:12px;gap:8px}

        /* Températures : saisie verticale, sans zoom Safari */
        #sf70TemperatureV3 .sf70-tv3-back{display:none!important}
        #sf70TemperatureV3 .sf70-tv3-head{align-items:flex-start!important;gap:9px!important;margin-bottom:10px!important}
        #sf70TemperatureV3 .sf70-tv3-head h2{font-size:21px;line-height:1.2}
        #sf70TemperatureV3 .sf70-tv3-head .muted{font-size:13px;line-height:1.4}
        #sf70TemperatureV3 .sf70-tv3-head .btn{width:100%!important;min-height:46px!important}
        #sf70TemperatureV3 .sf70-tv3-tabs{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px!important;margin:10px 0 12px!important}
        #sf70TemperatureV3 .sf70-tv3-tab{width:100%;min-width:0;min-height:46px;padding:8px 9px;font-size:13px;line-height:1.2}
        #sf70TemperatureV3 .card{padding:14px;margin-top:12px}
        #sf70TemperatureV3 .card:first-child{margin-top:0}
        #sf70TemperatureV3 .card h2{font-size:19px;line-height:1.2}
        #sf70TemperatureV3 .sf70-tv3-list{gap:9px}
        #sf70TemperatureV3 .sf70-tv3-reading{grid-template-columns:1fr!important;padding:13px!important;gap:10px!important}
        #sf70TemperatureV3 .sf70-tv3-reading .field{gap:5px}
        #sf70TemperatureV3 .sf70-tv3-reading label{font-size:13px}
        #sf70TemperatureV3 .sf70-tv3-reading input{font-size:16px!important;min-height:48px!important}
        #sf70TemperatureV3 [data-tv3-action="save-round"]{width:100%!important;min-height:50px!important;margin-top:10px!important}
        #sf70TemperatureV3 .sf70-tv3-equipment{grid-template-columns:1fr!important;padding:12px!important;gap:9px!important}
        #sf70TemperatureV3 .sf70-tv3-actions{display:grid!important;grid-template-columns:1fr 1fr!important;width:100%;gap:7px!important}
        #sf70TemperatureV3 .sf70-tv3-actions .btn{width:100%!important;min-height:44px!important}
        #sf70TemperatureV3 .sf70-tv3-round-head{padding:11px!important;gap:8px!important;align-items:flex-start!important}
        #sf70TemperatureV3 .sf70-tv3-round-head > span:first-child{min-width:0}
        #sf70TemperatureV3 .sf70-tv3-round-head > span:last-child{flex:0 0 auto}
        #sf70TemperatureV3 .sf70-tv3-round-detail{padding:8px 11px!important}
        #sf70TemperatureV3 .sf70-tv3-history-line{display:grid!important;grid-template-columns:1fr!important;gap:3px!important;padding:8px 0!important;font-size:12px!important}
        #sf70TemperatureV3 .sf70-tv3-history-line > span:last-child{text-align:left}
        #sf70TemperatureV3 .sf70-tv3-dialog{padding:16px!important;border-radius:16px!important}
        #sf70TemperatureV3 .sf70-tv3-formgrid,
        #sf70TemperatureV3 .sf70-tv3-formgrid.three{grid-template-columns:1fr!important;gap:9px!important}
        #sf70TemperatureV3 .sf70-tv3-dialog input,
        #sf70TemperatureV3 .sf70-tv3-dialog select,
        #sf70TemperatureV3 .sf70-tv3-dialog textarea{font-size:16px!important;min-height:46px!important}
      }

      @media(max-width:430px){
        #sf70TemperatureV3 .sf70-tv3-tabs{grid-template-columns:1fr!important}
        #sf70TemperatureV3 .sf70-tv3-actions{grid-template-columns:1fr!important}
      }
    `;
    document.head.appendChild(style);
  }

  function applyHints(){
    document.querySelectorAll('#checklists input.input,#checklists textarea.input').forEach(field=>{
      if(!field.getAttribute('enterkeyhint'))field.setAttribute('enterkeyhint',field.tagName==='TEXTAREA'?'done':'next');
    });
    document.querySelectorAll('#sf70TemperatureV3 .sf70-tv3-value').forEach(field=>field.setAttribute('inputmode','decimal'));
  }

  function refresh(){
    injectStyles();
    applyHints();
  }

  window.stopflow080TerrainUx={active:true,version:'0.8.0',refresh};
  refresh();
  [100,300,800,1600,3000].forEach(delay=>setTimeout(refresh,delay));
})();
