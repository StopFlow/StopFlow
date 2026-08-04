/* StopFlow 0.5.2 — navigation mobile latérale et interface épurée. */
(function(){
  const VERSION="0.5.2";
  const MOBILE_QUERY="(max-width: 950px)";
  const DEPARTMENT_LABELS={
    cuisine:"Cuisine",
    salle:"Salle",
    nettoyage:"Entretien & hygiène",
    bureau:"Bureau"
  };
  const state={
    initialized:false,
    drawerOpen:false,
    activeDepartment:null,
    touchStart:null,
    lastDepartment:"",
    rebuildScheduled:false
  };

  const mobileMedia=window.matchMedia?.(MOBILE_QUERY);
  const isMobile=()=>mobileMedia?.matches??window.innerWidth<=950;
  const currentSession=()=>typeof session!=="undefined"&&session?session:(window.session||{});
  const isManager=()=>{
    if(typeof isResponsible==="function")return isResponsible();
    return ["admin","responsable"].includes(String(currentSession().role||"").toLowerCase());
  };
  const userDepartment=()=>String(currentSession().department||currentSession().departement||"").toLowerCase();
  const departmentLabel=value=>DEPARTMENT_LABELS[value]||"Département non défini";

  function injectStyles(){
    if(document.querySelector('link[data-stopflow-052-mobile="0.5.2"]'))return;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="stopflow-052-mobile.css?v=0520";
    link.dataset.stopflow052Mobile="0.5.2";
    document.head.appendChild(link);
  }

  function pageExists(id){
    return Boolean(document.getElementById(id));
  }

  function sourceButton(id){
    return document.querySelector(`.sidebar .nav button[data-page="${id}"]`);
  }

  function pageAllowed(id){
    if(!pageExists(id))return false;
    const source=sourceButton(id);
    return !source||!source.classList.contains("hidden");
  }

  function makeItem(label,action,options={}){
    return {label,action,icon:options.icon||"•",detail:options.detail||"",department:options.department||null,requiresPage:options.requiresPage||null};
  }

  function buildGroups(){
    const manager=isManager();
    const own=userDepartment();
    const allowedDepartments=manager?Object.keys(DEPARTMENT_LABELS):(DEPARTMENT_LABELS[own]?[own]:[]);
    const groups=[];

    for(const department of allowedDepartments){
      const items=[];
      if(pageAllowed("checklists"))items.push(makeItem(`Checklists ${departmentLabel(department).toLowerCase()}`,"checklists",{icon:"✓",department}));
      if(department==="salle"){
        if(pageExists("dashboard"))items.unshift(makeItem("Nouvel inventaire","new-inventory",{icon:"＋"}));
        if(pageAllowed("history"))items.push(makeItem("Inventaires & commandes","order-history",{icon:"↻"}));
      }
      if(department==="bureau"){
        if(pageAllowed("history"))items.push(makeItem("Historique des checklists","checklist-history",{icon:"◷"}));
        const bureauPages=[
          ["suppliers","Fournisseurs","▦"],
          ["articles","Articles","□"],
          ["users","Utilisateurs","♙"],
          ["settings","Paramètres","⚙"]
        ];
        for(const [id,label,icon] of bureauPages){
          if(pageAllowed(id))items.push(makeItem(label,`page:${id}`,{icon,requiresPage:id}));
        }
      }
      if(items.length)groups.push({id:department,label:departmentLabel(department),icon:department==="cuisine"?"◉":department==="salle"?"▤":department==="nettoyage"?"✦":"▣",items});
    }

    const common=[];
    if(pageAllowed("suggestions"))common.push(makeItem("Idées & améliorations","page:suggestions",{icon:"◇",requiresPage:"suggestions"}));
    if(pageAllowed("installation"))common.push(makeItem("Installation & appareils","page:installation",{icon:"⇩",requiresPage:"installation"}));
    if(common.length)groups.push({id:"common",label:"Commun",icon:"···",items:common});
    return groups;
  }

  function ensureMobileShell(){
    if(document.getElementById("sf52MobileHeader"))return;
    const header=document.createElement("header");
    header.id="sf52MobileHeader";
    header.className="sf52-mobile-header";
    header.innerHTML=`
      <button class="sf52-menu-button" id="sf52MenuButton" type="button" aria-label="Ouvrir le menu" aria-controls="sf52Drawer" aria-expanded="false">☰</button>
      <div class="sf52-mobile-title" id="sf52MobileTitle">StopFlow</div>
      <button class="sf52-header-action" id="sf52HomeButton" type="button" aria-label="Retour à l’accueil">⌂</button>`;

    const overlay=document.createElement("div");
    overlay.id="sf52DrawerOverlay";
    overlay.className="sf52-drawer-overlay";

    const drawer=document.createElement("aside");
    drawer.id="sf52Drawer";
    drawer.className="sf52-drawer";
    drawer.setAttribute("aria-hidden","true");
    drawer.innerHTML=`
      <div class="sf52-drawer-head">
        <div class="sf52-drawer-brand"><span class="sf52-drawer-logo">↗</span><span>StopFlow<small class="sf52-drawer-subtitle">Navigation par département</small></span></div>
        <button class="sf52-drawer-close" id="sf52DrawerClose" type="button" aria-label="Fermer le menu">×</button>
      </div>
      <div class="sf52-drawer-scroll" id="sf52DrawerContent"></div>
      <div class="sf52-drawer-foot">
        <div class="sf52-user-line"><div class="sf52-user-avatar" id="sf52UserAvatar">—</div><div><div class="sf52-user-name" id="sf52UserName">Utilisateur</div><div class="sf52-user-meta" id="sf52UserMeta"></div></div></div>
        <button class="sf52-logout" id="sf52Logout" type="button">Déconnexion</button>
      </div>`;

    document.body.append(header,overlay,drawer);
    document.getElementById("sf52MenuButton").addEventListener("click",openDrawer);
    document.getElementById("sf52DrawerClose").addEventListener("click",closeDrawer);
    overlay.addEventListener("click",closeDrawer);
    document.getElementById("sf52HomeButton").addEventListener("click",()=>navigate("page:dashboard"));
    document.getElementById("sf52Logout").addEventListener("click",()=>document.getElementById("logout")?.click());
    document.addEventListener("keydown",event=>{if(event.key==="Escape")closeDrawer()});
    installSwipeGestures(drawer);
  }

  function installSwipeGestures(drawer){
    document.addEventListener("touchstart",event=>{
      if(!isMobile()||event.touches.length!==1)return;
      const touch=event.touches[0];
      const target=event.target;
      if(target.closest("input,textarea,select,.tablewrap,.qty"))return;
      state.touchStart={x:touch.clientX,y:touch.clientY,time:Date.now(),drawer:state.drawerOpen};
    },{passive:true});

    document.addEventListener("touchend",event=>{
      const start=state.touchStart;
      state.touchStart=null;
      if(!start||!isMobile()||!event.changedTouches.length)return;
      const touch=event.changedTouches[0];
      const dx=touch.clientX-start.x;
      const dy=touch.clientY-start.y;
      if(Date.now()-start.time>650||Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.35)return;
      if(!start.drawer&&start.x<=28&&dx>0)openDrawer();
      if(start.drawer&&dx<0)closeDrawer();
    },{passive:true});

    drawer.addEventListener("touchmove",event=>{
      if(state.drawerOpen&&event.touches.length===1&&event.touches[0].clientX<4)closeDrawer();
    },{passive:true});
  }

  function openDrawer(){
    if(!isMobile())return;
    rebuildDrawer();
    state.drawerOpen=true;
    document.body.classList.add("sf52-drawer-open");
    document.getElementById("sf52Drawer")?.setAttribute("aria-hidden","false");
    document.getElementById("sf52MenuButton")?.setAttribute("aria-expanded","true");
  }

  function closeDrawer(){
    state.drawerOpen=false;
    document.body.classList.remove("sf52-drawer-open");
    document.getElementById("sf52Drawer")?.setAttribute("aria-hidden","true");
    document.getElementById("sf52MenuButton")?.setAttribute("aria-expanded","false");
  }

  function drawerButton(item){
    const button=document.createElement("button");
    button.type="button";
    button.className="sf52-nav-item";
    button.dataset.action=item.action;
    if(item.department)button.dataset.department=item.department;
    button.innerHTML=`<span>${item.icon}</span><span>${item.label}</span>${item.detail?`<small>${item.detail}</small>`:""}`;
    button.addEventListener("click",()=>navigate(item.action,item.department));
    return button;
  }

  function rebuildDrawer(){
    const content=document.getElementById("sf52DrawerContent");
    if(!content)return;
    const expanded=content.querySelector('.sf52-nav-group-toggle[aria-expanded="true"]')?.dataset.group||localStorage.getItem("stopflow-052-open-group")||userDepartment();
    content.innerHTML="";

    const home=document.createElement("button");
    home.type="button";
    home.className="sf52-nav-home";
    home.dataset.action="page:dashboard";
    home.innerHTML="<span>⌂</span><span>Accueil</span>";
    home.addEventListener("click",()=>navigate("page:dashboard"));
    content.appendChild(home);

    for(const group of buildGroups()){
      const wrapper=document.createElement("section");
      wrapper.className="sf52-nav-group";
      const toggle=document.createElement("button");
      toggle.type="button";
      toggle.className="sf52-nav-group-toggle";
      toggle.dataset.group=group.id;
      const isOpen=group.id===expanded;
      toggle.setAttribute("aria-expanded",String(isOpen));
      toggle.innerHTML=`<span>${group.icon}</span><span>${group.label}</span><span class="sf52-nav-chevron">›</span>`;
      const panel=document.createElement("div");
      panel.className="sf52-nav-panel"+(isOpen?" open":"");
      group.items.forEach(item=>panel.appendChild(drawerButton(item)));
      toggle.addEventListener("click",()=>{
        const opening=toggle.getAttribute("aria-expanded")!=="true";
        content.querySelectorAll(".sf52-nav-group-toggle").forEach(other=>other.setAttribute("aria-expanded","false"));
        content.querySelectorAll(".sf52-nav-panel").forEach(other=>other.classList.remove("open"));
        toggle.setAttribute("aria-expanded",String(opening));
        panel.classList.toggle("open",opening);
        if(opening)localStorage.setItem("stopflow-052-open-group",group.id);
      });
      wrapper.append(toggle,panel);
      content.appendChild(wrapper);
    }

    updateUserIdentity();
    updateActiveNavigation();
  }

  function activePageId(){
    return document.querySelector(".page:not(.hidden)")?.id||"dashboard";
  }

  function updateActiveNavigation(){
    const active=activePageId();
    document.querySelectorAll(".sf52-nav-home,.sf52-nav-item").forEach(button=>{
      const action=button.dataset.action||"";
      let selected=action===`page:${active}`;
      if(active==="checklists"&&action==="checklists")selected=!button.dataset.department||button.dataset.department===state.activeDepartment;
      if(active==="history"&&action==="order-history")selected=document.querySelector('[data-history-mode="orders"]')?.classList.contains("active")!==false;
      if(active==="history"&&action==="checklist-history")selected=document.querySelector('[data-history-mode="checklists"]')?.classList.contains("active")===true;
      if(action==="new-inventory")selected=false;
      button.classList.toggle("active",selected);
    });
  }

  function navigate(action,department=null){
    closeDrawer();
    if(typeof window.page!=="function")return;
    if(action.startsWith("page:")){
      state.activeDepartment=null;
      window.page(action.slice(5));
      return;
    }
    if(action==="new-inventory"){
      state.activeDepartment=null;
      window.page("dashboard");
      setTimeout(()=>{
        const target=[...document.querySelectorAll("#dashboard h2")].find(node=>/nouvel inventaire/i.test(node.textContent))?.closest(".card")||document.querySelector("#dashboard .supplier-grid");
        target?.scrollIntoView({behavior:"smooth",block:"start"});
      },80);
      return;
    }
    if(action==="checklists"){
      state.activeDepartment=department||userDepartment()||null;
      window.page("checklists");
      setTimeout(applyChecklistDepartmentFilter,80);
      setTimeout(applyChecklistDepartmentFilter,500);
      return;
    }
    if(action==="order-history"||action==="checklist-history"){
      state.activeDepartment=null;
      window.page("history");
      const mode=action==="checklist-history"?"checklists":"orders";
      setTimeout(()=>{
        const button=document.querySelector(`[data-history-mode="${mode}"]`);
        if(button)button.click();
        updateMobileTitle();
        updateActiveNavigation();
      },80);
    }
  }

  function restoreChecklistVisibility(){
    document.querySelectorAll("#checklistTemplates .checklist-template,#checklistRuns .checklist-run-row").forEach(element=>element.classList.remove("hidden"));
    document.getElementById("sf52DepartmentFilter")?.remove();
  }

  function applyChecklistDepartmentFilter(){
    if(activePageId()!=="checklists")return;
    restoreChecklistVisibility();
    if(!state.activeDepartment)return;
    const label=departmentLabel(state.activeDepartment);
    document.querySelectorAll("#checklistTemplates .checklist-template").forEach(card=>{
      const cardDepartment=card.querySelector(".checklist-pill.department")?.textContent.trim();
      card.classList.toggle("hidden",cardDepartment!==label);
    });
    document.querySelectorAll("#checklistRuns .checklist-run-row").forEach(row=>{
      const meta=row.querySelector("small")?.textContent||"";
      row.classList.toggle("hidden",!meta.includes(label));
    });

    const home=document.getElementById("checklistHome");
    if(home&&!document.getElementById("sf52DepartmentFilter")){
      const banner=document.createElement("div");
      banner.id="sf52DepartmentFilter";
      banner.className="sf52-department-filter";
      banner.innerHTML=`<span>Affichage : <b>${label}</b></span>${isManager()?'<button type="button">Voir tous</button>':""}`;
      banner.querySelector("button")?.addEventListener("click",()=>{state.activeDepartment=null;restoreChecklistVisibility();updateMobileTitle();updateActiveNavigation()});
      home.insertAdjacentElement("afterbegin",banner);
    }
    updateMobileTitle();
  }

  function updateUserIdentity(){
    const activeSession=currentSession();
    const name=String(activeSession.name||document.querySelector(".usercard b")?.textContent||"Utilisateur");
    const role=String(activeSession.role||document.getElementById("userRoleLabel")?.textContent||"");
    const department=userDepartment();
    const initials=name.split(/\s+/).filter(Boolean).map(part=>part[0]).join("").slice(0,2).toUpperCase()||"—";
    const avatar=document.getElementById("sf52UserAvatar");
    const nameNode=document.getElementById("sf52UserName");
    const meta=document.getElementById("sf52UserMeta");
    if(avatar)avatar.textContent=initials;
    if(nameNode)nameNode.textContent=name;
    if(meta)meta.textContent=[role,department?departmentLabel(department):""].filter(Boolean).join(" · ");
  }

  function updateMobileTitle(){
    const title=document.getElementById("sf52MobileTitle");
    if(!title)return;
    let text=document.getElementById("pageTitle")?.textContent?.trim()||"StopFlow";
    if(activePageId()==="checklists"&&state.activeDepartment)text=`Checklists — ${departmentLabel(state.activeDepartment)}`;
    if(activePageId()==="history"){
      if(document.querySelector('[data-history-mode="checklists"]')?.classList.contains("active"))text="Historique des checklists";
      else text="Inventaires & commandes";
    }
    title.textContent=text;
  }

  function patchCore(){
    if(window.stopflow052CorePatched)return;
    window.stopflow052CorePatched=true;

    if(typeof window.page==="function"){
      const previousPage=window.page;
      window.page=function(id){
        previousPage(id);
        setTimeout(()=>{
          if(id!=="checklists")state.activeDepartment=null;
          updateMobileTitle();
          updateActiveNavigation();
          if(id==="checklists")applyChecklistDepartmentFilter();
        },0);
      };
    }

    if(typeof window.showApp==="function"){
      const previousShowApp=window.showApp;
      window.showApp=function(){
        previousShowApp();
        setTimeout(afterAppVisible,0);
        setTimeout(afterAppVisible,700);
      };
    }

    if(typeof window.applyRole==="function"){
      const previousApplyRole=window.applyRole;
      window.applyRole=function(){
        previousApplyRole();
        scheduleRebuild();
      };
    }
  }

  function afterAppVisible(){
    ensureMobileShell();
    const app=document.getElementById("app");
    const visible=Boolean(app&&!app.classList.contains("hidden"));
    document.body.classList.toggle("sf52-app-visible",visible);
    if(!visible){closeDrawer();return}
    scheduleRebuild();
    updateMobileTitle();
    if(isMobile())document.getElementById("stopflowInstallCard")?.remove();
  }

  function scheduleRebuild(){
    if(state.rebuildScheduled)return;
    state.rebuildScheduled=true;
    requestAnimationFrame(()=>{
      state.rebuildScheduled=false;
      rebuildDrawer();
      updateMobileTitle();
    });
  }

  function observeInterface(){
    const app=document.getElementById("app");
    if(!app)return;
    const observer=new MutationObserver(mutations=>{
      let relevant=false;
      for(const mutation of mutations){
        if(mutation.type==="childList"){
          if([...mutation.addedNodes,...mutation.removedNodes].some(node=>node.nodeType===1)){relevant=true;break}
        }
        if(mutation.type==="attributes"&&mutation.target.matches?.(".page,[data-page],[data-history-mode]")){relevant=true;break}
      }
      if(!relevant)return;
      scheduleRebuild();
      if(activePageId()==="checklists"&&state.activeDepartment)setTimeout(applyChecklistDepartmentFilter,0);
    });
    observer.observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
  }

  function monitorDepartment(){
    let checks=0;
    const timer=setInterval(()=>{
      checks++;
      const current=userDepartment();
      if(current!==state.lastDepartment){
        state.lastDepartment=current;
        scheduleRebuild();
      }
      if(checks>=20)clearInterval(timer);
    },400);
  }

  function initialize(){
    if(state.initialized)return;
    state.initialized=true;
    injectStyles();
    ensureMobileShell();
    patchCore();
    observeInterface();
    monitorDepartment();
    afterAppVisible();
    mobileMedia?.addEventListener?.("change",event=>{if(!event.matches)closeDrawer();else afterAppVisible()});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);else initialize();
})();
