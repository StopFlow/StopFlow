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
    link.href="stopflow-053-readability-orders.css?v=0532";
    link.dataset.stopflow053ReadabilityOrders="0.5.3";
    document.head.appendChild(link);
  }

  function decorateMenuIcons(){
    document.querySelectorAll(
      ".sf52-nav-home>span:first-child,.sf52-nav-group-toggle>span:first-child,.sf52-nav-item>span:first-child,.sf53-icon"
    ).forEach(icon=>icon.setAttribute("aria-hidden","true"));
  }

  function formatDateOnly(value){
    if(!value)return "Date inconnue";
    try{return new Intl.DateTimeFormat("fr-BE",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(value))}
    catch{return "Date inconnue"}
  }

  function decorateOrderRows(){
    const body=document.getElementById("historyRows");
    if(!body)return;
    const mobile=isMobile();

    body.querySelectorAll("tr").forEach(row=>{
      const detail=row.querySelector("[data-detail]");
      if(!detail)return;

      const dateCell=row.cells?.[2];
      if(!detail.dataset.sf53OriginalLabel){
        detail.dataset.sf53OriginalLabel=detail.textContent.trim()||"Détail";
      }
      if(dateCell&&!dateCell.dataset.sf53OriginalDate){
        dateCell.dataset.sf53OriginalDate=dateCell.textContent.trim();
      }

      row.classList.toggle("sf53-order-mobile-row",mobile);
      if(!mobile){
        row.removeAttribute("role");
        row.removeAttribute("tabindex");
        row.removeAttribute("aria-label");
        detail.classList.remove("sf53-order-arrow");
        detail.textContent=detail.dataset.sf53OriginalLabel;
        detail.removeAttribute("aria-label");
        if(dateCell?.dataset.sf53OriginalDate)dateCell.textContent=dateCell.dataset.sf53OriginalDate;
        return;
      }

      const number=row.cells?.[0]?.textContent.trim()||"—";
      const orderId=detail.dataset.detail;
      const order=typeof db!=="undefined"&&Array.isArray(db?.orders)?db.orders.find(entry=>String(entry.id)===String(orderId)):null;
      const date=order?.inventoryAt?formatDateOnly(order.inventoryAt):(dateCell?.dataset.sf53OriginalDate||"Date inconnue");
      if(dateCell)dateCell.textContent=date;
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

  function apply(){decorateMenuIcons();decorateOrderRows()}
  function schedule(){if(state.scheduled)return;state.scheduled=true;requestAnimationFrame(()=>{state.scheduled=false;apply()})}
  function patchHistory(){
    if(typeof window.renderHistory!=="function"||window.stopflow053HistoryReadabilityPatched)return;
    window.stopflow053HistoryReadabilityPatched=true;
    const previous=window.renderHistory;
    window.renderHistory=function(){const result=previous.apply(this,arguments);setTimeout(decorateOrderRows,0);return result};
  }
  function observe(){const observer=new MutationObserver(mutations=>{if(mutations.some(mutation=>mutation.type==="childList"||mutation.type==="attributes"))schedule()});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]})}
  function start(){if(state.started)return;state.started=true;loadCss();patchHistory();observe();apply();mobileMedia?.addEventListener?.("change",schedule)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();

/* Charge StopFlow 0.5.4 uniquement sur la branche qui contient ses modules. */
(function(){
  if(document.querySelector('script[data-stopflow-054-data="0.5.4"]'))return;
  const data=document.createElement("script");
  data.src="stopflow-054-data.js?v=0540";
  data.async=false;
  data.dataset.stopflow054Data="0.5.4";
  data.onload=()=>{
    const ui=document.createElement("script");
    ui.src="stopflow-054-ui.js?v=0540";
    ui.async=false;
    ui.dataset.stopflow054Ui="0.5.4";
    ui.onload=()=>{
      const menu=document.createElement("script");
      menu.src="stopflow-054-menu.js?v=0540";
      menu.async=false;
      menu.dataset.stopflow054Menu="0.5.4";
      document.head.appendChild(menu);
    };
    document.head.appendChild(ui);
  };
  document.head.appendChild(data);
})();
