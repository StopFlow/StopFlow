/* StopFlow 0.7.0 — correction UX personnalisation : reset réel + carte déplacée grisée. */
(function(){
  if(window.stopflow070CardPersonalizationUxFix)return;
  window.stopflow070CardPersonalizationUxFix=true;

  function injectStyles(){
    if(document.getElementById("stopflow070CardPersonalizationUxFixStyles"))return;
    const style=document.createElement("style");
    style.id="stopflow070CardPersonalizationUxFixStyles";
    style.textContent=`
      .sf70-personalizing .sf70-action-card.sf70-dragging{
        opacity:.9!important;
        background:#e3e7ec!important;
        border-color:#aab3bf!important;
        filter:grayscale(1) saturate(.25)!important;
        box-shadow:0 8px 18px rgba(38,50,65,.14)!important;
      }
      .sf70-personalizing .sf70-action-card.sf70-dragging:before{
        background:#7c8794!important;
      }
      .sf70-personalizing .sf70-action-card.sf70-dragging .sf70-card-icon{
        background:#d2d7dd!important;
        color:#56616d!important;
      }
    `;
    document.head.appendChild(style);
  }

  async function resetCurrentZone(event){
    const button=event.target.closest?.(".sf70-reset");
    if(!button)return;
    const personalization=window.stopflow070CardPersonalization;
    const nav=window.stopflow070CardNavigation;
    const state=personalization?.state;
    if(!state?.profileId||typeof supabaseClient==="undefined"||!supabaseClient)return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const zone=nav?.runtime?.currentZone||"home";
    if(!["home","cuisine","salle","nettoyage","general"].includes(zone))return;
    if(!confirm("Réinitialiser l’ordre et réafficher toutes les cartes de cet espace ?"))return;

    const status=document.querySelector(".sf70-personalize-status");
    if(status)status.textContent="Réinitialisation…";

    const {error}=await supabaseClient
      .from("profile_card_preferences")
      .delete()
      .eq("profile_id",state.profileId)
      .eq("zone",zone);

    if(error){
      console.warn("StopFlow 0.7.0 — réinitialisation réelle des cartes",error);
      if(status)status.textContent="Erreur";
      return;
    }

    [...state.prefs.keys()]
      .filter(item=>item.startsWith(`${zone}|`))
      .forEach(item=>state.prefs.delete(item));

    state.editingZone=null;

    if(typeof nav?.refresh==="function")nav.refresh();
    else if(zone==="home"&&typeof nav?.openHome==="function")nav.openHome();
    else if(typeof nav?.openZone==="function")nav.openZone(zone);

    setTimeout(()=>{
      if(zone==="home"&&typeof nav?.openHome==="function")nav.openHome();
      else if(zone!=="home"&&typeof nav?.openZone==="function")nav.openZone(zone);
    },40);
  }

  function install(){
    injectStyles();
    [document.getElementById("sf70Home"),document.getElementById("sf70ZonePage")].forEach(page=>{
      if(!page||page.dataset.sf70ResetOwner==="1")return;
      page.dataset.sf70ResetOwner="1";
      page.addEventListener("click",resetCurrentZone,true);
    });
  }

  let attempts=0;
  const timer=setInterval(()=>{
    install();
    attempts+=1;
    if(attempts>=40||(document.getElementById("sf70Home")&&document.getElementById("sf70ZonePage")))clearInterval(timer);
  },100);
  [0,250,700,1600].forEach(delay=>setTimeout(install,delay));
})();

/* StopFlow 0.7.0 — charge Températures V3 seulement après le socle cartes/personnalisation. */
(function(){
  if(document.querySelector('script[data-stopflow-070-temperature-v3="0.7.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-070-temperature-v3.js?v=0703';
  script.async=false;
  script.dataset.stopflow070TemperatureV3='0.7.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.0 — fermeture tactile fiable de la modale équipements Températures V3. */
(function(){
  if(document.querySelector('script[data-stopflow-070-temperature-v3-modal-fix="0.7.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-070-temperature-v3-modal-fix.js?v=0701';
  script.async=false;
  script.dataset.stopflow070TemperatureV3ModalFix='0.7.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.0 — amélioration visuelle du relevé Températures V3. */
(function(){
  if(document.querySelector('script[data-stopflow-070-temperature-v3-visibility="0.7.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-070-temperature-v3-visibility.js?v=0702';
  script.async=false;
  script.dataset.stopflow070TemperatureV3Visibility='0.7.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.0 — pavé numérique dédié aux températures sur smartphone. */
(function(){
  if(document.querySelector('script[data-stopflow-070-temperature-v3-mobile-keypad="0.7.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-070-temperature-v3-mobile-keypad.js?v=0701';
  script.async=false;
  script.dataset.stopflow070TemperatureV3MobileKeypad='0.7.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.0 — propriétaire tactile mobile de toutes les cartes 0.7.0. */
(function(){
  if(document.querySelector('script[data-stopflow-070-mobile-card-touch="0.7.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-070-mobile-card-touch.js?v=0704';
  script.async=false;
  script.dataset.stopflow070MobileCardTouch='0.7.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.0 — harmonise les interactions tactiles des sous-pages avec l'Accueil. */
(function(){
  if(document.querySelector('script[data-stopflow-070-mobile-subpage-touch-fix="0.7.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-070-mobile-subpage-touch-fix.js?v=0701';
  script.async=false;
  script.dataset.stopflow070MobileSubpageTouchFix='0.7.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.0 — navigation retour cohérente sur toutes les pages. */
(function(){
  if(document.querySelector('script[data-stopflow-070-back-navigation="0.7.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-070-back-navigation.js?v=0730';
  script.async=false;
  script.dataset.stopflow070BackNavigation='0.7.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.0 — label explicite des previews et version visible. */
(function(){
  if(document.querySelector('script[data-stopflow-070-preview-label="0.7.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-070-preview-label.js?v=0730';
  script.async=false;
  script.dataset.stopflow070PreviewLabel='0.7.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.3 — parcours Inventaire Salle direct. */
(function(){
  if(document.querySelector('script[data-stopflow-073-salle-inventory="0.7.3"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-073-salle-inventory.js?v=0730';
  script.async=false;
  script.dataset.stopflow073SalleInventory='0.7.3';
  document.head.appendChild(script);
})();

/* StopFlow 0.7.3 — bouton + et actions contextuelles sur mobile. */
(function(){
  if(document.querySelector('script[data-stopflow-073-mobile-actions="0.7.3"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-073-mobile-actions.js?v=0732';
  script.async=false;
  script.dataset.stopflow073MobileActions='0.7.3';
  document.head.appendChild(script);
})();
