/* StopFlow 0.6.0 — vocabulaire distinct pour les idées communes. */
(function(){
  if(window.stopflow060IdeasWording)return;
  window.stopflow060IdeasWording=true;

  function setMenuLabel(){
    document.querySelectorAll('[data-sf54="page:suggestions"]').forEach(button=>{
      const desktopLabel=button.querySelector('.sf53-label');
      const mobileLabel=button.querySelector('span:nth-child(2)');
      if(desktopLabel)desktopLabel.textContent="Partager une idée";
      else if(mobileLabel)mobileLabel.textContent="Partager une idée";
      else button.textContent="Partager une idée";
    });
    document.querySelectorAll('[data-page="suggestions"]').forEach(button=>{
      if(button.closest('.mobilebar'))button.innerHTML="Idées";
      else button.textContent="Partager une idée";
    });
  }

  function applyPageWording(){
    const section=document.getElementById('suggestions');
    if(!section)return;
    const cards=section.querySelectorAll(':scope > .card');
    const firstTitle=cards[0]?.querySelector('h2');
    const intro=cards[0]?.querySelector('p.muted');
    const submit=section.querySelector('#suggestionForm button[type="submit"]');
    const historyTitle=cards[1]?.querySelector('h2');
    if(firstTitle)firstTitle.textContent="Partager une idée";
    if(intro)intro.textContent="Une idée, un problème ou une amélioration pour simplifier le travail au restaurant ou améliorer StopFlow.";
    if(submit)submit.textContent="Partager l’idée";
    if(historyTitle)historyTitle.textContent="Idées et améliorations partagées";
    if(!section.classList.contains('hidden')){
      const pageTitle=document.getElementById('pageTitle');
      if(pageTitle)pageTitle.textContent="Idées et améliorations";
    }
  }

  if(typeof renderSuggestions==='function'){
    const previousRenderSuggestions=renderSuggestions;
    renderSuggestions=function(){
      const result=previousRenderSuggestions(...arguments);
      const empty=document.querySelector('#suggestionList > p.muted');
      if(empty&&empty.textContent.trim()==='Aucune suggestion enregistrée.')empty.textContent="Aucune idée partagée pour le moment.";
      return result;
    };
  }

  const form=document.getElementById('suggestionForm');
  if(form){
    form.onsubmit=event=>{
      event.preventDefault();
      db.suggestions.push({
        id:Date.now(),
        title:document.getElementById('sugTitle').value,
        description:document.getElementById('sugDesc').value,
        category:document.getElementById('sugCategory').value,
        priority:document.getElementById('sugPriority').value,
        status:'Nouvelle',
        createdAt:new Date().toISOString()
      });
      save();
      event.target.reset();
      renderSuggestions();
      alert("Idée partagée.");
    };
  }

  if(typeof page==='function'){
    const previousPage=page;
    page=function(id){
      const result=previousPage(...arguments);
      if(id==='suggestions')setTimeout(applyPageWording,0);
      setTimeout(setMenuLabel,0);
      return result;
    };
  }

  const observer=new MutationObserver(()=>{
    setMenuLabel();
    applyPageWording();
  });
  observer.observe(document.body,{childList:true,subtree:true});

  [0,100,350,900].forEach(delay=>setTimeout(()=>{
    setMenuLabel();
    applyPageWording();
  },delay));
})();
