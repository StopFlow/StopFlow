/* StopFlow 0.8.0 — finalisation Lunchs : historique lisible, dernière occurrence et saisie iPhone. */
(function(){
  if(window.stopflow080LunchFinalUx?.active)return;

  const state={scheduled:false,pageObserver:null,editorObserver:null};
  const page=()=>document.getElementById('sf54Lunchs');
  const list=()=>document.getElementById('sf80LunchList');
  const editor=()=>document.getElementById('sf80KitchenEditor');
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":"&#39;"}[char]));

  function injectStyles(){
    if(document.getElementById('stopflow080LunchFinalUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080LunchFinalUxStyles';
    style.textContent=`
      #sf54Lunchs .sf80-lunch-fixed{margin-top:14px}
      #sf54Lunchs .sf80-lunch-fixed>div{position:relative;padding-left:14px}
      #sf54Lunchs .sf80-lunch-fixed>div:before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:3px;background:#cbd7e8}
      #sf54Lunchs .sf80-lunch-main{box-shadow:0 6px 18px rgba(13,35,62,.045)}
      #sf54Lunchs .sf80-lunch-main h3{font-size:16px}
      #sf54Lunchs .sf80-lunch-main-value{min-height:54px;line-height:1.45}
      #sf54Lunchs .sf80-lunch-last-result{display:none;margin:12px 0 2px;padding:12px 13px;border:1px solid #cfe0ff;border-radius:12px;background:#f3f7ff;color:#284c7d;line-height:1.4}
      #sf54Lunchs .sf80-lunch-last-result.show{display:block}
      #sf54Lunchs .sf80-lunch-last-result strong{display:block;margin-bottom:3px;color:#163f76}
      #sf54Lunchs .sf80-lunch-history-menu{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      #sf54Lunchs .sf80-lunch-history-dish{padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:#fbfcfe}
      #sf54Lunchs .sf80-lunch-history-dish b{display:block;margin-bottom:3px;font-size:12px;color:#566579}
      #sf54Lunchs .sf80-lunch-history-dish span{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font-weight:750;line-height:1.4}
      #sf54Lunchs .sf80-lunch-history-fixed{margin-top:8px;color:var(--muted);font-size:11px;line-height:1.4}
      #sf80KitchenEditor.sf80-lunch-editor-active:not(.hidden){display:flex!important;align-items:flex-end!important;justify-content:center!important}
      #sf80KitchenEditor.sf80-lunch-editor-active .modalbox{width:min(680px,100%)!important;max-height:min(72dvh,620px)!important;overflow:auto!important;background:#fff!important}
      #sf80KitchenEditor.sf80-lunch-editor-active #sf80KitchenEditorTextarea{display:block!important;min-height:170px!important;background:#fff!important;color:var(--text)!important;border:1px solid var(--line)!important;border-radius:12px!important;padding:14px!important;outline:none!important}
      #sf80KitchenEditor.sf80-lunch-editor-active #sf80KitchenEditorTextarea:focus{border-color:#7aa4ff!important;box-shadow:0 0 0 3px #e7efff!important}
      #sf80KitchenEditor .sf80-lunch-editor-helper{margin:10px 0 8px;padding:9px 11px;border-radius:9px;background:#f6f8fb;color:#66758a;font-size:12px;line-height:1.4}
      @media(max-width:620px){
        #sf54Lunchs .sf80-lunch-fixed{grid-template-columns:1fr 1fr!important;gap:8px!important}
        #sf54Lunchs .sf80-lunch-fixed>div{padding:10px 9px 10px 12px!important}
        #sf54Lunchs .sf80-lunch-fixed span{font-size:12px!important}
        #sf54Lunchs .sf80-lunch-history-menu{grid-template-columns:1fr!important}
        #sf80KitchenEditor.sf80-lunch-editor-active .modalbox{margin:0!important;max-height:70dvh!important;border-radius:18px 18px 0 0!important;padding:16px!important}
        #sf80KitchenEditor.sf80-lunch-editor-active #sf80KitchenEditorTextarea{min-height:150px!important;font-size:16px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function parseBody(text){
    const rows={main1:'',main2:'',entries:'',desserts:''};
    String(text||'').split(/\n+/).forEach(line=>{
      const value=line.trim();
      if(/^plat\s*1\s*:/i.test(value))rows.main1=value.replace(/^plat\s*1\s*:\s*/i,'');
      else if(/^plat\s*2\s*:/i.test(value))rows.main2=value.replace(/^plat\s*2\s*:\s*/i,'');
      else if(/^entr[ée]es?\s*:/i.test(value))rows.entries=value.replace(/^entr[ée]es?\s*:\s*/i,'');
      else if(/^desserts?\s*:/i.test(value))rows.desserts=value.replace(/^desserts?\s*:\s*/i,'');
    });
    return rows;
  }

  function enhanceHistoryItem(item){
    const body=item.querySelector('.sf80-planning-body');
    if(!body||body.dataset.sf80LunchStructured==='1')return;
    const data=parseBody(body.textContent);
    if(!data.main1&&!data.main2)return;
    body.dataset.sf80LunchStructured='1';
    body.innerHTML=`<div class="sf80-lunch-history-menu"><div class="sf80-lunch-history-dish"><b>Plat 1</b><span>${esc(data.main1||'—')}</span></div><div class="sf80-lunch-history-dish"><b>Plat 2</b><span>${esc(data.main2||'—')}</span></div></div><div class="sf80-lunch-history-fixed">Entrées : ${esc(data.entries||'2 choix de croquettes à la carte')} · Desserts : ${esc(data.desserts||'crème brûlée ou mousse au chocolat')}</div>`;
  }

  function searchTerm(){
    const text=String(document.getElementById('sf80LunchSearchLabel')?.textContent||'').trim();
    const match=/^Recherche\s*:\s*(.+)$/i.exec(text);
    return match?match[1].trim():'';
  }

  function ensureLastResult(){
    const holder=list();
    if(!holder)return null;
    const card=holder.closest('.card');
    if(!card)return null;
    let result=card.querySelector('#sf80LunchLastResult');
    if(!result){
      result=document.createElement('div');
      result.id='sf80LunchLastResult';
      result.className='sf80-lunch-last-result';
      holder.insertAdjacentElement('beforebegin',result);
    }
    return result;
  }

  function updateLastResult(){
    const result=ensureLastResult();
    if(!result)return;
    const term=searchTerm();
    if(!term){result.classList.remove('show');result.innerHTML='';return;}
    const first=[...(list()?.querySelectorAll(':scope > .sf80-planning-item')||[])].find(item=>!item.hidden);
    if(!first){
      result.innerHTML=`<strong>Aucune occurrence de « ${esc(term)} »</strong>Aucun lunch enregistré ne correspond à cette recherche.`;
      result.classList.add('show');
      return;
    }
    const title=String(first.querySelector('h3')?.textContent||'Lunch').trim();
    const period=String(first.querySelector('.sf80-planning-period')?.textContent||'').trim();
    result.innerHTML=`<strong>Dernière occurrence de « ${esc(term)} »</strong>${esc(title)}${period?` · ${esc(period)}`:''}`;
    result.classList.add('show');
  }

  function enhanceEditor(){
    const layer=editor();
    if(!layer)return;
    const title=String(layer.querySelector('#sf80KitchenEditorTitle')?.textContent||'').trim();
    const active=/^Plat\s*[12]$/i.test(title)||/^Rechercher dans les lunchs$/i.test(title);
    layer.classList.toggle('sf80-lunch-editor-active',active&&!layer.classList.contains('hidden'));
    if(!active)return;
    const textarea=layer.querySelector('#sf80KitchenEditorTextarea');
    if(textarea){
      textarea.placeholder=/^Rechercher/i.test(title)?'Ex. porc, poulet, saumon…':`Écrivez ${title.toLowerCase()}…`;
      textarea.setAttribute('inputmode','text');
      textarea.setAttribute('enterkeyhint','done');
    }
    let helper=layer.querySelector('.sf80-lunch-editor-helper');
    if(!helper){
      helper=document.createElement('div');
      helper.className='sf80-lunch-editor-helper';
      textarea?.insertAdjacentElement('beforebegin',helper);
    }
    helper.textContent=/^Rechercher/i.test(title)?'Tapez un ingrédient ou un mot du plat pour retrouver la dernière semaine correspondante.':'Le texte saisi sera visible dans le planning de la semaine puis dans l’historique.';
  }

  function enhancePage(){
    injectStyles();
    const node=page();
    if(!node||node.classList.contains('hidden'))return;
    list()?.querySelectorAll(':scope > .sf80-planning-item').forEach(enhanceHistoryItem);
    updateLastResult();
    enhanceEditor();
  }

  function schedule(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{state.scheduled=false;enhancePage()});
  }

  function installObservers(){
    const node=page();
    if(node&&!state.pageObserver){
      state.pageObserver=new MutationObserver(schedule);
      state.pageObserver.observe(node,{childList:true,subtree:true,characterData:true});
    }
    const layer=editor();
    if(layer&&!state.editorObserver){
      state.editorObserver=new MutationObserver(()=>requestAnimationFrame(enhanceEditor));
      state.editorObserver.observe(layer,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
    }
  }

  function refresh(){installObservers();schedule()}

  window.stopflow080LunchFinalUx={active:true,version:'0.8.0',refresh};
  injectStyles();
  [0,100,350,900,1800].forEach(delay=>setTimeout(refresh,delay));
})();
