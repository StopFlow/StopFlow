/* StopFlow 0.8.0 — stabilise le focus iPhone des Suggestions du mois. */
(function(){
  if(window.stopflow080MonthlySuggestionsFocusFix?.active)return;

  const S=window.SF54;
  if(!S)return;

  const isMobile=()=>window.matchMedia?.('(max-width: 950px)').matches===true;
  const pageVisible=()=>{
    const page=document.getElementById('sf54CuisineSuggestions');
    return Boolean(page&&!page.classList.contains('hidden'));
  };

  function textarea(){
    return document.getElementById('sf80MsTextarea');
  }

  function focusField(){
    const field=textarea();
    if(!field)return;
    field.disabled=false;
    field.readOnly=false;
    field.tabIndex=0;
    try{
      field.focus({preventScroll:true});
      const end=field.value.length;
      field.setSelectionRange(end,end);
    }catch{
      try{field.focus()}catch{}
    }
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

    /* Focus ciblé : aucun propriétaire tactile global supplémentaire. */
    field.addEventListener('touchend',()=>{
      if(!isMobile())return;
      focusField();
    },{passive:true});
    field.addEventListener('pointerup',event=>{
      if(!isMobile()||event.pointerType==='mouse')return;
      focusField();
    });
    field.addEventListener('click',()=>{
      if(!isMobile())return;
      focusField();
    });
  }

  /* Les anciens rafraîchissements ne doivent plus reconstruire un formulaire déjà affiché. */
  const previousRender=S.render;
  if(typeof previousRender==='function'){
    S.render=function(){
      if(pageVisible()&&textarea()){
        bindField();
        return;
      }
      const result=previousRender.apply(this,arguments);
      setTimeout(bindField,0);
      return result;
    };
  }

  function refresh(){
    if(!pageVisible())return;
    bindField();
  }

  window.stopflow080MonthlySuggestionsFocusFix={active:true,version:'0.8.0',refresh,focus:focusField};
  [0,80,250,700,1600].forEach(delay=>setTimeout(refresh,delay));
})();
