/* StopFlow 0.8.0 — sous-pages opérationnelles plus directes sur smartphone. */
(function(){
  if(window.stopflow080ZoneUx?.active)return;

  function injectStyles(){
    if(document.getElementById('stopflow080ZoneUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080ZoneUxStyles';
    style.textContent=`
      /* Cuisine / Salle / Entretien uniquement. */
      #sf70ZonePage .sf70-zone-head{
        margin-bottom:16px;
      }

      @media(max-width:950px){
        #sf70ZonePage .sf70-card-grid{
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          gap:12px;
        }
      }

      @media(max-width:620px){
        #sf70ZonePage{
          padding-bottom:82px;
        }
        #sf70ZonePage .sf70-zone-head{
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          align-items:start;
          gap:8px 10px;
          margin-bottom:12px;
        }
        #sf70ZonePage .sf70-zone-head h2{
          font-size:22px;
          line-height:1.15;
          margin:0 0 3px;
        }
        #sf70ZonePage .sf70-zone-head p{
          font-size:13px;
          line-height:1.35;
        }
        #sf70ZonePage .sf70-zone-count{
          padding:5px 8px;
          font-size:10px;
          white-space:nowrap;
        }
        #sf70ZonePage .sf70-card-grid{
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          gap:10px;
        }
        #sf70ZonePage .sf70-action-card{
          min-width:0;
          min-height:118px!important;
          padding:13px 12px 12px 14px;
          gap:7px;
          border-radius:15px;
        }
        #sf70ZonePage .sf70-action-card:before{
          width:4px;
        }
        #sf70ZonePage .sf70-card-icon{
          width:38px;
          height:38px;
          border-radius:10px;
          font-size:19px;
        }
        #sf70ZonePage .sf70-card-title{
          font-size:14px;
          line-height:1.18;
          overflow-wrap:anywhere;
        }
        #sf70ZonePage .sf70-card-description{
          display:none;
        }
        #sf70ZonePage .sf70-card-meta{
          margin-top:auto;
          min-height:18px;
          justify-content:flex-end;
        }
        #sf70ZonePage .sf70-card-meta > span:first-child{
          display:none;
        }
        #sf70ZonePage .sf70-card-arrow{
          font-size:20px;
          line-height:1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function refresh(){
    injectStyles();
    const page=document.getElementById('sf70ZonePage');
    if(page)page.dataset.sf80ZoneUx='1';
  }

  window.stopflow080ZoneUx={active:true,version:'0.8.0',refresh};
  refresh();
  [100,300,800,1600].forEach(delay=>setTimeout(refresh,delay));
})();

/* StopFlow 0.8.0 — organise l’espace Général par type d’usage. */
(function(){
  if(document.querySelector('script[data-stopflow-080-general-ux="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-general-ux.js?v=0800';
  script.async=false;
  script.dataset.stopflow080GeneralUx='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — planning Cuisine : Suggestions mensuelles + Lunchs hebdomadaires. */
(function(){
  if(document.querySelector('script[data-stopflow-080-kitchen-planning="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-kitchen-planning.js?v=0801';
  script.async=false;
  script.dataset.stopflow080KitchenPlanning='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — saisie directe et validation des Suggestions du mois. */
(function(){
  if(document.querySelector('script[data-stopflow-080-monthly-suggestions-flow="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-monthly-suggestions-flow.js?v=0800';
  script.async=false;
  script.dataset.stopflow080MonthlySuggestionsFlow='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — focus iPhone ciblé pour l'encart Suggestions du mois. */
(function(){
  if(document.querySelector('script[data-stopflow-080-monthly-suggestions-focus-fix="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-monthly-suggestions-focus-fix.js?v=0800';
  script.async=false;
  script.dataset.stopflow080MonthlySuggestionsFocusFix='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — historique mensuel et filtres de validation des Suggestions. */
(function(){
  if(document.querySelector('script[data-stopflow-080-monthly-suggestions-history-filters="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-monthly-suggestions-history-filters.js?v=0800';
  script.async=false;
  script.dataset.stopflow080MonthlySuggestionsHistoryFilters='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — finalisation UX des Lunchs hebdomadaires. */
(function(){
  if(document.querySelector('script[data-stopflow-080-lunch-final-ux="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-lunch-final-ux.js?v=0800';
  script.async=false;
  script.dataset.stopflow080LunchFinalUx='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — catégories partagées lors de l'encodage des articles. */
(function(){
  if(document.querySelector('script[data-stopflow-080-article-categories="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-article-categories.js?v=0800';
  script.async=false;
  script.dataset.stopflow080ArticleCategories='0.8.0';
  document.head.appendChild(script);
})();

/* StopFlow 0.8.0 — validation, refus motivé et réponse au proposant. */
(function(){
  if(document.querySelector('script[data-stopflow-080-proposal-review-flow="0.8.0"]'))return;
  const script=document.createElement('script');
  script.src='stopflow-080-proposal-review-flow.js?v=0800';
  script.async=false;
  script.dataset.stopflow080ProposalReviewFlow='0.8.0';
  document.head.appendChild(script);
})();
