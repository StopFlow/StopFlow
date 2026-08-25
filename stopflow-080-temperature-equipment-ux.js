/* StopFlow 0.8.0 — création/modification des équipements frigorifiques simplifiée et fiable sur iPhone. */
(function(){
  if(window.stopflow080TemperatureEquipmentUx?.active)return;

  const TYPE_LABELS={fridge:'Frigo',freezer:'Congélateur',cold_room:'Chambre froide',display:'Vitrine réfrigérée',other:'Autre'};
  const state={observer:null,currentId:null,saving:false,lastActionAt:0,touch:null};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api=()=>window.stopflow070TemperatureV3;
  const currentSession=()=>{try{return typeof session!=='undefined'?session:(window.session||{})}catch{return window.session||{}}};
  const sessionName=()=>{const s=currentSession();return String(s?.name||[s?.prenom,s?.nom].filter(Boolean).join(' ')||'').trim()||'Utilisateur StopFlow'};

  function injectStyles(){
    if(document.getElementById('stopflow080TemperatureEquipmentUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080TemperatureEquipmentUxStyles';
    style.textContent=`
      #sf70Tv3Overlay.sf80-equipment-editor{z-index:13500;align-items:center;padding:16px}
      #sf70Tv3Overlay.sf80-equipment-editor .sf70-tv3-dialog{width:min(600px,100%);max-height:calc(100dvh - 32px);overflow:auto;padding:20px;border-radius:18px;background:#fff;-webkit-overflow-scrolling:touch}
      .sf80-equipment-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
      .sf80-equipment-head h2{margin:0 0 4px;font-size:22px;line-height:1.2}
      .sf80-equipment-head p{margin:0;color:#68778b;font-size:12px;line-height:1.4}
      .sf80-equipment-head .btn,.sf80-equipment-actions .btn{pointer-events:auto!important;touch-action:manipulation!important;-webkit-tap-highlight-color:transparent}
      .sf80-equipment-form{display:grid;gap:12px;margin-top:16px}
      .sf80-equipment-form .field{gap:5px}
      .sf80-equipment-form label{font-size:12px;font-weight:850;color:#344b63}
      .sf80-equipment-form .input{width:100%;min-height:48px;font-size:16px!important;pointer-events:auto!important;user-select:text;-webkit-user-select:text;touch-action:manipulation}
      .sf80-equipment-range{padding:12px;border:1px solid #dfe7f0;border-radius:12px;background:#f8fafc}
      .sf80-equipment-range-title{font-size:12px;font-weight:900;color:#314a64;margin-bottom:8px}
      .sf80-equipment-range-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
      .sf80-equipment-hint{margin-top:7px;color:#718096;font-size:10.5px;line-height:1.4}
      .sf80-equipment-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:8px;margin-top:16px;padding-top:13px;border-top:1px solid #e4eaf1}
      .sf80-equipment-actions .btn{min-height:48px}
      @media(max-width:620px){
        #sf70Tv3Overlay.sf80-equipment-editor{align-items:flex-start!important;padding:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom))!important;overflow:auto}
        #sf70Tv3Overlay.sf80-equipment-editor .sf70-tv3-dialog{width:100%;max-height:none;margin:0;padding:15px;border-radius:16px}
        .sf80-equipment-head h2{font-size:20px}
        .sf80-equipment-form{gap:11px;margin-top:13px}
        .sf80-equipment-range-grid{grid-template-columns:1fr 1fr}
        .sf80-equipment-actions{grid-template-columns:1fr}
      }
      @media(max-width:370px){.sf80-equipment-range-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function parseDecimal(value){
    const normalized=String(value??'').trim().replace(',','.');
    return normalized===''?NaN:Number(normalized);
  }

  function equipmentById(id){return (api()?.state?.equipment||[]).find(item=>String(item.id)===String(id))||null}

  function editorValues(existing){
    return {
      id:existing?.id||'',
      name:String(existing?.name||''),
      location:String(existing?.location||''),
      type:String(existing?.equipment_type||'fridge'),
      min:existing?.min_allowed??0,
      max:existing?.max_allowed??4
    };
  }

  function actionButton(target){
    return target?.closest?.('[data-sf80-equipment-action]')||null;
  }

  function stopEvent(event){
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function closeEditor(){
    const overlay=document.getElementById('sf70Tv3Overlay');
    const active=document.activeElement;
    if(active&&typeof active.blur==='function')try{active.blur()}catch{}
    if(overlay){
      overlay.classList.add('hidden');
      overlay.classList.remove('sf80-equipment-editor');
    }
    const dialog=document.getElementById('sf70Tv3Dialog');
    if(dialog)delete dialog.dataset.sf80EquipmentEditor;
    state.currentId=null;
  }

  async function saveEditor(){
    if(state.saving)return;
    const dialog=document.getElementById('sf70Tv3Dialog');if(!dialog)return;
    const name=String(dialog.querySelector('#sf80EquipmentName')?.value||'').trim();
    const location=String(dialog.querySelector('#sf80EquipmentLocation')?.value||'').trim();
    const equipment_type=String(dialog.querySelector('#sf80EquipmentType')?.value||'fridge');
    const min_allowed=parseDecimal(dialog.querySelector('#sf80EquipmentMin')?.value);
    const max_allowed=parseDecimal(dialog.querySelector('#sf80EquipmentMax')?.value);
    if(!name){dialog.querySelector('#sf80EquipmentName')?.focus();return alert('Indiquez un nom pour l’équipement.')}
    if(!Number.isFinite(min_allowed)||!Number.isFinite(max_allowed))return alert('Vérifiez les températures minimum et maximum.');
    if(max_allowed<min_allowed)return alert('La température maximum doit être supérieure ou égale au minimum.');
    const button=dialog.querySelector('[data-sf80-equipment-action="save"]');
    state.saving=true;
    if(button){button.disabled=true;button.textContent='Enregistrement…'}
    try{
      if(!window.supabaseClient)throw new Error('Connexion à la base indisponible.');
      let result;
      if(state.currentId){
        result=await window.supabaseClient.from('temperature_equipment').update({name,location,equipment_type,min_allowed,max_allowed}).eq('id',state.currentId);
      }else{
        result=await window.supabaseClient.from('temperature_equipment').insert({department:'cuisine',name,location,equipment_type,min_allowed,max_allowed,active:true,created_by:currentSession()?.id||null,created_by_name:sessionName()});
      }
      if(result.error)throw result.error;
      closeEditor();
      await api()?.reload?.();
      api()?.setView?.('equipment');
    }catch(error){
      console.warn('StopFlow 0.8.0 — équipement frigorifique',error);
      alert(String(error?.message||'Impossible d’enregistrer cet équipement.'));
    }finally{
      state.saving=false;
      if(button&&button.isConnected){button.disabled=false;button.textContent='Enregistrer'}
    }
  }

  function performAction(button){
    const action=button?.dataset?.sf80EquipmentAction;
    if(action==='close'||action==='cancel')return closeEditor();
    if(action==='save')return saveEditor();
  }

  function installLocalInteraction(overlay){
    if(!overlay||overlay.dataset.sf80EquipmentLocalTouch==='1')return;
    overlay.dataset.sf80EquipmentLocalTouch='1';

    overlay.addEventListener('touchstart',event=>{
      const button=actionButton(event.target);
      if(!button||event.touches?.length!==1){state.touch=null;return}
      const touch=event.touches[0];
      state.touch={button,x:touch.clientX,y:touch.clientY,moved:false,at:Date.now()};
    },{capture:true,passive:true});

    overlay.addEventListener('touchmove',event=>{
      const gesture=state.touch;
      if(!gesture||!event.touches?.length)return;
      const touch=event.touches[0];
      if(Math.hypot(touch.clientX-gesture.x,touch.clientY-gesture.y)>12)gesture.moved=true;
    },{capture:true,passive:true});

    overlay.addEventListener('touchend',event=>{
      const button=actionButton(event.target);
      const gesture=state.touch;
      state.touch=null;
      if(!button||!gesture||gesture.button!==button||gesture.moved||Date.now()-gesture.at>1500)return;
      state.lastActionAt=Date.now();
      stopEvent(event);
      performAction(button);
    },{capture:true,passive:false});

    overlay.addEventListener('touchcancel',()=>{state.touch=null},{capture:true,passive:true});

    overlay.addEventListener('pointerup',event=>{
      if(event.pointerType==='touch'||Date.now()-state.lastActionAt<900)return;
      if(event.button!=null&&event.button!==0)return;
      const button=actionButton(event.target);if(!button)return;
      state.lastActionAt=Date.now();
      stopEvent(event);
      performAction(button);
    },true);

    overlay.addEventListener('click',event=>{
      const button=actionButton(event.target);if(!button)return;
      stopEvent(event);
      if(Date.now()-state.lastActionAt<900)return;
      state.lastActionAt=Date.now();
      performAction(button);
    },true);

    overlay.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||overlay.classList.contains('hidden'))return;
      event.preventDefault();
      closeEditor();
    },true);
  }

  function rebuildEditor(){
    const overlay=document.getElementById('sf70Tv3Overlay');
    const dialog=document.getElementById('sf70Tv3Dialog');
    if(!overlay||!dialog||overlay.classList.contains('hidden'))return;
    const oldSave=dialog.querySelector('[data-tv3-modal="save"]');
    if(!oldSave||dialog.dataset.sf80EquipmentEditor==='1')return;

    const id=String(oldSave.dataset.id||'');
    const existing=id?equipmentById(id):null;
    const value=editorValues(existing);
    state.currentId=value.id||null;
    overlay.classList.add('sf80-equipment-editor');
    dialog.dataset.sf80EquipmentEditor='1';
    dialog.innerHTML=`<div class="sf80-equipment-head"><div><h2>${existing?'Modifier l’équipement':'Nouvel équipement'}</h2><p>Les informations essentielles suffisent pour les futurs relevés.</p></div><button type="button" class="btn ghost" data-sf80-equipment-action="close">Fermer</button></div><div class="sf80-equipment-form"><div class="field"><label for="sf80EquipmentName">Nom de l’équipement *</label><input class="input" id="sf80EquipmentName" autocomplete="off" enterkeyhint="next" placeholder="Ex. Frigo cuisine" value="${esc(value.name)}"></div><div class="field"><label for="sf80EquipmentLocation">Emplacement</label><input class="input" id="sf80EquipmentLocation" autocomplete="off" enterkeyhint="next" placeholder="Ex. Cuisine — passe" value="${esc(value.location)}"></div><div class="field"><label for="sf80EquipmentType">Type</label><select class="input" id="sf80EquipmentType">${Object.entries(TYPE_LABELS).map(([key,label])=>`<option value="${key}" ${value.type===key?'selected':''}>${label}</option>`).join('')}</select></div><div class="sf80-equipment-range"><div class="sf80-equipment-range-title">Plage de température autorisée</div><div class="sf80-equipment-range-grid"><div class="field"><label for="sf80EquipmentMin">Minimum °C</label><input class="input" id="sf80EquipmentMin" type="text" inputmode="decimal" enterkeyhint="next" value="${esc(String(value.min).replace('.',','))}"></div><div class="field"><label for="sf80EquipmentMax">Maximum °C</label><input class="input" id="sf80EquipmentMax" type="text" inputmode="decimal" enterkeyhint="done" value="${esc(String(value.max).replace('.',','))}"></div></div><div class="sf80-equipment-hint">Utilisez une virgule ou un point pour les décimales. Exemple : -18 à -15 °C pour un congélateur.</div></div></div><div class="sf80-equipment-actions"><button type="button" class="btn ghost" data-sf80-equipment-action="cancel">Annuler</button><button type="button" class="btn primary" data-sf80-equipment-action="save">Enregistrer</button></div>`;

    const fields=[...dialog.querySelectorAll('input,select')];
    fields.forEach((field,index)=>{
      field.addEventListener('keydown',event=>{
        if(event.key!=='Enter'||field.tagName==='SELECT')return;
        event.preventDefault();
        const next=fields[index+1];
        if(next)next.focus();
        else saveEditor();
      });
    });
  }

  function cleanupClosedEditor(){
    const overlay=document.getElementById('sf70Tv3Overlay');
    if(!overlay||!overlay.classList.contains('hidden'))return false;
    overlay.classList.remove('sf80-equipment-editor');
    const dialog=document.getElementById('sf70Tv3Dialog');
    if(dialog)delete dialog.dataset.sf80EquipmentEditor;
    state.currentId=null;
    return true;
  }

  function watchOverlay(){
    injectStyles();
    const overlay=document.getElementById('sf70Tv3Overlay');
    if(!overlay)return false;
    installLocalInteraction(overlay);
    if(overlay.dataset.sf80EquipmentWatch==='1'){rebuildEditor();return true}
    overlay.dataset.sf80EquipmentWatch='1';
    state.observer=new MutationObserver(()=>{
      if(cleanupClosedEditor())return;
      rebuildEditor();
    });
    state.observer.observe(overlay,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    rebuildEditor();
    return true;
  }

  function install(){
    injectStyles();
    if(watchOverlay())return;
    setTimeout(watchOverlay,80);
  }

  window.stopflow080TemperatureEquipmentUx={active:true,version:'0.8.0',refresh:install};
  [0,180,500,1000,1800,3000].forEach(delay=>setTimeout(install,delay));
})();
