/* StopFlow 0.5.4 — menus et démarrage. */
(function(){
  const S=window.SF54;if(!S)return;const {$}=S;
  function entry(panel,label,action,department,desktop){const b=document.createElement("button");b.type="button";b.className=desktop?"sf53-nav-item sf54-menu-entry":"sf52-nav-item sf54-menu-entry";b.dataset.sf54=action;if(department)b.dataset.department=department;b.innerHTML=desktop?`<span class="sf53-icon"></span><span class="sf53-label">${label}</span>`:`<span></span><span>${label}</span>`;b.onclick=()=>S.action(action,department);panel.appendChild(b)}
  const deptEntries=d=>[["Inventaires & fournisseurs","department",d],["Checklists","checklists",d],["Historique","history",d],...(d==="cuisine"?[["Suggestions du mois","suggestions-month",d],["Lunchs hebdomadaires","lunchs",d],["Températures","temperatures",d]]:[])];
  const bureau=()=>[["Vue globale","bureau"],["Tous les inventaires","all-inventories"],["Toutes les checklists","all-checklists"],["Tous les historiques","all-history"],["Validations en attente","pending"],["Anomalies & températures","alerts"],["Messages d’équipe","banners"]];
  function fill(group,id,desktop){const panel=group.querySelector(desktop?".sf53-group-panel":".sf52-nav-panel");if(!panel||panel.dataset.sf54==="0.5.4")return;panel.innerHTML="";if(S.valid(id)){const list=id==="bureau"&&S.manager()?[...deptEntries(id),...bureau().map(x=>[x[0],x[1],null])]:deptEntries(id);list.forEach(x=>entry(panel,x[0],x[1],x[2],desktop));if(id==="bureau"&&S.manager())[["Fournisseurs","page:suppliers"],["Articles","page:articles"],["Utilisateurs","page:users"],["Paramètres","page:settings"]].forEach(x=>entry(panel,x[0],x[1],null,desktop))}else if(id==="common"){entry(panel,"Idées & améliorations","page:suggestions",null,desktop);entry(panel,"Installation","page:installation",null,desktop)}panel.dataset.sf54="0.5.4"}
  function menus(){
    $("#sf52DrawerContent")?.querySelectorAll(".sf52-nav-group").forEach(g=>{const t=g.querySelector(".sf52-nav-group-toggle"),id=t?.dataset.group,l=t?.querySelector("span:nth-child(2)");if(id==="common"&&l)l.textContent="Pour tous et toutes";if(id)fill(g,id,false)});
    $("#sf53DesktopNav")?.querySelectorAll(".sf53-group").forEach(g=>{const id=g.dataset.group,l=g.querySelector(".sf53-group-toggle .sf53-label");if(id==="common"&&l)l.textContent="Pour tous et toutes";if(id)fill(g,id,true)});
  }
  function versions(){const v=[...document.querySelectorAll("#login .muted")].find(x=>x.textContent.includes("Version"));if(v)v.textContent="Version 0.5.4 — Organisation par département";document.querySelectorAll(".version-pill").forEach(x=>x.textContent="StopFlow 0.5.4")}
  function patch(){
    S.patchData();S.ensurePages();
    if(typeof page==="function"&&!window.sf54PagePatched){window.sf54PagePatched=true;const old=page;page=function(id){old(id);const titles={sf54Department:S.label(S.state.department),sf54Bureau:"Bureau",sf54CuisineSuggestions:"Suggestions du mois",sf54Lunchs:"Lunchs hebdomadaires",sf54Temperatures:"Températures",sf54Banners:"Messages d’équipe",sf54BureauAlerts:"Anomalies & températures"};if(titles[id])S.ui.pageTitle(titles[id]);if(id!=="history")S.state.history=null;if(id!=="checklists")S.state.checklists=null;setTimeout(()=>{S.render();menus()},0)}}
    if(typeof renderHistory==="function"&&!window.sf54HistoryPatched){window.sf54HistoryPatched=true;const old=renderHistory;renderHistory=function(){old();setTimeout(S.ui.filterHistory,0)}}
    if(typeof renderDashboard==="function"&&!window.sf54DashboardPatched){window.sf54DashboardPatched=true;const old=renderDashboard;renderDashboard=function(){old();S.render()}}
    if(typeof showApp==="function"&&!window.sf54ShowPatched){window.sf54ShowPatched=true;const old=showApp;showApp=function(){old();setTimeout(startApp,0);setTimeout(startApp,800)}}
    if(typeof applyRole==="function"&&!window.sf54RolePatched){window.sf54RolePatched=true;const old=applyRole;applyRole=function(){old();setTimeout(menus,0)}}
  }
  async function startApp(){const app=$("#app");if(!app||app.classList.contains("hidden"))return;await S.ensureSessionDepartment().catch(console.warn);await Promise.all([S.loadDepartments().catch(console.warn),S.loadFeatures().catch(console.warn)]);S.ensurePages();S.render();menus()}
  function init(){if(window.sf54Initialized)return;window.sf54Initialized=true;const link=document.createElement("link");link.rel="stylesheet";link.href="stopflow-054-departments.css?v=0540";link.dataset.stopflow054="0.5.4";document.head.appendChild(link);patch();versions();$("#sf52MenuButton")?.addEventListener("click",()=>setTimeout(menus,0));let n=0,t=setInterval(()=>{menus();if(++n>30)clearInterval(t)},300);startApp()}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
