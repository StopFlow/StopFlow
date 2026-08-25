/* StopFlow 0.8.0 — pont minimal vers les globals historiques nécessaires aux extensions. */
(function(){
  try{
    if(typeof supabaseClient!=='undefined'&&!window.supabaseClient)window.supabaseClient=supabaseClient;
  }catch{}
})();

/* StopFlow 0.8.0 — masque les écrans intermédiaires au démarrage. */
(function(){
  if(document.querySelector('script[data-stopflow-080-startup-smooth="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-startup-smooth.js?v=0800';
  script.async=false;
  script.dataset.stopflow080StartupSmooth='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — ordre partagé des articles pour les inventaires. */
(function(){
  if(document.querySelector('script[data-stopflow-080-article-ordering="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-article-ordering.js?v=0800';
  script.async=false;
  script.dataset.stopflow080ArticleOrdering='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — fenêtre de création des équipements frigorifiques. */
(function(){
  if(document.querySelector('script[data-stopflow-080-temperature-equipment-ux="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-temperature-equipment-ux.js?v=0800';
  script.async=false;
  script.dataset.stopflow080TemperatureEquipmentUx='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — activation synchrone du clavier iPhone dans l’éditeur d’équipement. */
(function(){
  if(window.stopflow080EquipmentKeyboardBridge?.active)return;
  const isMobile=()=>window.matchMedia?.('(max-width: 950px)').matches===true;

  function fieldFromTarget(target){
    if(!target?.closest)return null;
    const direct=target.closest('#sf80TemperatureEquipmentEditor input');
    if(direct)return direct;
    const field=target.closest('#sf80TemperatureEquipmentEditor .field');
    return field?.querySelector?.('input')||null;
  }

  function focusField(field){
    if(!field||field.disabled||field.readOnly)return false;
    field.style.pointerEvents='auto';
    field.style.touchAction='auto';
    field.style.webkitUserSelect='text';
    field.style.userSelect='text';
    try{
      field.focus({preventScroll:true});
      if(typeof field.setSelectionRange==='function'){
        const end=String(field.value||'').length;
        field.setSelectionRange(end,end);
      }
    }catch{
      try{field.focus()}catch{}
    }
    return document.activeElement===field;
  }

  document.addEventListener('touchend',event=>{
    if(!isMobile())return;
    const field=fieldFromTarget(event.target);
    if(!field||document.activeElement===field)return;
    /* Le focus doit rester synchrone dans le geste utilisateur pour ouvrir le clavier Safari. */
    event.preventDefault();
    event.stopPropagation();
    focusField(field);
  },{capture:true,passive:false});

  document.addEventListener('click',event=>{
    if(!isMobile())return;
    const field=fieldFromTarget(event.target);
    if(!field||document.activeElement===field)return;
    focusField(field);
  },true);

  window.stopflow080EquipmentKeyboardBridge={active:true,version:'0.8.0',focus:focusField};
})();

/* StopFlow 0.8.0 — cases à cocher des checklists fiables sur tactile et souris. */
(function(){
  if(document.querySelector('script[data-stopflow-080-checklist-input-fix="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-checklist-input-fix.js?v=0800';
  script.async=false;
  script.dataset.stopflow080ChecklistInputFix='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — éditeur d'article vertical et pratique sur smartphone. */
(function(){
  if(document.querySelector('script[data-stopflow-080-article-editor-ux="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-article-editor-ux.js?v=0800';
  script.async=false;
  script.dataset.stopflow080ArticleEditorUx='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — audit Administration, permissions et paramètres. */
(function(){
  if(document.querySelector('script[data-stopflow-080-admin-permissions-audit="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-admin-permissions-audit.js?v=0800';
  script.async=false;
  script.dataset.stopflow080AdminPermissionsAudit='0.8.0';
  document.head.appendChild(script);
})();