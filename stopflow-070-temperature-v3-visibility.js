/* StopFlow 0.7.0 — lisibilité renforcée du relevé Températures V3. Aucun changement métier. */
(function(){
  if(window.stopflow070TemperatureV3Visibility?.active)return;
  window.stopflow070TemperatureV3Visibility={active:true,refresh:decorate};

  function injectStyles(){
    if(document.getElementById('sf70TemperatureV3VisibilityStyles'))return;
    const style=document.createElement('style');
    style.id='sf70TemperatureV3VisibilityStyles';
    style.textContent=`
      #sf70TemperatureV3 .sf70-tv3-reading-list{grid-template-columns:1fr!important;gap:14px!important}
      #sf70TemperatureV3 .sf70-tv3-reading{display:grid!important;grid-template-columns:1fr!important;gap:16px!important;padding:18px!important;border:1px solid #dce5ef!important;border-radius:16px!important;background:#fff!important;box-shadow:0 5px 16px rgba(20,42,70,.045)!important}
      #sf70TemperatureV3 .sf70-tv3-reading.ok{border-color:#91d3ae!important;background:#fbfffc!important;box-shadow:0 0 0 2px rgba(22,145,82,.08)!important}
      #sf70TemperatureV3 .sf70-tv3-reading.alert{border-color:#e99a9a!important;background:#fff8f8!important;box-shadow:0 0 0 2px rgba(190,52,52,.08)!important}
      #sf70TemperatureV3 .sf70-tv3-reading-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding-bottom:13px;border-bottom:1px solid #edf1f5}
      #sf70TemperatureV3 .sf70-tv3-reading .sf70-tv3-name{display:block;font-size:18px;line-height:1.2;margin:0 0 5px;color:var(--text)}
      #sf70TemperatureV3 .sf70-tv3-reading .sf70-tv3-meta{font-size:11.5px;line-height:1.45;margin:0;color:var(--muted)}
      #sf70TemperatureV3 .sf70-tv3-limit-badge{display:inline-flex;align-items:center;white-space:nowrap;padding:6px 10px;border-radius:999px;background:#eef4fb;color:#315a7e;font-size:11px;font-weight:900}
      #sf70TemperatureV3 .sf70-tv3-reading-fields{display:grid;grid-template-columns:minmax(190px,.55fr) minmax(280px,1.45fr);gap:18px;align-items:start}
      #sf70TemperatureV3 .sf70-tv3-reading .field{margin:0!important;min-width:0}
      #sf70TemperatureV3 .sf70-tv3-reading .field label{display:block;font-size:11px;font-weight:900;color:#42566d;margin:0 0 7px}
      #sf70TemperatureV3 .sf70-tv3-value-wrap{position:relative;display:flex;align-items:center}
      #sf70TemperatureV3 .sf70-tv3-value-wrap .sf70-tv3-value{width:100%!important;height:58px!important;padding:8px 50px 8px 14px!important;font-size:24px!important;font-weight:900!important;letter-spacing:.01em;background:#fff}
      #sf70TemperatureV3 .sf70-tv3-unit{position:absolute;right:14px;font-size:15px;font-weight:900;color:#607086;pointer-events:none}
      #sf70TemperatureV3 .sf70-tv3-note{width:100%!important;height:58px!important;padding:10px 13px!important}
      #sf70TemperatureV3 .sf70-tv3-live-status{display:flex;align-items:center;min-height:27px;margin-top:7px;font-size:12px;font-weight:900;color:#778597}
      #sf70TemperatureV3 .sf70-tv3-live-status.ok{color:#167247}
      #sf70TemperatureV3 .sf70-tv3-live-status.alert{color:#a12d2d}
      #sf70TemperatureV3 .sf70-tv3-progress{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:12px 0 14px;padding:13px 15px;border:1px solid #dce5ef;border-radius:12px;background:#f8fbff}
      #sf70TemperatureV3 .sf70-tv3-progress-title{font-weight:900;color:#263f58;font-size:13px}
      #sf70TemperatureV3 .sf70-tv3-progress-sub{margin-top:2px;color:var(--muted);font-size:10.5px}
      #sf70TemperatureV3 .sf70-tv3-progress-count{white-space:nowrap;font-size:16px;font-weight:900;color:#2463eb}
      #sf70TemperatureV3 .sf70-tv3-progress.complete{background:#f2fbf6;border-color:#b8dec8}
      #sf70TemperatureV3 .sf70-tv3-progress.complete .sf70-tv3-progress-count,#sf70TemperatureV3 .sf70-tv3-progress.complete .sf70-tv3-progress-title{color:#167247}
      #sf70TemperatureV3 [data-tv3-action="save-round"]{width:100%;min-height:50px;margin-top:14px!important;font-size:13px;font-weight:900}
      #sf70TemperatureV3 [data-tv3-action="save-round"]:disabled{opacity:.48;cursor:not-allowed;filter:grayscale(.2)}
      #sf70TemperatureV3 .sf70-tv3-head [data-tv3-action="reload"]{opacity:.68}
      @media(max-width:720px){
        #sf70TemperatureV3 .sf70-tv3-reading{padding:15px!important;gap:13px!important}
        #sf70TemperatureV3 .sf70-tv3-reading-head{display:block}
        #sf70TemperatureV3 .sf70-tv3-limit-badge{margin-top:9px}
        #sf70TemperatureV3 .sf70-tv3-reading-fields{grid-template-columns:1fr;gap:12px}
        #sf70TemperatureV3 .sf70-tv3-value-wrap .sf70-tv3-value{height:64px!important;font-size:28px!important}
        #sf70TemperatureV3 .sf70-tv3-note{height:50px!important}
        #sf70TemperatureV3 .sf70-tv3-progress{align-items:flex-start}
      }
    `;
    document.head.appendChild(style);
  }

  function numberText(value){const n=Number(value);return Number.isFinite(n)?String(n).replace('.',','):String(value??'')}

  function decorateRow(row){
    const input=row.querySelector('.sf70-tv3-value'),note=row.querySelector('.sf70-tv3-note');if(!input)return;
    input.placeholder='Ex. 4,2';if(note)note.placeholder='Facultatif — ex. porte restée ouverte';

    let info=row.firstElementChild;
    if(info&&!info.classList.contains('sf70-tv3-reading-head')){
      info.classList.add('sf70-tv3-reading-head');
      const meta=info.querySelector('.sf70-tv3-meta');
      if(meta)meta.textContent=(meta.textContent||'').replace(/\s*·\s*limites\s*-?\d+(?:[.,]\d+)?\s*à\s*-?\d+(?:[.,]\d+)?\s*°C/i,'').trim();
      if(!info.querySelector('.sf70-tv3-limit-badge')){
        const badge=document.createElement('span');badge.className='sf70-tv3-limit-badge';badge.textContent=`Limites : ${numberText(row.dataset.min)} à ${numberText(row.dataset.max)} °C`;info.appendChild(badge);
      }
    }

    const valueField=input.closest('.field');
    if(valueField&&!input.closest('.sf70-tv3-value-wrap')){
      const wrap=document.createElement('div');wrap.className='sf70-tv3-value-wrap';input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);
      const unit=document.createElement('span');unit.className='sf70-tv3-unit';unit.textContent='°C';wrap.appendChild(unit);
    }
    if(valueField&&!valueField.querySelector('.sf70-tv3-live-status')){const status=document.createElement('div');status.className='sf70-tv3-live-status';valueField.appendChild(status)}

    const noteField=note?.closest('.field');
    if(valueField&&noteField&&!valueField.parentElement.classList.contains('sf70-tv3-reading-fields')){
      const group=document.createElement('div');group.className='sf70-tv3-reading-fields';valueField.parentNode.insertBefore(group,valueField);group.append(valueField,noteField);
    }
    updateRow(row);
  }

  function updateRow(row){
    const input=row?.querySelector('.sf70-tv3-value'),status=row?.querySelector('.sf70-tv3-live-status');if(!input||!status)return;
    row.classList.remove('ok','alert');status.classList.remove('ok','alert');
    const raw=input.value.trim();if(raw===''){status.textContent='À relever';return}
    const value=Number(raw.replace(',','.')),min=Number(row.dataset.min),max=Number(row.dataset.max);
    if(!Number.isFinite(value)){status.textContent='Valeur à vérifier';status.classList.add('alert');return}
    const good=value>=min&&value<=max;row.classList.add(good?'ok':'alert');status.classList.add(good?'ok':'alert');status.textContent=good?'✓ Conforme':`! Hors limite — attendu ${numberText(min)} à ${numberText(max)} °C`;
  }

  function updateProgress(page){
    const rows=[...page.querySelectorAll('.sf70-tv3-reading')];if(!rows.length)return;
    const total=rows.length,done=rows.filter(row=>row.querySelector('.sf70-tv3-value')?.value.trim()!=='').length;
    const card=page.querySelector('#sf70Tv3Body > .card:first-child');if(!card)return;
    let progress=card.querySelector('.sf70-tv3-progress');
    if(!progress){progress=document.createElement('div');progress.className='sf70-tv3-progress';const list=card.querySelector('.sf70-tv3-list');if(list)card.insertBefore(progress,list);else card.appendChild(progress)}
    progress.classList.toggle('complete',done===total&&total>0);
    progress.innerHTML=`<div><div class="sf70-tv3-progress-title">${done===total?'Relevé complet':'Progression du relevé'}</div><div class="sf70-tv3-progress-sub">${done===total?'Toutes les températures sont encodées.':'Encodez la température de chaque équipement.'}</div></div><div class="sf70-tv3-progress-count">${done} / ${total}</div>`;
    card.querySelector('.sf70-tv3-list')?.classList.add('sf70-tv3-reading-list');
    const save=card.querySelector('[data-tv3-action="save-round"]');if(save){save.disabled=done!==total;save.textContent=done===total?'Enregistrer le relevé complet':'Complétez toutes les températures'}
  }

  function decorate(){injectStyles();const page=document.getElementById('sf70TemperatureV3');if(!page)return;page.querySelectorAll('.sf70-tv3-reading').forEach(decorateRow);updateProgress(page)}

  document.addEventListener('input',event=>{const input=event.target.closest?.('#sf70TemperatureV3 .sf70-tv3-value');if(!input)return;updateRow(input.closest('.sf70-tv3-reading'));updateProgress(document.getElementById('sf70TemperatureV3'))},true);
  document.addEventListener('pointerup',event=>{if(!event.target.closest?.('#sf70TemperatureV3,[data-sf70-card="temperatures.use"]'))return;[0,60,180,450].forEach(delay=>setTimeout(decorate,delay))},true);
  [0,250,700,1600,3000].forEach(delay=>setTimeout(decorate,delay));
})();
