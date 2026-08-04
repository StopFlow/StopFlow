/* StopFlow 0.5.3 — lisibilité mobile, menus texte et commandes compactes. */
(function(){
  const MOBILE_QUERY="(max-width:950px)";
  const state={started:false,scheduled:false};
  const mobileMedia=window.matchMedia?.(MOBILE_QUERY);
  const isMobile=()=>mobileMedia?.matches??window.innerWidth<=950;

  function loadCss(){
    if(document.querySelector('link[data-stopflow-053-readability-orders="0.5.3"]'))return;
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="stopflow-053-readability-orders.css?v=0531";
    link.dataset.stopflow053ReadabilityOrders="0.5.3";
    document.head.appendChild(link);
  }

  function decorateMenuIcons(){
    document.querySelectorAll(
      ".sf52-nav-home>span:first-child,.sf52-nav-group-toggle>span:first-child,.sf52-nav-item>span:first-child,.sf53-icon"
    ).forEach(icon=>icon.setAttribute("aria-hidden","true"));
  }

  function decorateOrderRows(){
    const body=document.getElementById("historyRows");
    if(!body)return;
    const mobile=isMobile();

    body.querySelectorAll("tr").forEach(row=>{
      const detail=row.querySelector("[data-detail]");
      if(!detail)return;

      if(!detail.dataset.sf53OriginalLabel){
        detail.dataset.sf53OriginalLabel=detail.textContent.trim()||"Détail";
      }

      row.classList.toggle("sf53-order-mobile-row",mobile);
      if(!mobile){
        row.removeAttribute("role");
        row.removeAttribute("tabindex");
        row.removeAttribute("aria-label");
        detail.classList.remove("sf53-order-arrow");
        detail.textContent=detail.dataset.sf53OriginalLabel;
        detail.removeAttribute("aria-label");
        return;
      }

      const number=row.cells?.[0]?.textContent.trim()||"—";
      const date=row.cells?.[2]?.textContent.trim()||"Date inconnue";
      const status=row.cells?.[3]?.textContent.trim()||"";
      const label=number==="—"?`Brouillon du ${date}`:`Commande ${number} du ${date}`;

      row.setAttribute("role","button");
      row.setAttribute("tabindex","0");
      row.setAttribute("aria-label",[label,status,"ouvrir le détail"].filter(Boolean).join(", "));
      detail.classList.add("sf53-order-arrow");
      detail.textContent="›";
      detail.setAttribute("aria-label",`Ouvrir le détail de ${label}`);
      detail.title="Ouvrir le détail";

      if(row.dataset.sf53OrderHandler!=="1"){
        row.dataset.sf53OrderHandler="1";
        row.addEventListener("click",event=>{
          if(!isMobile()||event.target.closest("button,a,input,select,textarea,label"))return;
          row.querySelector("[data-detail]")?.click();
        });
        row.addEventListener("keydown",event=>{
          if(!isMobile()||!["Enter"," "].includes(event.key))return;
          event.preventDefault();
          row.querySelector("[data-detail]")?.click();
        });
      }
    });
  }

  function apply(){
    decorateMenuIcons();
    decorateOrderRows();
  }

  function schedule(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{
      state.scheduled=false;
      apply();
    });
  }

  function patchHistory(){
    if(typeof window.renderHistory!=="function"||window.stopflow053HistoryReadabilityPatched)return;
    window.stopflow053HistoryReadabilityPatched=true;
    const previous=window.renderHistory;
    window.renderHistory=function(){
      const result=previous.apply(this,arguments);
      setTimeout(decorateOrderRows,0);
      return result;
    };
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
    patchHistory();
    observe();
    apply();
    mobileMedia?.addEventListener?.("change",schedule);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
