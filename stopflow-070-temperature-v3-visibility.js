/* StopFlow 0.7.0 — amélioration visuelle du relevé Températures V3. Aucun changement métier. */
(function(){
  if(window.stopflow070TemperatureV3Visibility?.active)return;
  window.stopflow070TemperatureV3Visibility={active:true,refresh:decorate};

  function injectStyles(){
    if(document.getElementById('sf70TemperatureV3VisibilityStyles'))return;
    const style=document.createElement('style');
    style.id='sf70TemperatureV3VisibilityStyles';
    style.textContent=`
      #sf70TemperatureV3 .sf70-tv3-reading{
        display:grid!important;
        grid-template-columns:minmax(0,1fr)!important;
        gap:14px!important;
        align-items:stretch!important;
        padding:18px!important;
        border:1px solid #dce5ef!important;
        border-radius:16px!important;
        background:#fff!important;
        box-shadow:0 5px 16px rgba(20,42,70,.045)!important;
      }
      #sf70TemperatureV3 .sf70-tv3-reading.ok{border-color:#9fd8b7!important;background:#fbfffc!important;box-shadow:0 0 0 2px rgba(22,145,82,.07)!important}
      #sf70TemperatureV3 .sf70-tv3-reading.alert{border-color:#efa8a8!important;background:#fff9f9!important;box-shadow:0 0 0 2px rgba(190,52,52,.07)!important}
      #sf70TemperatureV3 .sf70-tv3-reading > div:first-child{padding-bottom:11px;border-bottom:1px solid #edf1f5}
      #sf70TemperatureV3 .sf70-tv3-reading .sf70-tv3-name{display:block;font-size:17px;line-height:1.25;margin-bottom:7px;color:var(--text)}
      #sf70TemperatureV3 .sf70-tv3-reading .sf70-tv3-meta{font-size:11.5px;line-height:1.45;margin-top:0}
      #sf70TemperatureV3 .sf70-tv3-limit-badge{display:inline-flex;align-items:center;margin-top:9px;padding:5px 9px;border-radius:999px;background:#eef4fb;color:#365b7d;font-size:11px;font-weight:850}
      #sf70TemperatureV3 .sf70-tv3-reading-fields{display:grid;grid-template-columns:minmax(170px,.65fr) minmax(240px,1.35fr);gap:14px;align-items:end}
      #sf70TemperatureV3 .sf70-tv3-reading .field label{font-size:11px;font-weight:850;color:#42566d;margin-bottom:6px}
      #sf70TemperatureV3 .sf70-tv3-value-wrap{position:relative;display:flex;align-items:center}
      #sf70TemperatureV3 .sf70-tv3-value-wrap .sf70-tv3-value{height:52px!important;padding:8px 48px 8px 13px!important;font-size:22px!important;font-weight:850!important;letter-spacing:.01em}
      #sf70TemperatureV3 .sf70-tv3-unit{position:absolute;right:13px;font-size:14px;font-weight:850;color:#607086;pointer-events:none}
      #sf70TemperatureV3 .sf70-tv3-note{height:52px!important}
      #sf70TemperatureV3 .sf70-tv3-live-status{display:flex;align-items:center;gap:6px;min-height:24px;margin-top:7px;font-size:11.5px;font-weight:850;color:#778597}
      #sf70TemperatureV3 .sf70-tv3-live-status.ok{color:#167247}
      #sf70TemperatureV3 .sf70-tv3-live-status.alert{color:#a12d2d}
      #sf70TemperatureV3 .sf70-tv3-progress{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:12px 0 4px;padding:12px 14px;border:1px solid #dce5ef;border-radius:12px;background:#f8fbff}
      #sf70TemperatureV3 .sf70-tv3-progress-copy{min-width:0}
      #sf70TemperatureV3 .sf70-tv3-progress-title{font-weight:900;color:#263f58;font-size:13px}
      #sf70TemperatureV3 .sf70-tv3-progress-sub{margin-top:2px;color:var(--muted);font-size:10.5px}
      #sf70TemperatureV3 .sf70-tv3-progress-count{white-space:nowrap;font-size:15px;font-weight:900;color:#2463eb}
      #sf70TemperatureV3 .sf70-tv3-progress.complete{background:#f2fbf6;border-color:#b8dec8}
      #sf70TemperatureV3 .sf70-tv3-progress.complete .sf70-tv3-progress-count,#sf70TemperatureV3 .sf70-tv3-progress.complete .sf70-tv3-progress-title{color:#167247}
      #sf70TemperatureV3 [data-tv3-action="save-round"]{width:100%;min-height:48px;margin-top:14px!important;font-size:13px;font-weight:900}
      #sf70TemperatureV3 [data-tv3-action="save-round"]:disabled{opacity:.48;cursor:not-allowed;filter:grayscale(.2)}
      #sf70TemperatureV3 .sf70-tv3-head [data-tv3-action="reload"]{opacity:.72}
      @media(min-width:900px){#sf70TemperatureV3 .sf70-tv3-list.sf70-tv3-reading-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}}
      @media(max-width:720px){
        #sf70TemperatureV3 .sf70-tv3-reading{padding:15px!important}
        #sf70TemperatureV3 .sf70-tv3-reading-fields{grid-template-columns:1fr}
        #sf70TemperatureV3 .sf70-tv3-value-wrap .sf70-tv3-value{height:58px!important;font-size:25px!important}
        #sf70TemperatureV3 .sf70-tv3-note{height:48px!important}
        #sf70TemperatureV3 .sf70-tv3-progress{align-items:flex-start}
      }
    `;
    document.head.appendChild(style);
  }

  function numberText(value){
    const n=Number(value);
    return Number.isFinite(n)?String(n).replace('.',','):String(value??'');
  }

  function decorateRow(row){
    const input=row.querySelector('.sf70-tv3-value');
    const note=row.querySelector('.sf70-tv3-note');
    if(!input)return;

    input.placeholder='Ex. 4,2';
    if(note)note.placeholder='Facultatif — ex. porte restée ouverte';

    const first=row.firstElementChild;
    if(first&&!first.querySelector('.sf70-tv3-limit-badge')){
      const badge=document.createElement('span');
      badge.className='sf70-tv3-limit-badge';
      badge.textContent=`Limites : ${numberText(row.dataset.min)} à ${numberText(row.dataset.max)} °C`;
      first.appendChild(badge);
    }

    const valueField=input.closest('.field');
    if(valueField&&!input.closest('.sf70-tv3-value-wrap')){
      const wrap=document.createElement('div');
      wrap.className='sf70-tv3-value-wrap';
      input.parentNode.insertBefore(wrap,input);
      wrap.appendChild(input);
      const unit=document.createElement('span');unit.className='sf70-tv3-unit';unit.textContent='°C';wrap.appendChild(unit);
    }
    if(valueField&&!valueField.querySelector('.sf70-tv3-live-status')){
      const status=document.createElement('div');status.className='sf70-tv3-live-status';valueField.appendChild(status);
    }

    const fields=[valueField,note?.closest('.field')].filter(Boolean);
    if(fields.length===2&&!fields[0].parentElement.classList.contains('sf70-tv3-reading-fields')){
      const group=document.createElement('div');group.className='sf70-tv3-reading-fields';
      fields[0].parentNode.insertBefore(group,fields[0]);
      group.appendChild(fields[0]);group.appendChild(fields[1]);
    }
    updateRow(row);
  }

  function updateRow(row){
    const input=row.querySelector('.sf70-tv3-value');
    const status=row.querySelector('.sf70-tv3-live-status');
    if(!input||!status)return;
    row.classList.remove('ok','alert');status.classList.remove('ok','alert');
    const raw=input.value.trim();
    if(raw===''){status.textContent='À relever';return}
    const value=Number(raw.replace(',','.')),min=Number(row.dataset.min),max=Number(row.dataset.max);
    if(!Number.isFinite(value)){status.textContent='Valeur à vérifier';status.classList.add('alert');return}
    const good=value>=min&&value<=max;
    row.classList.add(good?'ok':'alert');status.classList.add(good?'ok':'alert');
    status.textContent=good?'✓ Conforme':`! Hors limite (${numberText(min)} à ${numberText(max)} °C)`;
  }

  function updateProgress(page){
    const rows=[...page.querySelectorAll('.sf70-tv3-reading')];
    if(!rows.length)return;
    const total=rows.length;
    const done=rows.filter(row=>row.querySelector('.sf70-tv3-value')?.value.trim()!=='').length;
    const card=page.querySelector('#sf70Tv3Body > .card:first-child');if(!card)return;
    let progress=card.querySelector('.sf70-tv3-progress');
    if(!progress){
      progress=document.createElement('div');progress.className='sf70-tv3-progress';
      const list=card.querySelector('.sf70-tv3-list');if(list)card.insertBefore(progress,list);else card.appendChild(progress);
    }
    progress.classList.toggle('complete',done===total&&total>0);
    progress.innerHTML=`<div class="sf70-tv3-progress-copy"><div class="sf70-tv3-progress-title">${done===total?'Relevé complet':'Progression du relevé'}</div><div class="sf70-tv3-progress-sub">${done===total?'Toutes les températures sont encodées. Vous pouvez enregistrer.':'Encodez chaque équipement avant l’enregistrement.'}</div></div><div class="sf70-tv3-progress-count">${done} / ${total}</div>`;
    const list=card.querySelector('.sf70-tv3-list');list?.classList.add('sf70-tv3-reading-list');
    const save=card.querySelector('[data-tv3-action="save-round"]');
    if(save){save.disabled=done!==total;save.textContent=done===total?'Enregistrer le relevé complet':'Complétez toutes les températures';}
  }

  function decorate(){
    injectStyles();
    const page=document.getElementById('sf70TemperatureV3');if(!page)return;
    page.querySelectorAll('.sf70-tv3-reading').forEach(decorateRow);
    updateProgress(page);
  }

  document.addEventListener('input',event=>{
    const input=event.target.closest?.('#sf70TemperatureV3 .sf70-tv3-value');if(!input)return;
    updateRow(input.closest('.sf70-tv3-reading'));
    updateProgress(document.getElementById('sf70TemperatureV3'));
  },true);

  document.addEventListener('pointerup',event=>{
    if(!event.target.closest?.('#sf70TemperatureV3,[data-sf70-card="temperatures.use"]'))return;
    [0,60,180,450].forEach(delay=>setTimeout(decorate,delay));
  },true);

  [0,250,700,1600,3000].forEach(delay=>setTimeout(decorate,delay));
})();
