/* StopFlow 0.5.1 — correction iPhone, installation et zone sûre. */
(function(){
  const DISMISSED_KEY="stopflow-install-card-dismissed-v0511";
  const PUBLIC_URL="https://stopflow-app.vercel.app/";
  const isStandalone=()=>window.matchMedia?.("(display-mode: standalone)").matches||window.navigator.standalone===true;
  const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid=()=>/android/i.test(navigator.userAgent);
  const isMacSafari=()=>/Macintosh/i.test(navigator.userAgent)&&/Safari/i.test(navigator.userAgent)&&!/Chrome|Chromium|Edg/i.test(navigator.userAgent);
  const isWindows=()=>/Windows/i.test(navigator.userAgent);

  function deviceLabel(){
    if(isIOS())return /ipad/i.test(navigator.userAgent)?"iPad":"iPhone";
    if(isAndroid())return "Android";
    if(isMacSafari())return "Mac avec Safari";
    if(isWindows())return "Windows";
    return "Cet appareil";
  }

  function instructions(){
    if(isIOS())return "Dans Safari : touchez Partager, puis « Sur l’écran d’accueil », activez « Ouvrir comme app web » si l’option apparaît, puis touchez « Ajouter ».";
    if(isMacSafari())return "Dans Safari sur Mac : ouvrez le menu Fichier, puis choisissez « Ajouter au Dock ».";
    if(isAndroid())return "Dans Chrome : ouvrez le menu ⋮, puis choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».";
    if(isWindows())return "Dans Chrome ou Edge : utilisez l’icône d’installation dans la barre d’adresse ou le menu du navigateur.";
    return "Ouvrez le menu du navigateur et choisissez l’option permettant d’installer StopFlow ou de l’ajouter à l’écran d’accueil.";
  }

  function injectStyles(){
    if(document.getElementById("stopflow051IphoneFixStyles"))return;
    const style=document.createElement("style");
    style.id="stopflow051IphoneFixStyles";
    style.textContent=`
      #login .login-card>p.muted{font-size:0!important}
      #login .login-card>p.muted::after{content:"Version 0.5.1 — Installation"!important;font-size:13px!important}
      .version-pill{font-size:0!important}
      .version-pill::after{content:"StopFlow 0.5.1"!important;font-size:11px!important}
      #stopflowInstallCard .stopflow-install-layout{grid-template-columns:auto minmax(0,1fr) auto!important}
      #stopflowInstallCard .stopflow-install-actions{display:flex!important;gap:8px!important;align-items:center!important}
      .stopflow-install-dismiss{white-space:nowrap}
      .stopflow-device-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}
      .stopflow-device-grid>div{padding:13px;border:1px solid var(--line);border-radius:11px;background:#f8fafc}
      .stopflow-install-link{word-break:break-all}
      @media screen and (max-width:950px){
        .sidebar{
          padding-top:calc(8px + env(safe-area-inset-top))!important;
          padding-right:10px!important;
          padding-bottom:8px!important;
          padding-left:10px!important;
        }
        .main{padding-bottom:calc(30px + env(safe-area-inset-bottom))!important}
        body.stopflow-standalone .sidebar{padding-top:calc(10px + env(safe-area-inset-top))!important}
      }
      @media(max-width:650px){
        #stopflowInstallCard .stopflow-install-layout{grid-template-columns:auto minmax(0,1fr)!important}
        #stopflowInstallCard .stopflow-install-actions{grid-column:1/-1!important;display:grid!important;grid-template-columns:1fr auto!important}
        .stopflow-device-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeVersion(){
    document.querySelectorAll(".version-pill").forEach(element=>{element.textContent=""});
  }

  function removeInstallCard(){
    document.getElementById("stopflowInstallCard")?.remove();
  }

  function enhanceInstallCard(){
    const card=document.getElementById("stopflowInstallCard");
    if(!card)return;
    if(isStandalone()||localStorage.getItem(DISMISSED_KEY)==="1"){
      removeInstallCard();
      return;
    }
    const actions=card.querySelector(".stopflow-install-actions");
    if(actions&&!actions.querySelector(".stopflow-install-dismiss")){
      const button=document.createElement("button");
      button.type="button";
      button.className="btn ghost stopflow-install-dismiss";
      button.textContent="Masquer";
      button.onclick=()=>{
        localStorage.setItem(DISMISSED_KEY,"1");
        removeInstallCard();
      };
      actions.appendChild(button);
    }
    const description=card.querySelector("h2 + p");
    if(description)description.textContent=`Instructions adaptées à ${deviceLabel()}.`;
  }

  function createInstallationPage(){
    if(document.getElementById("installation"))return;
    const main=document.querySelector("#app main.main");
    if(!main)return;
    const section=document.createElement("section");
    section.id="installation";
    section.className="page hidden";
    section.innerHTML=`
      <div class="card">
        <div class="flex between wrap">
          <div><h2>Installation & appareils</h2><p class="muted">Installer StopFlow, vérifier le statut et retrouver le lien permanent.</p></div>
          <button class="btn primary" id="installationHelpButton" type="button">Voir les instructions</button>
        </div>
        <div class="stopflow-device-grid">
          <div><b>Appareil détecté</b><div class="muted" id="installationDevice"></div></div>
          <div><b>Statut</b><div class="muted" id="installationStatus"></div></div>
        </div>
        <div class="notice" style="margin-top:14px"><b>Instructions pour cet appareil</b><div id="installationInstructions" style="margin-top:6px"></div></div>
        <div class="field" style="margin-top:14px"><label>Lien permanent à partager</label><div class="flex wrap"><code class="stopflow-install-link">${PUBLIC_URL}</code><button class="btn ghost" id="copyInstallationUrl" type="button">Copier le lien</button></div></div>
        <p class="muted" style="margin-top:14px">Les mises à jour normales se chargent automatiquement. Il n’est pas nécessaire de réinstaller l’application.</p>
      </div>`;
    main.appendChild(section);

    const nav=document.querySelector(".sidebar .nav");
    if(nav&&!nav.querySelector('[data-page="installation"]')){
      const button=document.createElement("button");
      button.type="button";
      button.dataset.page="installation";
      button.textContent="Installation";
      button.onclick=()=>page("installation");
      nav.appendChild(button);
    }

    document.getElementById("installationHelpButton")?.addEventListener("click",()=>alert(isStandalone()?"StopFlow est déjà ouvert depuis son icône sur cet appareil.":instructions()));
    document.getElementById("copyInstallationUrl")?.addEventListener("click",async event=>{
      try{await navigator.clipboard.writeText(PUBLIC_URL);event.currentTarget.textContent="Lien copié"}
      catch{alert(PUBLIC_URL)}
    });
    renderInstallationPage();
  }

  function renderInstallationPage(){
    const device=document.getElementById("installationDevice");
    const status=document.getElementById("installationStatus");
    const instruction=document.getElementById("installationInstructions");
    const button=document.getElementById("installationHelpButton");
    if(device)device.textContent=deviceLabel();
    if(status)status.textContent=isStandalone()?"Installée sur cet appareil":"Ouverte dans le navigateur";
    if(instruction)instruction.textContent=isStandalone()?"StopFlow est déjà ouvert depuis son icône. Aucune autre action n’est nécessaire.":instructions();
    if(button){button.textContent=isStandalone()?"StopFlow est installé":"Voir les instructions";button.disabled=isStandalone()}
  }

  function patchPage(){
    if(window.stopflow051PagePatched||typeof page!=="function")return;
    window.stopflow051PagePatched=true;
    const previous=page;
    page=function(id){
      previous(id);
      if(id==="installation"){
        const title=document.getElementById("pageTitle");
        if(title)title.textContent="Installation & appareils";
        renderInstallationPage();
      }
    };
  }

  function refresh(){
    document.body.classList.toggle("stopflow-standalone",isStandalone());
    normalizeVersion();
    createInstallationPage();
    renderInstallationPage();
    if(isStandalone())removeInstallCard();else enhanceInstallCard();
  }

  function initialize(){
    injectStyles();
    patchPage();
    refresh();
    const observer=new MutationObserver(()=>refresh());
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener("appinstalled",()=>setTimeout(refresh,0));
    window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change",()=>setTimeout(refresh,0));
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);else initialize();
})();
