/* StopFlow 0.5.0 — correction de vocabulaire et rappel des droits. */
(function(){
  let initialized=false;

  function isManager(){
    return typeof isResponsible==="function"&&isResponsible();
  }

  function injectCorrectionStyles(){
    if(document.getElementById("stopflow050CorrectionStyles"))return;
    const style=document.createElement("style");
    style.id="stopflow050CorrectionStyles";
    style.textContent=`
      .nav button[data-page="suggestions"]{font-size:0!important}
      .nav button[data-page="suggestions"]::after{content:"Suggestions du mois"!important;font-size:12.5px;line-height:1.2}
      .monthly-suggestions-notice{margin:0 0 12px;padding:10px 12px;border:1px solid #cfe1ff;border-radius:10px;background:#edf5ff;color:#27547f;line-height:1.4}
      .checklist-rights-note{margin-top:10px;padding:9px 11px;border:1px solid #d9e3ef;border-radius:9px;background:#f7f9fc;color:#536176;font-size:12px}
      @media(max-width:950px){
        .nav button[data-page="suggestions"]::after{font-size:12px;line-height:1.1}
      }
    `;
    document.head.appendChild(style);
  }

  function renameMonthlySuggestions(){
    document.querySelectorAll('[data-page="suggestions"]').forEach(button=>{
      button.textContent="Suggestions du mois";
      button.title="Préparation et validation des suggestions de carte pour le mois suivant";
    });

    const pageSection=document.getElementById("suggestions");
    if(pageSection){
      const heading=pageSection.querySelector("h2");
      if(heading)heading.textContent="Suggestions du mois";

      if(!pageSection.querySelector(".monthly-suggestions-notice")){
        const notice=document.createElement("div");
        notice.className="monthly-suggestions-notice";
        notice.innerHTML="<b>Suggestions du mois</b><br>Ce module concerne uniquement la carte, les plats, les desserts et les lunchs préparés pour un mois déterminé. Les propositions de modification d’une checklist se font dans le module <b>Checklists</b>.";
        pageSection.prepend(notice);
      }
    }

    if(document.querySelector('[data-page="suggestions"].active')){
      const title=document.getElementById("pageTitle");
      if(title)title.textContent="Suggestions du mois";
    }
  }

  function clarifyChecklistSuggestions(){
    const home=document.getElementById("checklistHome");
    if(!home)return;

    [...home.querySelectorAll(".card")].forEach(card=>{
      const heading=card.querySelector("h2");
      if(!heading)return;

      if(heading.textContent.trim()==="Proposer une amélioration"){
        heading.textContent="Proposer une modification de checklist";
        const description=card.querySelector("p.muted");
        if(description)description.textContent="Chaque membre peut proposer une tâche à ajouter à une checklist. La proposition reste en attente jusqu’à la décision d’un Responsable ou d’un Administrateur.";
        const button=card.querySelector("#submitChecklistSuggestion");
        if(button)button.textContent="Envoyer la proposition de checklist";
      }
    });

    const managerPanel=document.getElementById("checklistManagerPanel");
    if(managerPanel){
      const heading=managerPanel.querySelector("h2");
      if(heading)heading.textContent="Gestion des modèles de checklist";
      const description=managerPanel.querySelector("p.muted");
      if(description)description.textContent="Créer un modèle, ajouter directement une tâche ou accepter/refuser les propositions de l’équipe.";

      if(!managerPanel.querySelector(".checklist-rights-note")){
        const note=document.createElement("div");
        note.className="checklist-rights-note";
        note.innerHTML="<b>Accès réservé :</b> création des modèles, ajout direct de tâches, traitement des propositions et validation des checklists sont réservés aux Responsables et Administrateurs.";
        const header=managerPanel.querySelector(".flex.between");
        if(header)header.insertAdjacentElement("afterend",note);
      }
    }
  }

  function enforceVisibleRights(){
    const allowed=isManager();
    const managerPanel=document.getElementById("checklistManagerPanel");
    if(managerPanel&&!allowed)managerPanel.classList.add("hidden");

    if(!allowed){
      document.querySelectorAll("[data-add-template-item],[data-accept-suggestion],[data-refuse-suggestion],#createChecklistTemplate").forEach(control=>control.classList.add("hidden"));
      document.querySelectorAll("#checklistRunnerActions .btn").forEach(button=>{
        const text=button.textContent.trim().toLowerCase();
        if(text.includes("valider la checklist")||text.includes("demander un suivi"))button.classList.add("hidden");
      });
    }
  }

  function patchPageTitle(){
    if(window.stopflow050CorrectionPagePatched||typeof page!=="function")return;
    window.stopflow050CorrectionPagePatched=true;
    const previousPage=page;
    page=function(id){
      previousPage(id);
      if(id==="suggestions"){
        const title=document.getElementById("pageTitle");
        if(title)title.textContent="Suggestions du mois";
      }
      setTimeout(applyCorrection,0);
    };
  }

  function applyCorrection(){
    injectCorrectionStyles();
    renameMonthlySuggestions();
    clarifyChecklistSuggestions();
    enforceVisibleRights();
  }

  function initialize(){
    if(initialized)return;
    if(typeof page!=="function"||!document.getElementById("app")){
      setTimeout(initialize,50);
      return;
    }
    initialized=true;
    patchPageTitle();
    applyCorrection();

    const observer=new MutationObserver(()=>applyCorrection());
    observer.observe(document.getElementById("app"),{childList:true,subtree:true});
    window.addEventListener("load",applyCorrection);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);else initialize();
})();
