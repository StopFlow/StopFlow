/* StopFlow 0.7.0 — pavé numérique mobile dédié aux relevés Températures V3. */
(function(){
  if(window.stopflow070TemperatureV3MobileKeypad?.active)return;

  const state={input:null,buffer:'',open:false};
  const api=window.stopflow070TemperatureV3MobileKeypad={active:true,state,open:openPad,close:closePad};

  function isMobile(){return window.matchMedia?.('(max-width: 760px)').matches===true}
  function displayText(value){return String(value||'').replace('.',',')}
  function internalText(value){return String(value||'').replace(',','.')}

  function injectStyles(){
    if(document.getElementById('sf70TemperatureMobileKeypadStyles'))return;
    const style=document.createElement('style');style.id='sf70TemperatureMobileKeypadStyles';style.textContent=`
      .sf70-temp-keypad-overlay{position:fixed;inset:0;z-index:220;background:rgba(4,15,28,.46);display:flex;align-items:flex-end;justify-content:center;padding:0}
      .sf70-temp-keypad-overlay.hidden{display:none!important}
      .sf70-temp-keypad{width:min(520px,100%);background:#fff;border-radius:20px 20px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));box-shadow:0 -16px 50px rgba(0,0,0,.22)}
      .sf70-temp-keypad-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
      .sf70-temp-keypad-title{font-size:14px;font-weight:900;color:#17324d}.sf70-temp-keypad-meta{font-size:11px;color:#718096;margin-top:2px}
      .sf70-temp-keypad-close{border:0;background:#eef2f6;color:#40546a;border-radius:999px;width:36px;height:36px;font-size:20px;font-weight:800}
      .sf70-temp-keypad-display{display:flex;align-items:center;justify-content:center;min-height:68px;margin-bottom:12px;border:2px solid #c9d8ea;border-radius:14px;background:#f8fbff;font-size:34px;font-weight:950;color:#102c48;letter-spacing:.02em}
      .sf70-temp-keypad-display span{margin-left:7px;font-size:17px;color:#62758a}
      .sf70-temp-keypad-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
      .sf70-temp-key{min-height:58px;border:1px solid #d6e0eb;border-radius:14px;background:#fff;font-size:22px;font-weight:900;color:#17324d;touch-action:manipulation;box-shadow:0 2px 4px rgba(25,50,80,.04)}
      .sf70-temp-key:active{background:#eaf2ff;transform:scale(.98)}
      .sf70-temp-key.utility{background:#f3f6f9;font-size:18px}.sf70-temp-key.minus{font-size:26px}
      .sf70-temp-keypad-actions{display:grid;grid-template-columns:1fr 1.7fr;gap:9px;margin-top:10px}
      .sf70-temp-keypad-actions button{min-height:52px;border-radius:13px;font-weight:900;border:1px solid #d6e0eb}
      .sf70-temp-keypad-clear{background:#fff;color:#53687d}.sf70-temp-keypad-next{background:#2463eb!important;border-color:#2463eb!important;color:#fff!important}
      body.sf70-temp-keypad-open{overflow:hidden}
    `;document.head.appendChild(style);
  }

  function ensurePad(){
    let overlay=document.getElementById('sf70TempKeypadOverlay');if(overlay)return overlay;
    injectStyles();overlay=document.createElement('div');overlay.id='sf70TempKeypadOverlay';overlay.className='sf70-temp-keypad-overlay hidden';overlay.innerHTML=`
      <div class="sf70-temp-keypad" role="dialog" aria-modal="true" aria-label="Saisie de température">
        <div class="sf70-temp-keypad-head"><div><div class="sf70-temp-keypad-title" id="sf70TempKeypadTitle">Température</div><div class="sf70-temp-keypad-meta" id="sf70TempKeypadMeta"></div></div><button type="button" class="sf70-temp-keypad-close" data-keypad-action="close">×</button></div>
        <div class="sf70-temp-keypad-display"><strong id="sf70TempKeypadValue">—</strong><span>°C</span></div>
        <div class="sf70-temp-keypad-grid">
          <button type="button" class="sf70-temp-key" data-key="1">1</button><button type="button" class="sf70-temp-key" data-key="2">2</button><button type="button" class="sf70-temp-key" data-key="3">3</button>
          <button type="button" class="sf70-temp-key" data-key="4">4</button><button type="button" class="sf70-temp-key" data-key="5">5</button><button type="button" class="sf70-temp-key" data-key="6">6</button>
          <button type="button" class="sf70-temp-key" data-key="7">7</button><button type="button" class="sf70-temp-key" data-key="8">8</button><button type="button" class="sf70-temp-key" data-key="9">9</button>
          <button type="button" class="sf70-temp-key utility minus" data-key="minus">−</button><button type="button" class="sf70-temp-key" data-key="0">0</button><button type="button" class="sf70-temp-key utility" data-key="decimal">,</button>
          <button type="button" class="sf70-temp-key utility" data-key="backspace" style="grid-column:1/-1">⌫ Effacer le dernier chiffre</button>
        </div>
        <div class="sf70-temp-keypad-actions"><button type="button" class="sf70-temp-keypad-clear" data-keypad-action="clear">Effacer</button><button type="button" class="sf70-temp-keypad-next" data-keypad-action="next">Valider et suivant</button></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('pointerdown',handlePadPointer,true);
    return overlay;
  }

  function currentRow(){return state.input?.closest('.sf70-tv3-reading')||null}
  function syncDisplay(){
    const node=document.getElementById('sf70TempKeypadValue');if(node)node.textContent=state.buffer===''?'—':displayText(state.buffer);
    const row=currentRow(),title=document.getElementById('sf70TempKeypadTitle'),meta=document.getElementById('sf70TempKeypadMeta');
    if(title)title.textContent=row?.querySelector('.sf70-tv3-name')?.textContent?.trim()||'Température';
    if(meta)meta.textContent=row?`Limites : ${String(row.dataset.min).replace('.',',')} à ${String(row.dataset.max).replace('.',',')} °C`:'';
  }

  function pushValue(){
    if(!state.input)return;
    state.input.value=internalText(state.buffer);
    state.input.dispatchEvent(new Event('input',{bubbles:true}));
    state.input.dispatchEvent(new Event('change',{bubbles:true}));
    syncDisplay();
  }

  function appendDigit(digit){
    let b=state.buffer;
    if(b==='0'&&!b.includes(','))b=digit;else if(b==='-0'&&!b.includes(','))b='-'+digit;else b+=digit;
    if(b.length>7)return;state.buffer=b;pushValue();
  }
  function toggleMinus(){state.buffer=state.buffer.startsWith('-')?state.buffer.slice(1):'-'+state.buffer;pushValue()}
  function decimal(){if(state.buffer.includes(','))return;if(state.buffer===''||state.buffer==='-')state.buffer+=(state.buffer==='-'?'0,':'0,');else state.buffer+=',';pushValue()}
  function backspace(){state.buffer=state.buffer.slice(0,-1);pushValue()}
  function clear(){state.buffer='';pushValue()}

  function openPad(input){
    if(!isMobile()||!input)return;
    const overlay=ensurePad();state.input=input;state.buffer=displayText(input.value||'');state.open=true;
    try{input.blur()}catch{}
    overlay.classList.remove('hidden');document.body.classList.add('sf70-temp-keypad-open');syncDisplay();
  }
  function closePad(){const overlay=document.getElementById('sf70TempKeypadOverlay');overlay?.classList.add('hidden');document.body.classList.remove('sf70-temp-keypad-open');state.input=null;state.buffer='';state.open=false}

  function goNext(){
    const input=state.input;if(!input)return closePad();
    const inputs=[...document.querySelectorAll('#sf70TemperatureV3 .sf70-tv3-value')];const index=inputs.indexOf(input);
    const next=inputs.slice(index+1).find(item=>item.value.trim()==='')||inputs.slice(index+1)[0];
    if(next){state.input=next;state.buffer=displayText(next.value||'');next.scrollIntoView({behavior:'smooth',block:'center'});syncDisplay();return}
    closePad();
  }

  function handlePadPointer(event){
    const key=event.target.closest?.('[data-key]'),action=event.target.closest?.('[data-keypad-action]');if(!key&&!action)return;
    event.preventDefault();event.stopPropagation();
    if(key){const value=key.dataset.key;if(/^\d$/.test(value))appendDigit(value);else if(value==='minus')toggleMinus();else if(value==='decimal')decimal();else if(value==='backspace')backspace();return}
    if(action?.dataset.keypadAction==='close')closePad();else if(action?.dataset.keypadAction==='clear')clear();else if(action?.dataset.keypadAction==='next')goNext();
  }

  function prepareInputs(){
    document.querySelectorAll('#sf70TemperatureV3 .sf70-tv3-value').forEach(input=>{
      if(isMobile()){input.readOnly=true;input.inputMode='none';input.dataset.mobileKeypad='1';}
      else if(input.dataset.mobileKeypad==='1'){input.readOnly=false;input.inputMode='decimal';delete input.dataset.mobileKeypad;}
    });
  }

  document.addEventListener('pointerdown',event=>{
    const input=event.target.closest?.('#sf70TemperatureV3 .sf70-tv3-value');if(!input||!isMobile())return;
    event.preventDefault();event.stopPropagation();openPad(input);
  },true);
  document.addEventListener('click',event=>{const input=event.target.closest?.('#sf70TemperatureV3 .sf70-tv3-value');if(input&&isMobile()){event.preventDefault();event.stopPropagation()}},true);
  window.addEventListener('resize',()=>{prepareInputs();if(state.open&&!isMobile())closePad()});
  document.addEventListener('pointerup',event=>{if(event.target.closest?.('#sf70TemperatureV3,[data-sf70-card="temperatures.use"]'))[0,80,220,500].forEach(delay=>setTimeout(prepareInputs,delay))},true);
  [0,300,900,1800,3000].forEach(delay=>setTimeout(prepareInputs,delay));
})();
