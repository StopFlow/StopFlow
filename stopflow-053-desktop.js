/* StopFlow 0.5.3 — navigation ordinateur par département. */
(function(){
  const VERSION="0.5.3";
  const DESKTOP_QUERY="(min-width: 951px)";
  const OPEN_GROUP_KEY="stopflow-053-desktop-open-group";
  const COLLAPSED_KEY="stopflow-053-desktop-collapsed";
  const DEPARTMENT_LABELS={
    cuisine:"Cuisine",
    salle:"Salle",
    nettoyage:"Entretien & hygiène",
    bureau:"Bureau"
  };
  const state={
    initialized:false,
    collapsed:false,
    activeDepartment:null,
    lastDepartment:"",
    rebuildScheduled:false
  };

  const desktopMedia=window.matchMedia?.(DESKTOP_QUERY);
  const isDesktop=()=>desktopMedia?.matches??window.innerWidth>=951;
  const currentSession=()=>typeof session!=="undefined"&&session?session:(window.session||{});
  const isManager=()=>{
    if(typeof isResponsible==="function")return isResponsible();
    return ["admin","responsable"].includes(String(currentSession().role||"").toLowerCase());
  };
  const userDepartment=()=>String(currentSession().department||currentSession().departement||"").toLowerCase();
  const departmentLabel=value=>DEPARTMENT_LABELS[value]||"Département non défini";

  function injectStyles(){
    if(document.querySelector('link[data-stopflow-053-desktop="0.5.3"]'))return;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="stopflow-053-desktop.css?v=0530";
    link.dataset.stopflow053Desktop="0.5.3";
    document.head.appendChild(link);
  }

  function pageExists(id){return Boolean(document.getElementById(id))}
  function sourceButton(id){return document.querySelector(`.sidebar>.nav button[data-page="${id}"]`)}
  function pageAllowed(id){
    if(!pageExists(id))return false;
    const source=sourceButton(id);
    return !source||!source.classList.contains("hidden");
  }
  function item(label,action,icon,department=null){return {label,action,icon,department,disabled:false}}
  function disabledItem(label){return {label,action:"",icon:"!",department:null,disabled:true}}

  function buildGroups(){
    const manager=isManager();
    const own=userDepartment();
    const departments=manager?Object.keys(DEPARTMENT_LABELS):(DEPARTMENT_LABELS[own]?[own]:[]);
    const groups=[];

    for(const department of departments){
      const items=[];
      if(department==="salle"){
        if(pageExists("dashboard"))items.push(item("Inventaire bar & cave","new-inventory","＋"));
        if(pageAllowed("history"))items.push(item("Commandes","order-history","↻"));
      }
      if(pageAllowed("checklists"))items.push(item("Checklists","checklists","✓",department));
      if(department==="bureau"){
        if(pageAllowed("history"))items.push(item("Contrôles & anomalies","checklist-history","◷"));
        const bureauPages=[
          ["suppliers","Fournisseurs","▦"],
          ["articles","Articles","□"],
          ["users","Utilisateurs","♙"],
          ["settings","Paramètres","⚙"]
        ];
        for(const [id,label,icon] of bureauPages){
          if(pageAllowed(id))items.push(item(label,`page:${id}`,icon));
        }
      }
      if(items.length){
        groups.push({
          id:department,
          label:departmentLabel(department),
          icon:department==="cuisine"?"◉":department==="salle"?"▤":department==="nettoyage"?"✦":"▣",
          items
        });
      }
    }

    if(!manager&&!departments.length){
      groups.push({id:"department",label:"Département",icon:"!",items:[disabledItem("À définir par l’administrateur")]});
    }

    const common=[];
    if(pageAllowed("suggestions"))common.push(item("Idées & améliorations","page:suggestions","◇"));
    if(pageAllowed("installation"))common.push(item("Installation","page:installation","⇩"));
    if(common.length)groups.push({id:"common",label:"Commun",icon:"···",items:common});
    return groups;
  }

  function ensureDesktopNavigation(){
    const sidebar=document.querySelector("#app>.sidebar");
    if(!sidebar||document.getElementById("sf53DesktopNav"))return;

    const toolbar=document.createElement("div");
    toolbar.className="sf53-sidebar-toolbar";
    toolbar.innerHTML='<button class="sf53-collapse-button" id="sf53CollapseButton" type="button" aria-label="Réduire le menu" title="Réduire le menu">‹</button>';

    const nav=document.createElement("nav");
    nav.id="sf53DesktopNav";
    nav.className="sf53-desktop-nav";
    nav.setAttribute("aria-label","Navigation StopFlow par département");

    const originalNav=sidebar.querySelector(":scope>.nav");
    if(originalNav)originalNav.insertAdjacentElement("beforebegin",toolbar);
    else sidebar.appendChild(toolbar);
    toolbar.insertAdjacentElement("afterend",nav);

    document.getElementById("sf53CollapseButton").addEventListener("click",toggleCollapsed);
    state.collapsed=localStorage.getItem(COLLAPSED_KEY)==="1";
    applyCollapsedState();
  }

  function makeNavigationButton(entry){
    const button=document.createElement("button");
    button.type="button";
    button.className="sf53-nav-item"+(entry.disabled?" disabled":"");
    button.disabled=entry.disabled;
    button.dataset.action=entry.action;
    if(entry.department)button.dataset.department=entry.department;
    button.title=entry.label;
    button.innerHTML=`<span class="sf53-icon">${entry.icon}</span><span class="sf53-label">${entry.label}</span>`;
    if(!entry.disabled)button.addEventListener("click",()=>navigate(entry.action,entry.department));
    return button;
  }

  function rebuildDesktopNavigation(){
    ensureDesktopNavigation();
    const nav=document.getElementById("sf53DesktopNav");
    if(!nav)return;
    const previousOpen=nav.querySelector('.sf53-group-toggle[aria-expanded="true"]')?.dataset.group;
    const preferredOpen=previousOpen||localStorage.getItem(OPEN_GROUP_KEY)||userDepartment()||"salle";
    nav.innerHTML="";

    const home=document.createElement("button");
    home.type="button";
    home.className="sf53-home";
    home.dataset.action="page:dashboard";
    home.title="Accueil";
    home.innerHTML='<span class="sf53-icon">⌂</span><span class="sf53-label">Accueil</span>';
    home.addEventListener("click",()=>navigate("page:dashboard"));
    nav.appendChild(home);

    for(const group of buildGroups()){
      const section=document.createElement("section");
      section.className="sf53-group";
      section.dataset.group=group.id;

      const toggle=document.createElement("button");
      toggle.type="button";
      toggle.className="sf53-group-toggle";
      toggle.dataset.group=group.id;
      toggle.title=group.label;
      const open=group.id===preferredOpen;
      toggle.setAttribute("aria-expanded",String(open));
      toggle.innerHTML=`<span class="sf53-icon">${group.icon}</span><span class="sf53-label">${group.label}</span><span class="sf53-chevron">›</span>`;

      const panel=document.createElement("div");
      panel.className="sf53-group-panel"+(open?" open":"");
      group.items.forEach(entry=>panel.appendChild(makeNavigationButton(entry)));

      toggle.addEventListener("click",()=>{
        if(state.collapsed){
          state.collapsed=false;
          localStorage.setItem(COLLAPSED_KEY,"0");
          applyCollapsedState();
          setOpenGroup(group.id,true);
          return;
        }
        const opening=toggle.getAttribute("aria-expanded")!=="true";
        setOpenGroup(opening?group.id:null,true);
      });

      section.append(toggle,panel);
      nav.appendChild(section);
    }

    updateActiveNavigation();
  }

  function setOpenGroup(groupId,persist){
    const nav=document.getElementById("sf53DesktopNav");
    if(!nav)return;
    nav.querySelectorAll(".sf53-group-toggle").forEach(toggle=>{
      const open=Boolean(groupId)&&toggle.dataset.group===groupId;
      toggle.setAttribute("aria-expanded",String(open));
      toggle.closest(".sf53-group")?.querySelector(".sf53-group-panel")?.classList.toggle("open",open);
    });
    if(persist){
      if(groupId)localStorage.setItem(OPEN_GROUP_KEY,groupId);
      else localStorage.removeItem(OPEN_GROUP_KEY);
    }
  }

  function toggleCollapsed(){
    if(!isDesktop())return;
    state.collapsed=!state.collapsed;
    localStorage.setItem(COLLAPSED_KEY,state.collapsed?"1":"0");
    applyCollapsedState();
  }

  function applyCollapsedState(){
    const app=document.getElementById("app");
    const button=document.getElementById("sf53CollapseButton");
    const collapsed=isDesktop()&&state.collapsed;
    app?.classList.toggle("sf53-desktop-collapsed",collapsed);
    if(button){
      button.textContent=collapsed?"›":"‹";
      button.setAttribute("aria-label",collapsed?"Agrandir le menu":"Réduire le menu");
      button.title=collapsed?"Agrandir le menu":"Réduire le menu";
    }
  }

  function activePageId(){return document.querySelector("#app .page:not(.hidden)")?.id||"dashboard"}

  function updateActiveNavigation(){
    const nav=document.getElementById("sf53DesktopNav");
    if(!nav)return;
    const active=activePageId();
    nav.querySelectorAll(".sf53-home,.sf53-nav-item").forEach(button=>{
      const action=button.dataset.action||"";
      let selected=action===`page:${active}`;
      if(active==="checklists"&&action==="checklists")selected=!button.dataset.department||button.dataset.department===state.activeDepartment;
      if(active==="history"&&action==="order-history")selected=document.querySelector('[data-history-mode="orders"]')?.classList.contains("active")!==false;
      if(active==="history"&&action==="checklist-history")selected=document.querySelector('[data-history-mode="checklists"]')?.classList.contains("active")===true;
      if(action==="new-inventory")selected=false;
      button.classList.toggle("active",selected);
    });

    nav.querySelectorAll(".sf53-group").forEach(group=>{
      const activeChild=Boolean(group.querySelector(".sf53-nav-item.active"));
      group.querySelector(".sf53-group-toggle")?.classList.toggle("active",activeChild);
      if(activeChild&&!state.collapsed)setOpenGroup(group.dataset.group,false);
    });
  }

  function navigate(action,department=null){
    if(typeof page!=="function")return;
    if(action.startsWith("page:")){
      state.activeDepartment=null;
      restoreChecklistVisibility();
      page(action.slice(5));
      return;
    }
    if(action==="new-inventory"){
      state.activeDepartment=null;
      restoreChecklistVisibility();
      page("dashboard");
      setTimeout(()=>{
        const target=[...document.querySelectorAll("#dashboard h2")].find(node=>/nouvel inventaire/i.test(node.textContent))?.closest(".card")||document.querySelector("#dashboard .supplier-grid");
        target?.scrollIntoView({behavior:"smooth",block:"start"});
      },80);
      return;
    }
    if(action==="checklists"){
      state.activeDepartment=department||userDepartment()||null;
      page("checklists");
      [60,300,800].forEach(delay=>setTimeout(applyChecklistDepartmentFilter,delay));
      return;
    }
    if(action==="order-history"||action==="checklist-history"){
      state.activeDepartment=null;
      restoreChecklistVisibility();
      page("history");
      const mode=action==="checklist-history"?"checklists":"orders";
      setTimeout(()=>{
        document.querySelector(`[data-history-mode="${mode}"]`)?.click();
        updateActiveNavigation();
      },80);
    }
  }

  function restoreChecklistVisibility(){
    document.querySelectorAll(".sf53-desktop-filtered").forEach(element=>element.classList.remove("sf53-desktop-filtered"));
    document.getElementById("sf53DepartmentFilter")?.remove();
  }

  function applyChecklistDepartmentFilter(){
    restoreChecklistVisibility();
    if(!isDesktop()||activePageId()!=="checklists"||!state.activeDepartment)return;
    const label=departmentLabel(state.activeDepartment);
    document.querySelectorAll("#checklistTemplates .checklist-template").forEach(card=>{
      const cardDepartment=card.querySelector(".checklist-pill.department")?.textContent.trim();
      card.classList.toggle("sf53-desktop-filtered",cardDepartment!==label);
    });
    document.querySelectorAll("#checklistRuns .checklist-run-row").forEach(row=>{
      const meta=row.querySelector("small")?.textContent||"";
      row.classList.toggle("sf53-desktop-filtered",!meta.includes(label));
    });

    const home=document.getElementById("checklistHome");
    if(home&&!document.getElementById("sf53DepartmentFilter")){
      const banner=document.createElement("div");
      banner.id="sf53DepartmentFilter";
      banner.className="sf53-department-filter";
      banner.innerHTML=`<span>Affichage : <b>${label}</b></span>${isManager()?'<button type="button">Voir tous les départements</button>':""}`;
      banner.querySelector("button")?.addEventListener("click",()=>{
        state.activeDepartment=null;
        restoreChecklistVisibility();
        updateActiveNavigation();
      });
      home.insertAdjacentElement("afterbegin",banner);
    }
  }

  function patchCore(){
    if(window.stopflow053CorePatched)return;
    window.stopflow053CorePatched=true;

    if(typeof page==="function"){
      const previousPage=page;
      page=function(id){
        previousPage(id);
        setTimeout(()=>{
          if(id!=="checklists"){
            state.activeDepartment=null;
            restoreChecklistVisibility();
          }
          updateActiveNavigation();
          if(id==="checklists"&&state.activeDepartment)applyChecklistDepartmentFilter();
        },0);
      };
    }

    if(typeof showApp==="function"){
      const previousShowApp=showApp;
      showApp=function(){
        previousShowApp();
        setTimeout(afterAppVisible,0);
        setTimeout(afterAppVisible,700);
      };
    }

    if(typeof applyRole==="function"){
      const previousApplyRole=applyRole;
      applyRole=function(){
        previousApplyRole();
        scheduleRebuild();
      };
    }
  }

  function afterAppVisible(){
    ensureDesktopNavigation();
    const app=document.getElementById("app");
    if(!app||app.classList.contains("hidden"))return;
    scheduleRebuild();
    applyCollapsedState();
  }

  function scheduleRebuild(){
    if(state.rebuildScheduled)return;
    state.rebuildScheduled=true;
    requestAnimationFrame(()=>{
      state.rebuildScheduled=false;
      rebuildDesktopNavigation();
      applyCollapsedState();
    });
  }

  function observeInterface(){
    const app=document.getElementById("app");
    if(!app)return;
    const observer=new MutationObserver(mutations=>{
      let rebuild=false;
      let refilter=false;
      for(const mutation of mutations){
        if(mutation.type==="childList"){
          const changed=[...mutation.addedNodes,...mutation.removedNodes].some(node=>node.nodeType===1);
          if(changed){
            if(mutation.target.closest?.("#checklistTemplates,#checklistRuns"))refilter=true;
            if(mutation.target.closest?.(".sidebar>.nav")||mutation.target===app)rebuild=true;
          }
        }
        if(mutation.type==="attributes"&&mutation.target.matches?.(".sidebar>.nav [data-page]"))rebuild=true;
      }
      if(rebuild)scheduleRebuild();
      if(refilter&&state.activeDepartment)setTimeout(applyChecklistDepartmentFilter,0);
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
      if(checks>=25)clearInterval(timer);
    },400);
  }

  function initialize(){
    if(state.initialized)return;
    state.initialized=true;
    injectStyles();
    ensureDesktopNavigation();
    patchCore();
    observeInterface();
    monitorDepartment();
    afterAppVisible();
    desktopMedia?.addEventListener?.("change",event=>{
      if(!event.matches){
        document.getElementById("app")?.classList.remove("sf53-desktop-collapsed");
        restoreChecklistVisibility();
      }else{
        applyCollapsedState();
        scheduleRebuild();
      }
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);else initialize();
})();
