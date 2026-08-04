/* StopFlow 0.5.2 — corrections de lisibilité mobile. */
(function(){
  const KEY="stopflow-052-open-sections";
  const state={started:false,scheduled:false};

  function mobile(){return window.matchMedia?.("(max-width:950px)").matches??window.innerWidth<=950}

  function loadCss(){
    if(document.querySelector('link[data-stopflow-052-mobile-corrections="0.5.2"]'))return;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="stopflow-052-mobile-corrections.css?v=0522";
    link.dataset.stopflow052MobileCorrections="0.5.2";
    document.head.appendChild(link);
  }

  function storedSections(){
    try{return new Set(JSON.parse(localStorage.getItem(KEY)||"[]"))}catch{return new Set()}
  }

  function saveSections(){
    const open=[...document.querySelectorAll('.sf52-secondary-card.sf52-section-open')].map(card=>card.dataset.sf52Section).filter(Boolean);
    localStorage.setItem(KEY,JSON.stringify(open));
  }

  function makeCollapsible(card,index){
    if(!card||card.dataset.sf52Collapsible==="1")return;
    const heading=card.querySelector("h2,h3");
    if(!heading)return;
    const title=heading.textContent.trim();
    const id=(card.id||title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""))+"-"+index;
    const content=document.createElement("div");
    content.className="sf52-secondary-content";
    while(card.firstChild)content.appendChild(card.firstChild);
    heading.classList.add("sf52-original-section-heading");
    const toggle=document.createElement("button");
    toggle.type="button";
    toggle.className="sf52-section-toggle";
    toggle.setAttribute("aria-expanded","false");
    toggle.innerHTML=`<span>${title}</span><span>›</span>`;
    card.dataset.sf52Collapsible="1";
    card.dataset.sf52Section=id;
    card.classList.add("sf52-secondary-card");
    card.append(toggle,content);
    const shouldOpen=storedSections().has(id);
    card.classList.toggle("sf52-section-open",shouldOpen);
    toggle.setAttribute("aria-expanded",String(shouldOpen));
    toggle.addEventListener("click",()=>{
      const open=!card.classList.contains("sf52-section-open");
      card.classList.toggle("sf52-section-open",open);
      toggle.setAttribute("aria-expanded",String(open));
      saveSections();
    });
  }

  function simplifySections(){
    if(!mobile())return;
    const checklistCards=[...document.querySelectorAll("#checklistHome>.card")];
    checklistCards.slice(1).forEach((card,index)=>makeCollapsible(card,index));
    const dashboardCards=[...document.querySelectorAll("#dashboard>.card")];
    dashboardCards.slice(1).forEach((card,index)=>makeCollapsible(card,index+20));
  }

  function shortenDrawer(){
    const labels={
      "Nouvel inventaire":"Inventaire bar & cave",
      "Inventaires & commandes":"Commandes",
      "Historique des checklists":"Contrôles & anomalies",
      "Installation & appareils":"Installation"
    };
    document.querySelectorAll("#sf52Drawer .sf52-nav-item").forEach(button=>{
      const text=button.querySelector("span:nth-child(2)");
      if(!text)return;
      const current=text.textContent.trim();
      if(/^Checklists /i.test(current))text.textContent="Checklists";
      else if(labels[current])text.textContent=labels[current];
    });
  }

  function simplifyWording(){
    const substitutions=[
      ["#checklistHome .checklist-toolbar h2","Checklists"],
      ["#dashboard .card h2","Nouvel inventaire"]
    ];
    substitutions.forEach(([selector,value])=>{
      const node=document.querySelector(selector);
      if(node&&node.textContent.trim()!==value)node.textContent=value;
    });
  }

  function apply(){
    document.body.classList.toggle("sf52-extra-compact",mobile());
    if(!mobile())return;
    simplifySections();
    shortenDrawer();
    simplifyWording();
  }

  function schedule(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{state.scheduled=false;apply()});
  }

  function patchNavigation(){
    if(typeof window.page==="function"&&!window.stopflow052CorrectionsPagePatched){
      window.stopflow052CorrectionsPagePatched=true;
      const previous=window.page;
      window.page=function(id){previous(id);setTimeout(schedule,0);setTimeout(schedule,350)};
    }
    const openButton=document.getElementById("sf52MenuButton");
    openButton?.addEventListener("click",()=>setTimeout(shortenDrawer,0));
  }

  function observe(){
    const observer=new MutationObserver(mutations=>{
      if(mutations.some(mutation=>mutation.type==="childList"||mutation.type==="attributes"))schedule();
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
  }

  function start(){
    if(state.started)return;
    state.started=true;
    loadCss();
    patchNavigation();
    observe();
    apply();
    window.matchMedia?.("(max-width:950px)").addEventListener?.("change",schedule);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
