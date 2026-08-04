/* StopFlow 0.5.1 — installation sur téléphone, tablette et ordinateur. */
(function(){
  const state={deferredPrompt:null,installed:false,initialized:false};

  const isStandalone=()=>window.matchMedia?.("(display-mode: standalone)").matches||window.navigator.standalone===true;
  const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMacSafari=()=>/Macintosh/i.test(navigator.userAgent)&&/Safari/i.test(navigator.userAgent)&&!/Chrome|Chromium|Edg/i.test(navigator.userAgent);
  const isProtectedPreview=()=>location.hostname.includes("-git-")||location.hostname.includes("stopflow-")&&location.hostname!== "stopflow-app.vercel.app"||new URLSearchParams(location.search).has("_vercel_share");

  function ensureHead(){
    const head=document.head;
    let manifest=head.querySelector('link[rel="manifest"]');
    if(!manifest){
      manifest=document.createElement("link");
      manifest.rel="manifest";
      head.appendChild(manifest);
    }
    manifest.href="/manifest.webmanifest?v=0510";

    const appleMeta=[
      ["apple-mobile-web-app-capable","yes"],
      ["apple-mobile-web-app-status-bar-style","black-translucent"],
      ["apple-mobile-web-app-title","StopFlow"],
      ["mobile-web-app-capable","yes"]
    ];
    appleMeta.forEach(([name,content])=>{
      let meta=head.querySelector(`meta[name="${name}"]`);
      if(!meta){meta=document.createElement("meta");meta.name=name;head.appendChild(meta)}
      meta.content=content;
    });

    let appleIcon=head.querySelector('link[rel="apple-touch-icon"]');
    if(!appleIcon){appleIcon=document.createElement("link");appleIcon.rel="apple-touch-icon";head.appendChild(appleIcon)}
    appleIcon.href="/api/pwa-icon?size=180&v=0510";

    head.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach(link=>{
      link.href="/api/pwa-icon?size=192&v=0510";
      link.type="image/png";
    });
  }

  function injectStyles(){
    if(document.getElementById("stopflowPwaStyles"))return;
    const style=document.createElement("style");
    style.id="stopflowPwaStyles";
    style.textContent=`
      #login .login-card>p.muted::after{content:"Version 0.5.1 — Installation"!important}
      .version-pill::after{content:"StopFlow 0.5.1"!important}
      .stopflow-install-card{border:1px solid #cfe1ff;background:linear-gradient(135deg,#f8fbff,#edf4ff)}
      .stopflow-install-layout{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center}
      .stopflow-install-icon{width:58px;height:58px;border-radius:15px;background:#071d31;display:grid;place-items:center;box-shadow:0 8px 24px rgba(7,29,49,.18);overflow:hidden}
      .stopflow-install-icon img{width:100%;height:100%;display:block}
      .stopflow-install-help{margin-top:8px;padding:10px 12px;border-radius:9px;background:#fff;border:1px solid var(--line);font-size:12px;line-height:1.45}
      .stopflow-install-status{font-size:12px;color:var(--muted);margin-top:5px}
      .stopflow-preview-warning{margin-top:8px;color:#8d6200;font-size:12px;font-weight:700}
      @media(max-width:650px){
        .stopflow-install-layout{grid-template-columns:auto minmax(0,1fr)}
        .stopflow-install-actions{grid-column:1/-1;display:grid}
        .stopflow-install-actions .btn{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function installationInstructions(){
    if(isIOS()){
      return "Dans Safari : touchez le bouton Partager, puis « Sur l’écran d’accueil » et enfin « Ajouter ».";
    }
    if(isMacSafari()){
      return "Dans Safari sur Mac : ouvrez le menu Fichier, puis choisissez « Ajouter au Dock ».";
    }
    return "Dans Chrome ou Edge : utilisez le bouton Installer. Vous pouvez aussi ouvrir le menu du navigateur puis choisir « Installer StopFlow ».";
  }

  function createInstallCard(){
    const dashboard=document.getElementById("dashboard");
    if(!dashboard||document.getElementById("stopflowInstallCard"))return;
    const card=document.createElement("div");
    card.id="stopflowInstallCard";
    card.className="card stopflow-install-card";
    card.innerHTML=`
      <div class="stopflow-install-layout">
        <div class="stopflow-install-icon"><img src="/api/pwa-icon?size=192&v=0510" alt="Icône StopFlow"></div>
        <div>
          <h2 style="margin-bottom:4px">Installer StopFlow</h2>
          <p class="muted" style="margin:0">Ajoutez StopFlow comme une application avec son icône, en plein écran, sur votre téléphone, tablette ou ordinateur.</p>
          <div class="stopflow-install-status" id="stopflowInstallStatus"></div>
          <div class="stopflow-preview-warning hidden" id="stopflowPreviewWarning">Cette adresse est une version de test. L’installation permanente utilisera l’adresse publique StopFlow après publication.</div>
        </div>
        <div class="stopflow-install-actions"><button class="btn primary" id="stopflowInstallButton" type="button">Installer StopFlow</button></div>
      </div>
      <div class="stopflow-install-help hidden" id="stopflowInstallHelp"></div>`;
    const firstCard=dashboard.querySelector(".card");
    if(firstCard)firstCard.insertAdjacentElement("beforebegin",card);else dashboard.appendChild(card);
    document.getElementById("stopflowInstallButton").addEventListener("click",install);
    updateCard();
  }

  function updateCard(message=""){
    const card=document.getElementById("stopflowInstallCard");
    if(!card)return;
    const button=document.getElementById("stopflowInstallButton");
    const status=document.getElementById("stopflowInstallStatus");
    const help=document.getElementById("stopflowInstallHelp");
    const warning=document.getElementById("stopflowPreviewWarning");
    warning?.classList.toggle("hidden",!isProtectedPreview());

    if(isStandalone()||state.installed){
      if(button){button.textContent="StopFlow est installé";button.disabled=true}
      if(status)status.textContent=message||"L’application est ouverte en mode installé.";
      if(help)help.classList.add("hidden");
      return;
    }

    if(state.deferredPrompt){
      if(button){button.textContent="Installer StopFlow";button.disabled=false}
      if(status)status.textContent=message||"Installation disponible sur cet appareil.";
      if(help)help.classList.add("hidden");
    }else{
      if(button){button.textContent=isIOS()||isMacSafari()?"Voir les instructions":"Comment installer";button.disabled=false}
      if(status)status.textContent=message||"Le navigateur proposera l’installation dès que les conditions sont remplies.";
    }
  }

  async function install(){
    const help=document.getElementById("stopflowInstallHelp");
    if(state.deferredPrompt){
      const promptEvent=state.deferredPrompt;
      state.deferredPrompt=null;
      promptEvent.prompt();
      const choice=await promptEvent.userChoice;
      updateCard(choice?.outcome==="accepted"?"Installation acceptée.":"Installation annulée.");
      return;
    }
    if(help){
      help.textContent=installationInstructions();
      help.classList.remove("hidden");
    }
  }

  async function registerServiceWorker(){
    if(!("serviceWorker" in navigator))return;
    if(location.protocol!=="https:"&&location.hostname!=="localhost")return;
    try{
      const registration=await navigator.serviceWorker.register("/service-worker.js?v=0510",{scope:"/",updateViaCache:"none"});
      registration.update().catch(()=>{});
    }catch(error){
      console.warn("Installation StopFlow — service worker",error);
    }
  }

  function patchShowApp(){
    if(window.stopflowPwaShowAppPatched||typeof showApp!=="function")return;
    window.stopflowPwaShowAppPatched=true;
    const previous=showApp;
    showApp=function(){
      previous();
      setTimeout(()=>{createInstallCard();updateCard()},0);
    };
  }

  function initialize(){
    if(state.initialized)return;
    state.initialized=true;
    ensureHead();
    injectStyles();
    patchShowApp();
    registerServiceWorker();
    createInstallCard();

    window.addEventListener("beforeinstallprompt",event=>{
      event.preventDefault();
      state.deferredPrompt=event;
      updateCard();
    });

    window.addEventListener("appinstalled",()=>{
      state.installed=true;
      state.deferredPrompt=null;
      updateCard("Installation terminée.");
    });

    window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change",()=>updateCard());
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);else initialize();
})();
