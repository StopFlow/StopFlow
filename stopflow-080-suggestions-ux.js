/* StopFlow 0.8.0 — améliore uniquement l’ergonomie de la page Partager une idée. */
(function(){
  if(window.stopflow080SuggestionsUx?.active)return;

  function injectStyles(){
    if(document.getElementById('stopflow080SuggestionsUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080SuggestionsUxStyles';
    style.textContent=`
      #suggestions{max-width:980px}
      #suggestions > .card:first-child{margin-top:0}
      #suggestions #suggestionForm{display:grid;gap:12px;margin-top:18px}
      #suggestions #suggestionForm .field{margin-top:0!important}
      #suggestions #suggestionForm .filters{margin:0!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}
      #suggestions #suggestionForm .input{min-height:44px}
      #suggestions #suggestionForm textarea.input{min-height:118px;resize:vertical;line-height:1.45}
      #suggestions #suggestionForm button[type="submit"]{justify-self:start;min-height:46px;padding-inline:22px}

      #suggestionList{display:grid;gap:10px;margin-top:14px}
      #suggestionList > div{
        padding:14px 15px!important;
        border:1px solid var(--line)!important;
        border-radius:13px;
        background:#fff;
      }
      #suggestionList > div:last-child{border-bottom:1px solid var(--line)!important}
      #suggestionList > div > .flex{gap:10px;align-items:flex-start}
      #suggestionList > div > .muted{margin-top:5px;line-height:1.35}
      #suggestionList > div > p{margin:10px 0 0;line-height:1.5;overflow-wrap:anywhere}

      @media(max-width:620px){
        #suggestions{padding-bottom:84px}
        #suggestions > .card{margin-top:12px;padding:15px}
        #suggestions > .card:first-child{margin-top:0}
        #suggestions > .card h2{font-size:20px;line-height:1.2}
        #suggestions > .card > p.muted{font-size:13px;line-height:1.4;margin-top:5px}
        #suggestions #suggestionForm{gap:10px;margin-top:15px}
        #suggestions #suggestionForm .filters{grid-template-columns:1fr!important;gap:10px}
        #suggestions #suggestionForm label{font-size:13px}
        #suggestions #suggestionForm .input{font-size:16px;min-height:46px;width:100%}
        #suggestions #suggestionForm textarea.input{min-height:132px}
        #suggestions #suggestionForm button[type="submit"]{width:100%;justify-self:stretch;min-height:48px;margin-top:2px}
        #suggestionList{gap:9px;margin-top:12px}
        #suggestionList > div{padding:13px!important}
        #suggestionList > div > .flex{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start}
        #suggestionList > div > .flex b{font-size:15px;line-height:1.25;overflow-wrap:anywhere}
        #suggestionList > div > .muted{font-size:12px!important}
        #suggestionList > div > p{font-size:14px;margin-top:8px}
      }
    `;
    document.head.appendChild(style);
  }

  function enhance(){
    injectStyles();
    const section=document.getElementById('suggestions');
    if(!section)return;
    section.dataset.sf80SuggestionsUx='1';

    const title=document.getElementById('sugTitle');
    const description=document.getElementById('sugDesc');
    if(title&&!title.placeholder)title.placeholder='Ex. Simplifier le contrôle de fermeture';
    if(description&&!description.placeholder)description.placeholder='Expliquez brièvement ce qui pourrait être amélioré ou le problème rencontré.';

    const category=document.getElementById('sugCategory');
    const priority=document.getElementById('sugPriority');
    [title,description,category,priority].forEach(field=>{
      if(field)field.setAttribute('enterkeyhint',field===description?'done':'next');
    });
  }

  const originalRender=typeof window.renderSuggestions==='function'?window.renderSuggestions:null;
  if(originalRender){
    window.renderSuggestions=function(){
      const result=originalRender.apply(this,arguments);
      enhance();
      return result;
    };
  }

  window.stopflow080SuggestionsUx={active:true,version:'0.8.0',refresh:enhance};
  enhance();
  [100,300,800,1600].forEach(delay=>setTimeout(enhance,delay));
})();
