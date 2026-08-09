/* StopFlow 0.7.0 — navigation par grandes zones et cartes selon les permissions. */
(function(){
  const S=window.SF54;
  if(!S||window.stopflow070CardNavigation?.active)return;

  const ZONES={
    cuisine:{label:"Cuisine",icon:"◉",tone:"blue"},
    salle:{label:"Salle",icon:"▤",tone:"green"},
    nettoyage:{label:"Entretien & hygiène",icon:"✦",tone:"amber"},
    general:{label:"Général",icon:"◎",tone:"violet"}
  };
  const OPERATIONAL=["cuisine","salle","nettoyage"];
  const SCOPE_LABELS={cuisine:"Cuisine",salle:"Salle",nettoyage:"Entretien & hygiène"};

  const DEPARTMENT_CARDS={
    cuisine:[
      {key:"inventory.use",title:"Inventaires",description:"Fournisseurs, stocks et nouvel inventaire",icon:"▦",tone:"blue",action:"inventory"},
      {key:"checklists.run",title:"Checklists",description:"Ouverture, fermeture et procédures",icon:"✓",tone:"green",action:"checklists"},
      {key:"temperatures.use",title:"Températures",description:"Encoder et consulter les relevés",icon:"°",tone:"amber",action:"temperatures"},
      {key:"history.view",title:"Historique",description:"Inventaires et commandes du département",icon:"◷",tone:"slate",action:"history"},
      {key:"lunchs.view",title:"Lunchs hebdomadaires",description:"Consulter les lunchs de la semaine",icon:"♨",tone:"rose",action:"lunchs"},
      {key:"monthly_suggestions.view",title:"Suggestions du mois",description:"Consulter les suggestions Cuisine",icon:"✧",tone:"violet",action:"suggestions-month"}
    ],
    salle:[
      {key:"inventory.use",title:"Inventaires",description:"Fournisseurs, stocks et nouvel inventaire",icon:"▦",tone:"blue",action:"inventory"},
      {key:"checklists.run",title:"Checklists",description:"Ouverture, fermeture et procédures",icon:"✓",tone:"green",action:"checklists"},
      {key:"history.view",title:"Historique",description:"Inventaires et commandes du département",icon:"◷",tone:"slate",action:"history"}
    ],
    nettoyage:[
      {key:"inventory.use",title:"Inventaires",description:"Produits, stocks et nouvel inventaire",icon:"▦",tone:"blue",action:"inventory"},
      {key:"checklists.run",title:"Checklists",description:"Entretien, contrôles et procédures",icon:"✓",tone:"green",action:"checklists"},
      {key:"history.view",title:"Historique",description:"Inventaires et commandes du département",icon:"◷",tone:"slate",action:"history"}
    ]
  };

  const GENERAL_DIRECT=[
    {key:"ideas.share",scope:"global",title:"Partager une idée",description:"Proposer une amélioration à l’équipe",icon:"◇",tone:"violet",type:"page",target:"suggestions"},
    {key:"banners.manage",scope:"global",title:"Messages d’équipe",description:"Publier les messages affichés sur l’accueil",icon:"✦",tone:"blue",type:"sf54",target:"banners"},
    {key:"settings.manage",scope:"global",title:"Paramètres",description:"Configuration générale de StopFlow",icon:"⚙",tone:"slate",type:"page",target:"settings"}
  ];

  const GENERAL_SCOPED=[
    {key:"orders.manage",title:"Commandes & validations",description:"Valider, commander ou annuler",icon:"↻",tone:"blue",target:"orders"},
    {key:"checklists.review",title:"Contrôle des checklists",description:"Contrôler et demander un suivi",icon:"✓",tone:"green",target:"checklist-review"},
    {key:"checklists.templates.manage",title:"Modèles de checklists",description:"Créer et organiser les tâches",icon:"▤",tone:"slate",target:"checklist-templates"},
    {key:"alerts.view",title:"Anomalies & températures",description:"Voir les éléments qui demandent un suivi",icon:"!",tone:"amber",target:"alerts"},
    {key:"suppliers.manage",title:"Fournisseurs",description:"Gérer les fournisseurs autorisés",icon:"▦",tone:"green",target:"suppliers"},
    {key:"articles.manage",title:"Articles",description:"Gérer les articles autorisés",icon:"□",tone:"violet",target:"articles"}
  ];

  const runtime={
    rows:[],
    signatures:new Set(),
    loaded:false,
    currentZone:"home",
    currentDetail:null,
    refreshTimers:[]
  };

  const esc=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[char]));
  const isAdminUser=()=>typeof isAdmin==="function"?isAdmin():String(session?.role||"").toLowerCase()==="admin";
  const signature=(key,scope)=>`${key}|${scope}`;
  const has=(key,scope)=>isAdminUser()||runtime.signatures.has(signature(key,scope));
  const scopesFor=key=>isAdminUser()?OPERATIONAL.slice():OPERATIONAL.filter(scope=>has(key,scope));
  const zoneCards=zone=>(DEPARTMENT_CARDS[zone]||[]).filter(card=>has(card.key,zone));
  const zoneVisible=zone=>isAdminUser()||zoneCards(zone).length>0;

  const api=window.stopflow070CardNavigation={
    active:true,
    runtime,
    hasPermission:has,
    refreshMenus,
    refresh:refreshAll,
    openZone,
    openHome
  };

  function injectStyles(){
    if(document.getElementById("stopflow070CardNavigationStyles"))return;
    const style=document.createElement("style");
    style.id="stopflow070CardNavigationStyles";
    style.textContent=`
      .sf70-zone-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
      .sf70-zone-head h2{font-size:27px;margin:0 0 5px}.sf70-zone-head p{margin:0}
      .sf70-zone-count{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#edf3ff;color:#2457a7;font-size:12px;font-weight:800}
      .sf70-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .sf70-action-card{position:relative;min-height:150px;border:1px solid var(--line);border-radius:16px;background:#fff;padding:18px;text-align:left;display:flex;flex-direction:column;gap:9px;box-shadow:0 8px 22px rgba(13,35,62,.055);transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease;overflow:hidden}
      .sf70-action-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--sf70-accent,#2463eb)}
      .sf70-action-card:hover{transform:translateY(-2px);border-color:#bfcde2;box-shadow:0 12px 30px rgba(13,35,62,.10)}
      .sf70-action-card:focus-visible{outline:3px solid #dce8ff;outline-offset:2px}
      .sf70-card-icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:var(--sf70-soft,#edf3ff);color:var(--sf70-accent,#2463eb);font-size:20px;font-weight:900}
      .sf70-card-title{font-size:16px;font-weight:850;color:var(--text)}
      .sf70-card-description{font-size:13px;line-height:1.45;color:var(--muted);flex:1}
      .sf70-card-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;font-weight:750;color:#718096}
      .sf70-card-arrow{font-size:18px;color:var(--sf70-accent,#2463eb)}
      .sf70-tone-blue{--sf70-accent:#2463eb;--sf70-soft:#edf3ff}.sf70-tone-green{--sf70-accent:#159a64;--sf70-soft:#eaf8f1}.sf70-tone-amber{--sf70-accent:#c77d00;--sf70-soft:#fff4dd}.sf70-tone-violet{--sf70-accent:#7554c9;--sf70-soft:#f1edff}.sf70-tone-rose{--sf70-accent:#bb4f75;--sf70-soft:#fff0f5}.sf70-tone-slate{--sf70-accent:#526174;--sf70-soft:#eef1f5}
      .sf70-home-intro{margin-bottom:18px;padding:18px 20px;border:1px solid #dbe6f4;border-radius:16px;background:linear-gradient(135deg,#fff,#f5f9ff)}
      .sf70-home-intro h2{margin:0 0 5px;font-size:25px}.sf70-home-intro p{margin:0}
      .sf70-home-banner{margin-bottom:14px;padding:14px 16px;border-radius:13px;border:1px solid #cfe1ff;background:#edf5ff;color:#27547f}.sf70-home-banner.important{background:#fff5dc;border-color:#f1d58e;color:#815a00}.sf70-home-banner.urgent{background:#fff0f0;border-color:#ffcaca;color:#9a2929}
      .sf70-back-button{border:0;background:transparent;color:var(--blue);font-weight:800;padding:5px 0;margin-bottom:10px}
      .sf70-empty{padding:22px;border:1px dashed var(--line);border-radius:14px;background:#fff;color:var(--muted)}
      .sf70-scope-pills{display:flex;gap:5px;flex-wrap:wrap}.sf70-scope-pill{padding:3px 7px;border-radius:999px;background:#f0f3f7;color:#607086;font-size:10px;font-weight:800}
      #sf70ZonePage,#sf70GeneralDetail,#sf70Home{max-width:1180px}
      #sf54Department.sf70-inventory-focus #sf54DepartmentActions{display:none!important}
      #sf54Department.sf70-inventory-focus .sf54-supplier-section{margin-top:0}
      .sf70-simple-nav{display:grid!important;align-content:start;gap:5px}
      .sf70-simple-nav .sf53-home{grid-template-columns:28px minmax(0,1fr)}
      .sf70-simple-nav .sf53-home.active{background:var(--blue);color:#fff}
      .sf70-simple-mobile{display:grid;gap:5px;padding:4px 0}
      .sf70-simple-mobile .sf52-nav-home{width:100%;border:0;text-align:left}
      @media(max-width:950px){.sf70-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:620px){.sf70-card-grid{grid-template-columns:1fr}.sf70-action-card{min-height:128px}.sf70-zone-head h2{font-size:24px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePage(id){
    let section=document.getElementById(id);
    if(section)return section;
    const main=document.querySelector("#app main.main");
    if(!main)return null;
    section=document.createElement("section");
    section.id=id;
    section.className="page hidden";
    main.appendChild(section);
    try{STOPFLOW_STABLE_PAGES.add(id)}catch{}
    return section;
  }

  function ensurePages(){
    ensurePage("sf70Home");
    ensurePage("sf70ZonePage");
    ensurePage("sf70GeneralDetail");
  }

  function setTitle(text){
    const desktop=document.getElementById("pageTitle");
    const mobile=document.getElementById("sf52MobileTitle");
    if(desktop)desktop.textContent=text;
    if(mobile)mobile.textContent=text;
  }

  function cardHtml(card,meta=""){
    return `<button type="button" class="sf70-action-card sf70-tone-${esc(card.tone||"blue")}" data-sf70-card="${esc(card.id||card.key||card.target||"")}">
      <span class="sf70-card-icon">${esc(card.icon||"•")}</span>
      <span class="sf70-card-title">${esc(card.title)}</span>
      <span class="sf70-card-description">${esc(card.description||"")}</span>
      <span class="sf70-card-meta"><span>${meta}</span><span class="sf70-card-arrow">›</span></span>
    </button>`;
  }

  function activeBanner(){
    const rows=S.state?.banners||[];
    const now=Date.now();
    return rows.find(item=>item?.active!==false&&new Date(item.start_at||0).getTime()<=now&&(!item.end_at||new Date(item.end_at).getTime()>=now)&&(isAdminUser()||item.audience==="all"||hasAnyScopeAudience(item.audience)));
  }

  function hasAnyScopeAudience(audience){
    if(!OPERATIONAL.includes(String(audience||"")))return false;
    const scope=String(audience);
    return isAdminUser()||runtime.rows.some(row=>row.scope===scope);
  }

  function renderHome(){
    ensurePages();
    const pageNode=document.getElementById("sf70Home");
    if(!pageNode)return;
    const visibleZones=OPERATIONAL.filter(zone=>zoneVisible(zone));
    const cards=[...visibleZones.map(zone=>({
      id:`zone:${zone}`,title:ZONES[zone].label,description:`${zoneCards(zone).length} fonction${zoneCards(zone).length>1?"s":""} disponible${zoneCards(zone).length>1?"s":""}`,icon:ZONES[zone].icon,tone:ZONES[zone].tone
    })),{id:"zone:general",title:"Général",description:"Fonctions communes et outils de gestion autorisés",icon:ZONES.general.icon,tone:ZONES.general.tone}];
    const banner=activeBanner();
    pageNode.innerHTML=`
      ${banner?`<div class="sf70-home-banner ${esc(banner.level||"")}"><strong>${esc(banner.title||"Message d’équipe")}</strong>${banner.message?`<div style="margin-top:4px">${esc(banner.message)}</div>`:""}</div>`:""}
      <div class="sf70-home-intro"><h2>Accueil</h2><p class="muted">Choisissez l’espace dans lequel vous souhaitez travailler.</p></div>
      <div class="sf70-card-grid">${cards.map(card=>cardHtml(card,"Ouvrir")).join("")}</div>`;
    pageNode.querySelectorAll("[data-sf70-card]").forEach(button=>button.onclick=()=>{
      const value=button.dataset.sf70Card||"";
      if(value.startsWith("zone:"))openZone(value.slice(5));
    });
  }

  function renderDepartmentZone(zone){
    const node=document.getElementById("sf70ZonePage");
    if(!node)return;
    const cards=zoneCards(zone);
    node.innerHTML=`<div class="sf70-zone-head"><div><h2>${esc(ZONES[zone].label)}</h2><p class="muted">Choisissez directement l’action à effectuer.</p></div><span class="sf70-zone-count">${cards.length} fonction${cards.length>1?"s":""}</span></div>${cards.length?`<div class="sf70-card-grid">${cards.map(card=>cardHtml(card,"Ouvrir")).join("")}</div>`:'<div class="sf70-empty">Aucune fonction n’est autorisée dans cet espace.</div>'}`;
    node.querySelectorAll("[data-sf70-card]").forEach(button=>{
      const card=cards.find(item=>(item.key||item.target)===button.dataset.sf70Card);
      if(card)button.onclick=()=>runDepartmentCard(zone,card);
    });
  }

  function generalCards(){
    const direct=GENERAL_DIRECT.filter(card=>has(card.key,card.scope)).map(card=>({...card,id:`direct:${card.key}`}));
    const scoped=GENERAL_SCOPED.map(card=>({...card,scopes:scopesFor(card.key)})).filter(card=>card.scopes.length).map(card=>({...card,id:`scoped:${card.key}`}));
    const universal=[{id:"installation",title:"Installation de StopFlow",description:"Installer l’application sur un appareil",icon:"⇩",tone:"slate",type:"page",target:"installation"}];
    const admin=isAdminUser()?[{id:"users",title:"Utilisateurs",description:"Créer les profils et attribuer les permissions",icon:"♙",tone:"blue",type:"page",target:"users"}]:[];
    return [...direct,...scoped,...admin,...universal];
  }

  function renderGeneral(){
    const node=document.getElementById("sf70ZonePage");
    if(!node)return;
    const cards=generalCards();
    node.innerHTML=`<div class="sf70-zone-head"><div><h2>Général</h2><p class="muted">Fonctions communes et outils de gestion disponibles pour votre profil.</p></div><span class="sf70-zone-count">${cards.length} fonction${cards.length>1?"s":""}</span></div><div class="sf70-card-grid">${cards.map(card=>{
      const meta=card.scopes?.length?card.scopes.map(scope=>`<span class="sf70-scope-pill">${esc(SCOPE_LABELS[scope])}</span>`).join(""):"Ouvrir";
      const html=cardHtml(card,card.scopes?.length?"":meta);
      if(!card.scopes?.length)return html;
      return html.replace('<span class="sf70-card-meta"><span></span>',`<span class="sf70-card-meta"><span class="sf70-scope-pills">${meta}</span>`);
    }).join("")}</div>`;
    node.querySelectorAll("[data-sf70-card]").forEach(button=>{
      const card=cards.find(item=>item.id===button.dataset.sf70Card||item.key===button.dataset.sf70Card||item.target===button.dataset.sf70Card);
      if(card)button.onclick=()=>runGeneralCard(card);
    });
  }

  function renderGeneralDetail(card){
    const node=document.getElementById("sf70GeneralDetail");
    if(!node)return;
    const scopes=card.scopes||scopesFor(card.key);
    runtime.currentDetail=card.key;
    node.innerHTML=`<button class="sf70-back-button" type="button" id="sf70BackGeneral">← Retour à Général</button><div class="sf70-zone-head"><div><h2>${esc(card.title)}</h2><p class="muted">Choisissez le département concerné.</p></div></div><div class="sf70-card-grid">${scopes.map(scope=>cardHtml({id:scope,title:SCOPE_LABELS[scope],description:card.description,icon:ZONES[scope].icon,tone:ZONES[scope].tone},"Continuer")).join("")}</div>`;
    document.getElementById("sf70BackGeneral").onclick=()=>openZone("general");
    node.querySelectorAll("[data-sf70-card]").forEach(button=>button.onclick=()=>runScopedGeneral(card,button.dataset.sf70Card));
  }

  function runDepartmentCard(zone,card){
    runtime.currentZone=zone;
    clearInventoryFocus();
    if(card.action==="inventory")return openInventory(zone);
    if(card.action==="checklists")return S.action("checklists",zone);
    if(card.action==="history")return S.action("history",zone);
    if(card.action==="temperatures")return S.action("temperatures",zone);
    if(card.action==="lunchs")return S.action("lunchs",zone);
    if(card.action==="suggestions-month")return S.action("suggestions-month",zone);
  }

  function openInventory(zone){
    if(!has("inventory.use",zone))return;
    S.state.department=zone;
    if(typeof page==="function")page("sf54Department");
    const focus=()=>{
      const node=document.getElementById("sf54Department");
      if(!node)return;
      node.classList.add("sf70-inventory-focus");
      const title=document.getElementById("sf54DepartmentTitle");
      const intro=document.getElementById("sf54DepartmentIntro");
      if(title)title.textContent=`Inventaires — ${SCOPE_LABELS[zone]}`;
      if(intro)intro.textContent=`Choisissez un fournisseur ${SCOPE_LABELS[zone].toLowerCase()} pour démarrer.`;
      setTitle(`Inventaires — ${SCOPE_LABELS[zone]}`);
    };
    [0,80,250].forEach(delay=>setTimeout(focus,delay));
  }

  function clearInventoryFocus(){
    document.getElementById("sf54Department")?.classList.remove("sf70-inventory-focus");
  }

  function runGeneralCard(card){
    runtime.currentZone="general";
    clearInventoryFocus();
    if(card.scopes?.length){
      if(card.scopes.length===1)return runScopedGeneral(card,card.scopes[0]);
      renderGeneralDetail(card);
      setTitle(card.title);
      return typeof page==="function"?page("sf70GeneralDetail"):undefined;
    }
    if(card.type==="page")return typeof page==="function"?page(card.target):undefined;
    if(card.type==="sf54")return S.action(card.target,null);
  }

  function runScopedGeneral(card,scope){
    if(!scope||!has(card.key,scope))return;
    runtime.currentZone="general";
    if(card.target==="orders"){
      S.state.history=scope;
      if(typeof page==="function")page("history");
      [60,220,650].forEach(delay=>setTimeout(()=>{
        S.state.history=scope;
        try{S.ui?.filterHistory?.()}catch{}
        setTitle(`Commandes & validations — ${SCOPE_LABELS[scope]}`);
      },delay));
      return;
    }
    if(card.target==="checklist-review"||card.target==="checklist-templates"){
      S.state.checklists=scope;
      S.action("checklists",scope);
      const targetId=card.target==="checklist-templates"?"checklistManagerPanel":"checklistRuns";
      setTimeout(()=>document.getElementById(targetId)?.scrollIntoView({behavior:"smooth",block:"start"}),250);
      return;
    }
    if(card.target==="alerts"){
      if(typeof page==="function")page("sf54BureauAlerts");
      setTitle(`Anomalies & températures — ${SCOPE_LABELS[scope]}`);
      return;
    }
    if(card.target==="suppliers"){
      if(typeof page==="function")page("suppliers");
      setTitle(`Fournisseurs — ${SCOPE_LABELS[scope]}`);
      return;
    }
    if(card.target==="articles"){
      if(typeof page==="function")page("articles");
      setTitle(`Articles — ${SCOPE_LABELS[scope]}`);
    }
  }

  function openZone(zone){
    if(zone!=="general"&&!zoneVisible(zone))return openHome();
    runtime.currentZone=zone;
    runtime.currentDetail=null;
    clearInventoryFocus();
    ensurePages();
    if(zone==="general")renderGeneral();else renderDepartmentZone(zone);
    setTitle(ZONES[zone]?.label||"StopFlow");
    if(typeof page==="function")page("sf70ZonePage");
    scheduleMenuRefresh([0,60,180]);
  }

  function openHome(){
    runtime.currentZone="home";
    runtime.currentDetail=null;
    clearInventoryFocus();
    renderHome();
    setTitle("Accueil");
    if(typeof page==="function")page("sf70Home");
    scheduleMenuRefresh([0,60,180]);
  }

  async function loadOwnPermissions(){
    if(isAdminUser()){
      runtime.rows=[];
      runtime.signatures=new Set();
      runtime.loaded=true;
      return runtime.rows;
    }
    if(typeof supabaseClient==="undefined"||!supabaseClient||!session?.id){
      runtime.rows=[];
      runtime.signatures=new Set();
      runtime.loaded=true;
      return runtime.rows;
    }
    const {data,error}=await supabaseClient.from("profile_permissions").select("permission_key,scope").eq("profile_id",session.id).order("scope").order("permission_key");
    if(error)throw error;
    runtime.rows=data||[];
    runtime.signatures=new Set(runtime.rows.map(row=>signature(row.permission_key,row.scope)));
    runtime.loaded=true;
    return runtime.rows;
  }

  function navEntries(){
    const entries=[{id:"home",label:"Accueil",icon:"⌂"}];
    OPERATIONAL.forEach(zone=>{if(zoneVisible(zone))entries.push({id:zone,label:ZONES[zone].label,icon:ZONES[zone].icon})});
    entries.push({id:"general",label:"Général",icon:ZONES.general.icon});
    return entries;
  }

  function navClick(id){
    if(id==="home")openHome();else openZone(id);
    document.getElementById("sf52DrawerClose")?.click();
  }

  function renderDesktopMenu(){
    const nav=document.getElementById("sf53DesktopNav");
    if(!nav)return;
    nav.classList.add("sf70-simple-nav");
    nav.innerHTML="";
    navEntries().forEach(entry=>{
      const button=document.createElement("button");
      button.type="button";
      button.className="sf53-home"+(runtime.currentZone===entry.id?" active":"");
      button.dataset.sf70Zone=entry.id;
      button.title=entry.label;
      button.innerHTML=`<span class="sf53-icon">${entry.icon}</span><span class="sf53-label">${esc(entry.label)}</span>`;
      button.onclick=()=>navClick(entry.id);
      nav.appendChild(button);
    });
    localStorage.removeItem("stopflow-053-desktop-open-group");
  }

  function renderMobileMenu(){
    const content=document.getElementById("sf52DrawerContent");
    if(!content)return;
    content.classList.add("sf70-simple-mobile");
    content.innerHTML="";
    navEntries().forEach(entry=>{
      const button=document.createElement("button");
      button.type="button";
      button.className="sf52-nav-home"+(runtime.currentZone===entry.id?" active":"");
      button.dataset.sf70Zone=entry.id;
      button.innerHTML=`<span>${entry.icon}</span><span>${esc(entry.label)}</span>`;
      button.onclick=()=>navClick(entry.id);
      content.appendChild(button);
    });
    const subtitle=document.querySelector(".sf52-drawer-subtitle");
    if(subtitle)subtitle.textContent="Navigation par objectifs";
    localStorage.removeItem("stopflow-052-open-group");
  }

  function refreshMenus(){
    renderDesktopMenu();
    renderMobileMenu();
  }

  function scheduleMenuRefresh(delays=[0,90,280,760]){
    runtime.refreshTimers.forEach(clearTimeout);
    runtime.refreshTimers=delays.map(delay=>setTimeout(refreshMenus,delay));
  }

  function refreshCurrentView(){
    if(runtime.currentZone==="home")renderHome();
    else if(runtime.currentZone==="general")renderGeneral();
    else if(OPERATIONAL.includes(runtime.currentZone))renderDepartmentZone(runtime.currentZone);
  }

  function refreshAll(){
    refreshCurrentView();
    scheduleMenuRefresh();
  }

  function patchCore(){
    if(window.stopflow070CardNavigationPatched)return;
    window.stopflow070CardNavigationPatched=true;

    if(typeof page==="function"){
      const previousPage=page;
      page=function(id){
        const target=id==="dashboard"?"sf70Home":id;
        const result=previousPage(target);
        if(target==="sf70Home"){runtime.currentZone="home";renderHome();setTitle("Accueil")}
        scheduleMenuRefresh();
        return result;
      };
    }

    if(typeof showApp==="function"){
      const previousShowApp=showApp;
      showApp=function(){
        const result=previousShowApp(...arguments);
        setTimeout(async()=>{
          try{await loadOwnPermissions()}catch(error){console.warn("StopFlow 0.7.0 — permissions navigation",error)}
          ensurePages();
          renderHome();
          runtime.currentZone="home";
          setTitle("Accueil");
          if(typeof page==="function")page("sf70Home");
          scheduleMenuRefresh([0,100,300,780,1100]);
        },0);
        return result;
      };
    }

    if(typeof applyRole==="function"){
      const previousApplyRole=applyRole;
      applyRole=function(){
        const result=previousApplyRole(...arguments);
        scheduleMenuRefresh();
        return result;
      };
    }

    document.getElementById("sf52HomeButton")?.addEventListener("click",event=>{
      event.preventDefault();event.stopImmediatePropagation();openHome();
    },true);
  }

  async function init(){
    injectStyles();
    ensurePages();
    patchCore();
    try{if(session?.id||isAdminUser())await loadOwnPermissions()}catch(error){console.warn("StopFlow 0.7.0 — chargement permissions navigation",error)}
    if(!document.getElementById("app")?.classList.contains("hidden")){
      renderHome();
      if(document.querySelector("#app .page:not(.hidden)")?.id==="dashboard")openHome();
    }
    scheduleMenuRefresh([0,120,360,820]);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
