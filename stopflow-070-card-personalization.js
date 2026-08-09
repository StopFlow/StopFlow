/* StopFlow 0.7.0 — personnalisation personnelle des cartes (ordre + visibilité). */
(function(){
  if(window.stopflow070CardPersonalization?.active)return;

  const navigation=()=>window.stopflow070CardNavigation;
  const VALID_ZONES=new Set(["home","cuisine","salle","nettoyage","general"]);
  const state={
    active:true,
    profileId:null,
    prefs:new Map(),
    loaded:false,
    loading:null,
    editingZone:null,
    saving:false,
    saveTimer:null,
    observers:[],
    drag:null
  };

  const key=(zone,cardKey)=>`${zone}|${cardKey}`;
  const currentProfileId=()=>typeof session!=="undefined"&&session?.id?String(session.id):null;
  const currentZone=()=>{
    const zone=navigation()?.runtime?.currentZone||"home";
    return VALID_ZONES.has(zone)?zone:"home";
  };

  window.stopflow070CardPersonalization={
    active:true,
    state,
    reload:loadPreferences,
    resetZone,
    personalize:zone=>enterEdit(zone||currentZone())
  };

  function injectStyles(){
    if(document.getElementById("stopflow070CardPersonalizationStyles"))return;
    const style=document.createElement("style");
    style.id="stopflow070CardPersonalizationStyles";
    style.textContent=`
      .sf70-personalize-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-left:auto}
      .sf70-personalize-button,.sf70-personalize-done,.sf70-personalize-reset,.sf70-show-card{
        min-height:34px;border-radius:9px;border:1px solid #cfd9e7;background:#fff;color:#28415c;padding:7px 11px;font-size:11px;font-weight:800;cursor:pointer
      }
      .sf70-personalize-button:hover,.sf70-personalize-reset:hover,.sf70-show-card:hover{background:#f5f8fc}
      .sf70-personalize-done{border-color:#2463eb;background:#2463eb;color:#fff}
      .sf70-personalize-status{min-width:68px;color:#708197;font-size:10px;font-weight:700;text-align:right}
      .sf70-personalizing .sf70-action-card{cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;outline:1px dashed #b9c7da;outline-offset:-5px}
      .sf70-personalizing .sf70-action-card:active{cursor:grabbing}
      .sf70-personalizing .sf70-action-card.sf70-dragging{opacity:.58;transform:scale(.985);box-shadow:0 16px 35px rgba(13,35,62,.14)}
      .sf70-edit-strip{position:absolute;z-index:2;top:8px;right:8px;left:12px;display:flex;align-items:center;justify-content:space-between;pointer-events:none}
      .sf70-drag-handle{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:7px;background:rgba(255,255,255,.94);border:1px solid #d9e2ee;color:#607086;font-size:10px;font-weight:900;box-shadow:0 2px 8px rgba(13,35,62,.06);pointer-events:none}
      .sf70-hide-card{pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:27px;padding:0 7px;border-radius:7px;border:1px solid #ead5d5;background:rgba(255,255,255,.96);color:#9d3d3d;font-size:10px;font-weight:850;cursor:pointer}
      .sf70-personalizing .sf70-card-icon{margin-top:23px}
      .sf70-hidden-panel{margin-top:16px;padding:13px;border:1px dashed #cfd9e7;border-radius:13px;background:#fafbfd}
      .sf70-hidden-panel h3{margin:0 0 4px;font-size:13px}.sf70-hidden-panel p{margin:0 0 9px}
      .sf70-hidden-list{display:grid;gap:6px}
      .sf70-hidden-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 9px;border-radius:9px;background:#fff;border:1px solid #e2e8f0}
      .sf70-hidden-row strong{font-size:11.5px}.sf70-hidden-empty{font-size:10.5px;color:#8290a3}
      .sf70-home-intro.sf70-personalize-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
      .sf70-home-intro.sf70-personalize-head>div:first-child{min-width:180px}
      @media(max-width:620px){
        .sf70-personalize-toolbar{width:100%;margin-left:0}.sf70-personalize-toolbar button{flex:1}
        .sf70-personalize-status{width:100%;text-align:left}
        .sf70-personalizing .sf70-card-icon{margin-top:22px}
      }
    `;
    document.head.appendChild(style);
  }

  function preference(zone,cardKey){
    return state.prefs.get(key(zone,cardKey))||null;
  }

  async function loadPreferences(force=false){
    const profileId=currentProfileId();
    if(!profileId){
      state.profileId=null;state.prefs.clear();state.loaded=true;return [];
    }
    if(!force&&state.loaded&&state.profileId===profileId)return [...state.prefs.values()];
    if(state.loading)return state.loading;

    state.loading=(async()=>{
      state.profileId=profileId;
      state.prefs.clear();
      if(typeof supabaseClient==="undefined"||!supabaseClient){state.loaded=true;return []}
      const {data,error}=await supabaseClient
        .from("profile_card_preferences")
        .select("zone,card_key,position,hidden,settings")
        .eq("profile_id",profileId)
        .order("zone")
        .order("position");
      if(error)throw error;
      (data||[]).forEach(row=>state.prefs.set(key(row.zone,row.card_key),{
        zone:row.zone,card_key:row.card_key,position:Number(row.position)||0,hidden:Boolean(row.hidden),settings:row.settings||{}
      }));
      state.loaded=true;
      return data||[];
    })().finally(()=>{state.loading=null});
    return state.loading;
  }

  function pageForZone(zone){
    if(zone==="home")return document.getElementById("sf70Home");
    return document.getElementById("sf70ZonePage");
  }

  function gridForZone(zone){
    const pageNode=pageForZone(zone);
    return pageNode?.querySelector(":scope > .sf70-card-grid") || pageNode?.querySelector(".sf70-card-grid") || null;
  }

  function cardNodes(zone){
    const grid=gridForZone(zone);
    if(!grid)return [];
    return [...grid.children].filter(node=>node.matches?.(".sf70-action-card[data-sf70-card]"));
  }

  function defaultPosition(card,index){
    const pref=preference(currentZone(),card.dataset.sf70Card||"");
    return pref?pref.position:1000+index;
  }

  function sortedCards(zone){
    return cardNodes(zone).map((card,index)=>({card,index,pref:preference(zone,card.dataset.sf70Card||"")}))
      .sort((a,b)=>{
        const pa=a.pref?Number(a.pref.position):1000+a.index;
        const pb=b.pref?Number(b.pref.position):1000+b.index;
        return pa-pb||a.index-b.index;
      }).map(item=>item.card);
  }

  function stripEditUi(card){
    card.querySelector(":scope > .sf70-edit-strip")?.remove();
    card.classList.remove("sf70-dragging");
  }

  function cardTitle(card){
    return card.querySelector(".sf70-card-title")?.textContent?.trim()||card.dataset.sf70Card||"Carte";
  }

  function applyOrderAndVisibility(zone){
    const grid=gridForZone(zone);
    if(!grid)return;
    const editing=state.editingZone===zone;
    grid.classList.toggle("sf70-personalizing",editing);

    const cards=sortedCards(zone);
    cards.forEach(card=>grid.appendChild(card));
    cards.forEach(card=>{
      const cardKey=card.dataset.sf70Card||"";
      const pref=preference(zone,cardKey);
      const hidden=Boolean(pref?.hidden);
      stripEditUi(card);
      card.style.display=hidden?"none":"";
      if(editing&&!hidden)addEditUi(zone,card);
    });

    renderHiddenPanel(zone,cards);
    installGridInteractions(zone,grid);
  }

  function addEditUi(zone,card){
    if(card.querySelector(":scope > .sf70-edit-strip"))return;
    const strip=document.createElement("span");
    strip.className="sf70-edit-strip";
    strip.innerHTML='<span class="sf70-drag-handle">↕ Déplacer</span><span class="sf70-hide-card" role="button" tabindex="0">Masquer</span>';
    const hide=strip.querySelector(".sf70-hide-card");
    const hideCard=event=>{
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
      setHidden(zone,card.dataset.sf70Card||"",true);
    };
    hide.addEventListener("pointerdown",hideCard,true);
    hide.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" ")hideCard(event)});
    card.appendChild(strip);
  }

  function renderHiddenPanel(zone,cards){
    const pageNode=pageForZone(zone);
    if(!pageNode)return;
    pageNode.querySelector(":scope > .sf70-hidden-panel")?.remove();
    if(state.editingZone!==zone)return;

    const hidden=cards.filter(card=>Boolean(preference(zone,card.dataset.sf70Card||"")?.hidden));
    const panel=document.createElement("div");
    panel.className="sf70-hidden-panel";
    panel.innerHTML=`<h3>Cartes masquées</h3><p class="muted">Elles restent autorisées. Elles sont seulement retirées de votre affichage.</p><div class="sf70-hidden-list"></div>`;
    const list=panel.querySelector(".sf70-hidden-list");
    if(!hidden.length){
      list.innerHTML='<div class="sf70-hidden-empty">Aucune carte masquée dans cet espace.</div>';
    }else{
      hidden.forEach(card=>{
        const row=document.createElement("div");
        row.className="sf70-hidden-row";
        row.innerHTML=`<strong>${escapeHtml(cardTitle(card))}</strong><button type="button" class="sf70-show-card">Afficher</button>`;
        row.querySelector("button").onclick=()=>setHidden(zone,card.dataset.sf70Card||"",false);
        list.appendChild(row);
      });
    }
    pageNode.appendChild(panel);
  }

  function escapeHtml(value){
    return String(value??"").replace(/[&<>\"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[char]));
  }

  function toolbarHost(zone){
    const pageNode=pageForZone(zone);
    if(!pageNode)return null;
    if(zone==="home"){
      const intro=pageNode.querySelector(":scope > .sf70-home-intro");
      if(!intro)return null;
      if(!intro.classList.contains("sf70-personalize-head")){
        const h2=intro.querySelector("h2"),p=intro.querySelector("p");
        if(h2||p){
          const text=document.createElement("div");
          if(h2)text.appendChild(h2);
          if(p)text.appendChild(p);
          intro.prepend(text);
        }
        intro.classList.add("sf70-personalize-head");
      }
      return intro;
    }
    return pageNode.querySelector(":scope > .sf70-zone-head")||pageNode.querySelector(".sf70-zone-head");
  }

  function renderToolbar(zone){
    const host=toolbarHost(zone);
    if(!host)return;
    host.querySelector(":scope > .sf70-personalize-toolbar")?.remove();
    const editing=state.editingZone===zone;
    const toolbar=document.createElement("div");
    toolbar.className="sf70-personalize-toolbar";
    if(editing){
      toolbar.innerHTML='<button type="button" class="sf70-personalize-reset">Réinitialiser</button><button type="button" class="sf70-personalize-done">Terminer</button><span class="sf70-personalize-status"></span>';
      toolbar.querySelector(".sf70-personalize-reset").onclick=()=>resetZone(zone);
      toolbar.querySelector(".sf70-personalize-done").onclick=()=>leaveEdit(zone);
    }else{
      toolbar.innerHTML='<button type="button" class="sf70-personalize-button">Personnaliser</button>';
      toolbar.querySelector("button").onclick=()=>enterEdit(zone);
    }
    host.appendChild(toolbar);
  }

  function updateStatus(text){
    document.querySelectorAll(".sf70-personalize-status").forEach(node=>node.textContent=text||"");
  }

  async function setHidden(zone,cardKey,hidden){
    if(!cardKey)return;
    const existing=preference(zone,cardKey)||{zone,card_key:cardKey,position:positionOf(zone,cardKey),hidden:false,settings:{}};
    existing.hidden=hidden;
    state.prefs.set(key(zone,cardKey),existing);
    applyOrderAndVisibility(zone);
    scheduleSave(zone);
  }

  function positionOf(zone,cardKey){
    const cards=sortedCards(zone);
    const index=cards.findIndex(card=>card.dataset.sf70Card===cardKey);
    return index<0?cards.length:index;
  }

  function enterEdit(zone){
    if(!VALID_ZONES.has(zone))return;
    state.editingZone=zone;
    enhance(zone);
  }

  function leaveEdit(zone){
    if(state.editingZone===zone)state.editingZone=null;
    enhance(zone);
  }

  async function resetZone(zone){
    if(!state.profileId||typeof supabaseClient==="undefined"||!supabaseClient)return;
    if(!confirm("Réinitialiser l’ordre et réafficher toutes les cartes de cet espace ?"))return;
    updateStatus("Réinitialisation…");
    const {error}=await supabaseClient.from("profile_card_preferences").delete().eq("profile_id",state.profileId).eq("zone",zone);
    if(error){console.warn("StopFlow 0.7.0 — réinitialisation cartes",error);updateStatus("Erreur");return}
    [...state.prefs.keys()].filter(item=>item.startsWith(`${zone}|`)).forEach(item=>state.prefs.delete(item));
    state.editingZone=null;
    enhance(zone);
  }

  function installGridInteractions(zone,grid){
    if(grid.dataset.sf70PersonalizationEvents==="1")return;
    grid.dataset.sf70PersonalizationEvents="1";

    grid.addEventListener("click",event=>{
      if(state.editingZone!==zone)return;
      if(event.target.closest?.(".sf70-hide-card"))return;
      if(event.target.closest?.(".sf70-action-card")){
        event.preventDefault();event.stopImmediatePropagation();
      }
    },true);

    grid.addEventListener("pointerdown",event=>{
      if(state.editingZone!==zone||event.button!==0)return;
      if(event.target.closest?.(".sf70-hide-card"))return;
      const card=event.target.closest?.(".sf70-action-card[data-sf70-card]");
      if(!card||card.style.display==="none")return;
      event.preventDefault();event.stopImmediatePropagation();
      state.drag={zone,grid,card,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false};
      card.setPointerCapture?.(event.pointerId);
      card.classList.add("sf70-dragging");
    },true);

    grid.addEventListener("pointermove",event=>{
      const drag=state.drag;
      if(!drag||drag.grid!==grid||drag.pointerId!==event.pointerId)return;
      const distance=Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY);
      if(distance>5)drag.moved=true;
      if(!drag.moved)return;
      event.preventDefault();
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest?.(".sf70-action-card[data-sf70-card]");
      if(!target||target===drag.card||target.parentElement!==grid||target.style.display==="none")return;
      const rect=target.getBoundingClientRect();
      const before=event.clientY<rect.top+rect.height/2 || (Math.abs(event.clientY-(rect.top+rect.height/2))<rect.height*.18&&event.clientX<rect.left+rect.width/2);
      grid.insertBefore(drag.card,before?target:target.nextSibling);
    },true);

    const finish=event=>{
      const drag=state.drag;
      if(!drag||drag.grid!==grid||drag.pointerId!==event.pointerId)return;
      event.preventDefault();event.stopImmediatePropagation();
      drag.card.classList.remove("sf70-dragging");
      try{drag.card.releasePointerCapture?.(event.pointerId)}catch{}
      state.drag=null;
      if(drag.moved){captureOrder(zone);scheduleSave(zone)}
    };
    grid.addEventListener("pointerup",finish,true);
    grid.addEventListener("pointercancel",finish,true);
  }

  function captureOrder(zone){
    const cards=cardNodes(zone).filter(card=>card.style.display!=="none");
    cards.forEach((card,index)=>{
      const cardKey=card.dataset.sf70Card||"";
      if(!cardKey)return;
      const existing=preference(zone,cardKey)||{zone,card_key:cardKey,hidden:false,settings:{}};
      existing.position=index;
      state.prefs.set(key(zone,cardKey),existing);
    });
    const hidden=cardNodes(zone).filter(card=>card.style.display==="none");
    hidden.forEach((card,index)=>{
      const cardKey=card.dataset.sf70Card||"";
      const existing=preference(zone,cardKey)||{zone,card_key:cardKey,hidden:true,settings:{}};
      if(!Number.isFinite(existing.position))existing.position=cards.length+index;
      state.prefs.set(key(zone,cardKey),existing);
    });
  }

  function scheduleSave(zone){
    clearTimeout(state.saveTimer);
    updateStatus("Enregistrement…");
    state.saveTimer=setTimeout(()=>saveZone(zone),180);
  }

  async function saveZone(zone){
    if(!state.profileId||typeof supabaseClient==="undefined"||!supabaseClient)return;
    captureOrder(zone);
    const cards=cardNodes(zone);
    const rows=cards.map((card,index)=>{
      const cardKey=card.dataset.sf70Card||"";
      const pref=preference(zone,cardKey)||{position:index,hidden:false,settings:{}};
      return {
        profile_id:state.profileId,
        zone,
        card_key:cardKey,
        position:Number.isFinite(pref.position)?pref.position:index,
        hidden:Boolean(pref.hidden),
        settings:pref.settings||{},
        updated_at:new Date().toISOString()
      };
    }).filter(row=>row.card_key);
    if(!rows.length){updateStatus("");return}
    state.saving=true;
    const {error}=await supabaseClient.from("profile_card_preferences").upsert(rows,{onConflict:"profile_id,zone,card_key"});
    state.saving=false;
    if(error){console.warn("StopFlow 0.7.0 — sauvegarde personnalisation",error);updateStatus("Erreur");return}
    updateStatus("Enregistré");
    setTimeout(()=>{if(!state.saving)updateStatus("")},1000);
  }

  async function enhance(zone=currentZone()){
    if(!VALID_ZONES.has(zone))return;
    try{await loadPreferences()}catch(error){console.warn("StopFlow 0.7.0 — préférences cartes",error);return}
    const pageNode=pageForZone(zone);
    if(!pageNode)return;
    renderToolbar(zone);
    applyOrderAndVisibility(zone);
  }

  function observePage(id){
    const node=document.getElementById(id);
    if(!node||node.dataset.sf70PersonalizationObserved==="1")return;
    node.dataset.sf70PersonalizationObserved="1";
    const observer=new MutationObserver(mutations=>{
      if(!mutations.some(mutation=>mutation.type==="childList"&&mutation.target===node))return;
      queueMicrotask(()=>enhance(currentZone()));
    });
    observer.observe(node,{childList:true,subtree:false});
    state.observers.push(observer);
  }

  function attach(){
    injectStyles();
    if(!navigation()?.active)return;
    observePage("sf70Home");
    observePage("sf70ZonePage");
    observePage("sf70GeneralDetail");
    enhance(currentZone());
  }

  let attempts=0;
  const timer=setInterval(()=>{
    attach();
    attempts+=1;
    if(attempts>=40||(navigation()?.active&&document.getElementById("sf70Home")))clearInterval(timer);
  },100);
  [0,150,450,900,1800].forEach(delay=>setTimeout(attach,delay));
})();
