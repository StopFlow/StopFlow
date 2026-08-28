/* StopFlow 0.8.0 — éditeur d’équipement frigorifique intégré à l’application. */
(function(){
  if(window.stopflow080TemperatureEquipmentUx?.active)return;

  const TYPE_LABELS={fridge:'Frigo',freezer:'Congélateur',cold_room:'Chambre froide',display:'Vitrine réfrigérée',other:'Autre'};
  const state={observer:null,currentId:null,saving:false};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api=()=>window.stopflow070TemperatureV3;
  const currentSession=()=>{try{return typeof session!=='undefined'?session:(window.session||{})}catch{return window.session||{}}};
  const sessionName=()=>{const s=currentSession();return String(s?.name||[s?.prenom,s?.nom].filter(Boolean).join(' ')||'').trim()||'Utilisateur StopFlow'};

  function injectStyles(){
    if(document.getElementById('stopflow080TemperatureEquipmentUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080TemperatureEquipmentUxStyles';
    style.textContent=`
      #sf80TemperatureEquipmentEditor{max-width:820px;margin:0 auto;padding-bottom:90px}
      #sf80TemperatureEquipmentEditor .sf80-equipment-card{margin-top:0;padding:22px}
      .sf80-equipment-page-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:16px}
      .sf80-equipment-page-head h2{margin:0 0 5px;font-size:24px;line-height:1.2}
      .sf80-equipment-page-head p{margin:0;color:#68778b;font-size:13px;line-height:1.45}
      .sf80-equipment-page-form{display:grid;gap:14px}
      .sf80-equipment-page-form .field{gap:6px}
      .sf80-equipment-page-form label{font-size:13px;font-weight:850;color:#344b63}
      .sf80-equipment-page-form .input{width:100%;min-height:50px;font-size:16px!important}
      .sf80-equipment-page-range{padding:14px;border:1px solid #dfe7f0;border-radius:13px;background:#f8fafc}
      .sf80-equipment-page-range-title{font-size:13px;font-weight:900;color:#314a64;margin-bottom:10px}
      .sf80-equipment-page-range-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .sf80-equipment-page-hint{margin-top:8px;color:#718096;font-size:11px;line-height:1.45}
      .sf80-equipment-page-actions{display:grid;grid-template-columns:1fr 1.35fr;gap:10px;margin-top:18px;padding-top:16px;border-top:1px solid #e4eaf1}
      .sf80-equipment-page-actions .btn,.sf80-equipment-page-head .btn{min-height:48px}
      @media(max-width:720px){
        #sf80TemperatureEquipmentEditor{max-width:none;padding-bottom:88px}
        #sf80TemperatureEquipmentEditor .sf80-equipment-card{padding:15px;margin-top:0;border-radius:14px}
        .sf80-equipment-page-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin-bottom:14px}
        .sf80-equipment-page-head h2{font-size:21px}
        .sf80-equipment-page-head p{font-size:12px}
        .sf80-equipment-page-form{gap:12px}
        .sf80-equipment-page-range-grid{grid-template-columns:1fr 1fr}
        .sf80-equipment-page-actions{grid-template-columns:1fr;gap:8px}
        .sf80-equipment-page-actions .btn{width:100%}
      }
      @media(max-width:380px){
        .sf80-equipment-page-head{grid-template-columns:1fr}
        .sf80-equipment-page-head .btn{width:100%}
        .sf80-equipment-page-range-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function parseDecimal(value){
    const normalized=String(value??'').trim().replace(',','.');
    return normalized===''?NaN:Number(normalized);
  }

  function equipmentById(id){
    return (api()?.state?.equipment||[]).find(item=>String(item.id)===String(id))||null;
  }

  function ensureEditorPage(){
    let page=document.getElementById('sf80TemperatureEquipmentEditor');
    if(page)return page;
    const main=document.querySelector('#app main.main');
    if(!main)return null;
    page=document.createElement('section');
    page.id='sf80TemperatureEquipmentEditor';
    page.className='page hidden';
    main.appendChild(page);
    try{if(typeof STOPFLOW_STABLE_PAGES!=='undefined')STOPFLOW_STABLE_PAGES.add(page.id)}catch{}
    return page;
  }

  function setTitles(label){
    const desktop=document.getElementById('pageTitle');
    const mobile=document.getElementById('sf52MobileTitle');
    if(desktop)desktop.textContent=label;
    if(mobile)mobile.textContent=label;
  }

  function editorValues(existing){
    return {
      name:String(existing?.name||''),
      location:String(existing?.location||''),
      type:String(existing?.equipment_type||'fridge'),
      min:existing?.min_allowed??0,
      max:existing?.max_allowed??4
    };
  }

  function renderEditor(existing=null){
    const page=ensureEditorPage();
    if(!page)return;
    const value=editorValues(existing);
    state.currentId=existing?.id||null;
    page.innerHTML=`
      <div class="card sf80-equipment-card">
        <div class="sf80-equipment-page-head">
          <div>
            <h2>${existing?'Modifier l’équipement':'Nouvel équipement'}</h2>
            <p>Renseignez uniquement les informations utiles aux relevés de température.</p>
          </div>
          <button type="button" class="btn ghost" id="sf80EquipmentPageClose">Fermer</button>
        </div>
        <div class="sf80-equipment-page-form">
          <div class="field">
            <label for="sf80EquipmentName">Nom de l’équipement *</label>
            <input class="input" id="sf80EquipmentName" autocomplete="off" enterkeyhint="next" placeholder="Ex. Frigo cuisine" value="${esc(value.name)}">
          </div>
          <div class="field">
            <label for="sf80EquipmentLocation">Emplacement</label>
            <input class="input" id="sf80EquipmentLocation" autocomplete="off" enterkeyhint="next" placeholder="Ex. Cuisine — passe" value="${esc(value.location)}">
          </div>
          <div class="field">
            <label>Type</label>
            <input type="hidden" id="sf80EquipmentType" value="${esc(value.type)}">
            <div class="sf80-equipment-type-options" role="group" aria-label="Type d’équipement">
              ${Object.entries(TYPE_LABELS).map(([key,label])=>`<button type="button" class="sf80-equipment-type ${value.type===key?'active':''}" data-sf80-equipment-type="${key}" aria-pressed="${value.type===key?'true':'false'}">${label}</button>`).join('')}
            </div>
          </div>
          <div class="sf80-equipment-page-range">
            <div class="sf80-equipment-page-range-title">Plage de température autorisée</div>
            <div class="sf80-equipment-page-range-grid">
              <div class="field">
                <label for="sf80EquipmentMin">Minimum °C</label>
                <input class="input" id="sf80EquipmentMin" type="text" inputmode="decimal" enterkeyhint="next" value="${esc(String(value.min).replace('.',','))}">
              </div>
              <div class="field">
                <label for="sf80EquipmentMax">Maximum °C</label>
                <input class="input" id="sf80EquipmentMax" type="text" inputmode="decimal" enterkeyhint="done" value="${esc(String(value.max).replace('.',','))}">
              </div>
            </div>
            <div class="sf80-equipment-page-hint">Virgule ou point acceptés. Exemple : -18 à -15 °C pour un congélateur.</div>
          </div>
        </div>
        <div class="sf80-equipment-page-actions">
          <button type="button" class="btn ghost" id="sf80EquipmentPageCancel">Annuler</button>
          <button type="button" class="btn primary" id="sf80EquipmentPageSave">Enregistrer</button>
        </div>
      </div>`;

    page.querySelector('#sf80EquipmentPageClose').onclick=returnToEquipment;
    page.querySelector('#sf80EquipmentPageCancel').onclick=returnToEquipment;
    page.querySelector('#sf80EquipmentPageSave').onclick=saveEditor;

    page.querySelectorAll('[data-sf80-equipment-type]').forEach(button=>{
      button.addEventListener('click',event=>{
        event.preventDefault();
        const type=String(button.dataset.sf80EquipmentType||'fridge');
        const input=page.querySelector('#sf80EquipmentType');
        if(input)input.value=type;
        page.querySelectorAll('[data-sf80-equipment-type]').forEach(option=>{
          const selected=option===button;
          option.classList.toggle('active',selected);
          option.setAttribute('aria-pressed',selected?'true':'false');
        });
      });
    });

    const fields=[...page.querySelectorAll('input:not([type="hidden"])')];
    fields.forEach((field,index)=>{
      field.addEventListener('keydown',event=>{
        if(event.key!=='Enter')return;
        event.preventDefault();
        const next=fields[index+1];
        if(next)next.focus();
        else saveEditor();
      });
    });
  }

  function openEditor(existing=null){
    injectStyles();
    const page=ensureEditorPage();
    if(!page)return;
    document.getElementById('sf70Tv3Overlay')?.classList.add('hidden');
    renderEditor(existing);
    document.querySelectorAll('#app .page').forEach(node=>node.classList.add('hidden'));
    page.classList.remove('hidden');
    setTitles(existing?'Modifier un équipement':'Nouvel équipement');
    window.scrollTo({top:0,left:0,behavior:'auto'});
  }

  function returnToEquipment(){
    const page=document.getElementById('sf80TemperatureEquipmentEditor');
    page?.classList.add('hidden');
    state.currentId=null;
    const temperature=api();
    if(temperature?.state)temperature.state.view='equipment';
    if(typeof temperature?.open==='function')temperature.open();
    else document.getElementById('sf70TemperatureV3')?.classList.remove('hidden');
    setTimeout(patchTemperatureButtons,0);
    window.scrollTo({top:0,left:0,behavior:'auto'});
  }

  async function saveEditor(){
    if(state.saving)return;
    const page=document.getElementById('sf80TemperatureEquipmentEditor');
    if(!page)return;
    const name=String(page.querySelector('#sf80EquipmentName')?.value||'').trim();
    const location=String(page.querySelector('#sf80EquipmentLocation')?.value||'').trim();
    const equipment_type=String(page.querySelector('#sf80EquipmentType')?.value||'fridge');
    const min_allowed=parseDecimal(page.querySelector('#sf80EquipmentMin')?.value);
    const max_allowed=parseDecimal(page.querySelector('#sf80EquipmentMax')?.value);

    if(!name){
      page.querySelector('#sf80EquipmentName')?.focus();
      return alert('Indiquez un nom pour l’équipement.');
    }
    if(!Number.isFinite(min_allowed)||!Number.isFinite(max_allowed))return alert('Vérifiez les températures minimum et maximum.');
    if(max_allowed<min_allowed)return alert('La température maximum doit être supérieure ou égale au minimum.');

    const button=page.querySelector('#sf80EquipmentPageSave');
    state.saving=true;
    if(button){button.disabled=true;button.textContent='Enregistrement…'}
    try{
      if(!window.supabaseClient)throw new Error('Connexion à la base indisponible.');
      let result;
      if(state.currentId){
        result=await window.supabaseClient.from('temperature_equipment')
          .update({name,location,equipment_type,min_allowed,max_allowed})
          .eq('id',state.currentId);
      }else{
        result=await window.supabaseClient.from('temperature_equipment').insert({
          department:'cuisine',name,location,equipment_type,min_allowed,max_allowed,active:true,
          created_by:currentSession()?.id||null,created_by_name:sessionName()
        });
      }
      if(result.error)throw result.error;
      returnToEquipment();
    }catch(error){
      console.warn('StopFlow 0.8.0 — équipement frigorifique',error);
      alert(String(error?.message||'Impossible d’enregistrer cet équipement.'));
    }finally{
      state.saving=false;
      if(button&&button.isConnected){button.disabled=false;button.textContent='Enregistrer'}
    }
  }

  function patchTemperatureButtons(){
    const page=document.getElementById('sf70TemperatureV3');
    if(!page)return false;

    page.querySelectorAll('[data-tv3-action="add-equipment"]').forEach(button=>{
      button.removeAttribute('data-tv3-action');
      button.dataset.sf80EquipmentOpen='add';
      button.onclick=event=>{event.preventDefault();openEditor(null)};
    });

    page.querySelectorAll('[data-tv3-action="edit-equipment"]').forEach(button=>{
      const id=String(button.dataset.id||'');
      button.removeAttribute('data-tv3-action');
      button.dataset.sf80EquipmentOpen='edit';
      button.onclick=event=>{event.preventDefault();openEditor(equipmentById(id))};
    });
    return true;
  }

  function observeTemperaturePage(){
    const page=document.getElementById('sf70TemperatureV3');
    if(!page)return false;
    patchTemperatureButtons();
    if(page.dataset.sf80EquipmentPageObserved==='1')return true;
    page.dataset.sf80EquipmentPageObserved='1';
    state.observer=new MutationObserver(()=>patchTemperatureButtons());
    state.observer.observe(page,{subtree:true,childList:true});
    return true;
  }

  function install(){
    injectStyles();
    ensureEditorPage();
    if(observeTemperaturePage())return;
    setTimeout(observeTemperaturePage,80);
  }

  window.stopflow080TemperatureEquipmentUx={
    active:true,
    version:'0.8.0',
    refresh:install,
    open:openEditor,
    close:returnToEquipment
  };

  [0,120,300,700,1400,2600].forEach(delay=>setTimeout(install,delay));
})();
