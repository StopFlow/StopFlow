/* StopFlow 0.8.0 — passerelle tactile iPhone pour les Suggestions du mois. */
(function(){
  if(window.stopflow080MonthlySuggestionsFocusFix?.active)return;

  const S=window.SF54;
  if(!S)return;

  const isMobile=()=>window.matchMedia?.('(max-width: 950px)').matches===true;
  const page=()=>document.getElementById('sf54CuisineSuggestions');
  const pageVisible=()=>Boolean(page()&&!page().classList.contains('hidden'));
  const textarea=()=>document.getElementById('sf80MsTextarea');

  function injectStyles(){
    if(document.getElementById('stopflow080MonthlySuggestionsFocusFixStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080MonthlySuggestionsFocusFixStyles';
    style.textContent=`
      #sf54CuisineSuggestions .sf80-ms-text-wrap{position:relative}
      #sf54CuisineSuggestions .sf80-ms-editor-gateway{
        width:100%;
        min-height:180px;
        padding:14px;
        border:1px solid var(--line);
        border-radius:12px;
        background:#fff;
        color:#98a2b3;
        font-size:16px;
        font-style:italic;
        line-height:1.5;
        text-align:left;
        align-items:flex-start;
        justify-content:flex-start;
        touch-action:manipulation;
        -webkit-tap-highlight-color:transparent;
      }
      #sf54CuisineSuggestions .sf80-ms-editor-gateway.sf80-ms-gateway-hidden{display:none!important}
      #sf54CuisineSuggestions .sf80-ms-textarea.sf80-ms-awaiting-input{display:none!important}
      @media(max-width:620px){
        #sf54CuisineSuggestions .sf80-ms-editor-gateway{min-height:165px}
      }
    `;
    document.head.appendChild(style);
  }

  function focusField(){
    const field=textarea();
    if(!field)return false;
    field.disabled=false;
    field.readOnly=false;
    field.tabIndex=0;
    field.classList.remove('sf80-ms-awaiting-input');
    try{
      field.focus({preventScroll:true});
      const end=field.value.length;
      field.setSelectionRange(end,end);
      return document.activeElement===field;
    }catch{
      try{
        field.focus();
        return document.activeElement===field;
      }catch{}
    }
    return false;
  }

  function showGateway(){
    const field=textarea();
    const gateway=document.getElementById('sf80MsEditorGateway');
    if(!field||!gateway)return;
    if(field.value.trim()||document.activeElement===field){
      field.classList.remove('sf80-ms-awaiting-input');
      gateway.classList.add('sf80-ms-gateway-hidden');
      return;
    }
    field.classList.add('sf80-ms-awaiting-input');
    gateway.classList.remove('sf80-ms-gateway-hidden');
  }

  function activateGateway(){
    const field=textarea();
    const gateway=document.getElementById('sf80MsEditorGateway');
    if(!field)return;
    gateway?.classList.add('sf80-ms-gateway-hidden');
    field.classList.remove('sf80-ms-awaiting-input');
    /* Important iPhone : le focus reste synchrone dans le geste utilisateur. */
    focusField();
  }

  function bindGateway(button){
    if(!button||button.dataset.sf80GatewayBound==='1')return;
    button.dataset.sf80GatewayBound='1';

    if(typeof window.stopflow073MobileTap?.bind==='function'){
      window.stopflow073MobileTap.bind(button,activateGateway);
    }else{
      button.addEventListener('touchend',activateGateway,{passive:true});
    }

    button.addEventListener('click',event=>{
      if(isMobile()&&button.dataset.sf73CommonTap==='1')return;
      event.preventDefault();
      activateGateway();
    });
  }

  function bindField(){
    const field=textarea();
    if(!field||field.dataset.sf80FocusFix==='1')return;
    field.dataset.sf80FocusFix='1';
    field.setAttribute('inputmode','text');
    field.setAttribute('enterkeyhint','done');
    field.style.pointerEvents='auto';
    field.style.touchAction='auto';
    field.style.webkitUserSelect='text';
    field.style.userSelect='text';

    field.addEventListener('input',()=>{
      const gateway=document.getElementById('sf80MsEditorGateway');
      gateway?.classList.add('sf80-ms-gateway-hidden');
      field.classList.remove('sf80-ms-awaiting-input');
    });

    field.addEventListener('blur',()=>{
      setTimeout(showGateway,120);
    });

    /* Une fois en édition, les taps suivants restent natifs dans le textarea. */
    field.addEventListener('click',()=>{
      if(!isMobile())return;
      focusField();
    });
  }

  function ensureGateway(){
    injectStyles();
    const field=textarea();
    if(!field)return;
    bindField();

    const wrap=field.closest('.sf80-ms-text-wrap');
    if(!wrap)return;

    let gateway=document.getElementById('sf80MsEditorGateway');
    if(!gateway){
      gateway=document.createElement('button');
      gateway.type='button';
      gateway.id='sf80MsEditorGateway';
      gateway.className='sf80-ms-editor-gateway';
      gateway.setAttribute('aria-label','Écrire les suggestions du mois');
      gateway.textContent='Écrivez vos suggestions du mois…';
      wrap.insertBefore(gateway,field);
    }
    bindGateway(gateway);
    showGateway();
  }

  /* Les anciens rafraîchissements ne reconstruisent plus un formulaire déjà affiché. */
  const previousRender=S.render;
  if(typeof previousRender==='function'){
    S.render=function(){
      if(pageVisible()&&textarea()){
        ensureGateway();
        return;
      }
      const result=previousRender.apply(this,arguments);
      setTimeout(ensureGateway,0);
      return result;
    };
  }

  let observer=null;
  function installObserver(){
    const node=page();
    if(!node||observer)return;
    observer=new MutationObserver(()=>{
      if(pageVisible())requestAnimationFrame(ensureGateway);
    });
    observer.observe(node,{childList:true});
  }

  function refresh(){
    installObserver();
    if(!pageVisible())return;
    ensureGateway();
  }

  window.stopflow080MonthlySuggestionsFocusFix={
    active:true,
    version:'0.8.0',
    refresh,
    focus:activateGateway
  };

  injectStyles();
  [0,80,250,700,1600,3000].forEach(delay=>setTimeout(refresh,delay));
})();
