/* StopFlow 0.6.0 — vocabulaire distinct pour les idées communes, sans surveillance continue. */
(function(){
  if(window.stopflow060IdeasWording)return;
  window.stopflow060IdeasWording=true;

  const setText=(node,text)=>{
    if(node&&node.textContent!==text)node.textContent=text;
  };

  function setMenuLabel(){
    document.querySelectorAll('[data-sf54="page:suggestions"]').forEach(button=>{
      const desktopLabel=button.querySelector('.sf53-label');
      const mobileLabel=button.querySelector('span:nth-child(2)');
      if(desktopLabel)setText(desktopLabel,"Partager une idée");
      else if(mobileLabel)setText(mobileLabel,"Partager une idée");
      else setText(button,"Partager une idée");
    });
    document.querySelectorAll('[data-page="suggestions"]').forEach(button=>{
      setText(button,button.closest('.mobilebar')?"Idées":"Partager une idée");
    });
  }

  function applyPageWording(){
    const section=document.getElementById('suggestions');
    if(!section)return;
    const cards=section.querySelectorAll(':scope > .card');
    setText(cards[0]?.querySelector('h2'),"Partager une idée");
    setText(cards[0]?.querySelector('p.muted'),"Une idée, un problème ou une amélioration pour simplifier le travail au restaurant ou améliorer StopFlow.");
    setText(section.querySelector('#suggestionForm button[type="submit"]'),"Partager l’idée");
    setText(cards[1]?.querySelector('h2'),"Idées et améliorations partagées");
    if(!section.classList.contains('hidden'))setText(document.getElementById('pageTitle'),"Idées et améliorations");
  }

  function applyWording(){
    setMenuLabel();
    applyPageWording();
  }

  if(typeof renderSuggestions==='function'){
    const previousRenderSuggestions=renderSuggestions;
    renderSuggestions=function(){
      const result=previousRenderSuggestions(...arguments);
      const empty=document.querySelector('#suggestionList > p.muted');
      if(empty&&empty.textContent.trim()==='Aucune suggestion enregistrée.')setText(empty,"Aucune idée partagée pour le moment.");
      applyPageWording();
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
      setTimeout(applyWording,0);
      return result;
    };
  }

  if(typeof showApp==='function'){
    const previousShowApp=showApp;
    showApp=function(){
      const result=previousShowApp(...arguments);
      [0,150,700,1500].forEach(delay=>setTimeout(applyWording,delay));
      return result;
    };
  }

  [0,100,350,900,1800].forEach(delay=>setTimeout(applyWording,delay));
})();
