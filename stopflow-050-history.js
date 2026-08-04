/* StopFlow 0.5.0 — historique des checklists et suivi interactif des anomalies. */
(function(){
  const STATUS_LABELS={
    en_cours:"En cours",
    a_controler:"À contrôler",
    validee:"Validée",
    suivi_necessaire:"Suivi nécessaire"
  };
  const DEPARTMENT_LABELS={
    salle:"Salle",
    cuisine:"Cuisine",
    nettoyage:"Entretien & hygiène",
    bureau:"Bureau"
  };
  const state={runs:[],mode:"orders",installed:false,loading:false};

  const escapeHtml=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const managerAccess=()=>typeof isResponsible==="function"&&isResponsible();
  const cloudReady=()=>typeof isCloudMode==="function"&&isCloudMode()&&typeof supabaseClient!=="undefined"&&supabaseClient;
  const departmentLabel=value=>DEPARTMENT_LABELS[String(value||"").toLowerCase()]||"Non défini";
  const statusLabel=value=>STATUS_LABELS[value]||value||"—";

  function formatDate(value){
    if(!value)return "—";
    try{return new Intl.DateTimeFormat("fr-BE",{dateStyle:"short",timeStyle:"short"}).format(new Date(value))}catch{return "—"}
  }

  function durationLabel(start,end){
    if(!start||!end)return "En cours";
    const minutes=Math.max(0,Math.round((new Date(end)-new Date(start))/60000));
    if(minutes<60)return `${minutes} min`;
    const hours=Math.floor(minutes/60),remaining=minutes%60;
    return remaining?`${hours} h ${remaining} min`:`${hours} h`;
  }

  function badgeClass(status){
    return status==="validee"?"validated":status==="a_controler"?"pending":status==="suivi_necessaire"?"cancelled":"draft";
  }

  function injectStyles(){
    if(document.getElementById("stopflow050HistoryStyles"))return;
    const style=document.createElement("style");
    style.id="stopflow050HistoryStyles";
    style.textContent=`
      .history-mode-tabs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}
      .history-mode-tabs .btn.active{background:var(--blue);color:#fff;border-color:var(--blue)}
      .checklist-history-legend{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
      .checklist-history-legend>div{padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:#f8fafc;font-size:12px;line-height:1.4}
      .checklist-history-list{display:grid;gap:8px}
      .checklist-history-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px;border:1px solid var(--line);border-radius:11px;background:#fff}
      .checklist-history-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:7px;color:var(--muted);font-size:11px}
      .checklist-history-meta span{display:block}
      .checklist-anomaly-count{font-weight:800}.checklist-anomaly-count.open{color:var(--red)}.checklist-anomaly-count.resolved{color:var(--green)}
      .checklist-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}
      .checklist-detail-grid>div{padding:9px;border:1px solid var(--line);border-radius:9px;background:#f8fafc}
      .checklist-detail-grid small{display:block;color:var(--muted);margin-bottom:3px}
      .history-checklist-section{margin-top:10px;border:1px solid var(--line);border-radius:11px;overflow:hidden}
      .history-checklist-section h3{margin:0;padding:9px 11px;background:#f7f9fc;border-bottom:1px solid var(--line);font-size:13px}
      .history-checklist-item{padding:10px 11px;border-bottom:1px solid var(--line)}
      .history-checklist-item:last-child{border-bottom:0}
      .history-checklist-item-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .history-checklist-state{font-size:11px;font-weight:800;white-space:nowrap}
      .history-checklist-state.done{color:var(--green)}.history-checklist-state.missing{color:var(--red)}
      .history-anomaly-button{margin-top:7px}
      .history-anomaly-detail{margin-top:8px;padding:10px;border:1px solid #ffd1d1;border-radius:9px;background:#fff5f5}
      .history-anomaly-detail.resolved{border-color:#bde7d2;background:#eef8f3}
      .history-resolution{margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,.08)}
      .history-resolution textarea{margin-top:7px}
      .runner-anomaly-view{cursor:pointer!important;opacity:1!important}
      @media(max-width:720px){
        .checklist-history-legend,.checklist-detail-grid{grid-template-columns:1fr}
        .checklist-history-row{grid-template-columns:1fr}.checklist-history-row>.btn{width:100%}
        .checklist-history-meta{grid-template-columns:1fr 1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function installHistoryUI(){
    const history=document.getElementById("history");
    if(!history||document.getElementById("historyModeTabs"))return;

    const existing=[...history.childNodes];
    const tabs=document.createElement("div");
    tabs.id="historyModeTabs";
    tabs.className="history-mode-tabs";
    tabs.innerHTML=`
      <button class="btn ghost active" data-history-mode="orders" type="button">Inventaires & commandes</button>
      <button class="btn ghost" data-history-mode="checklists" type="button">Checklists</button>`;

    const orderPanel=document.createElement("div");
    orderPanel.id="orderHistoryPanel";
    existing.forEach(node=>orderPanel.appendChild(node));

    const checklistPanel=document.createElement("div");
    checklistPanel.id="checklistHistoryPanel";
    checklistPanel.className="hidden";
    checklistPanel.innerHTML=`
      <div class="card" style="margin-top:0">
        <div class="flex between wrap"><div><h2>Historique des checklists</h2><p class="muted">Retrouvez l’exécutant, les heures, le contrôle et le suivi des anomalies.</p></div><button class="btn ghost" id="refreshChecklistHistory" type="button">Actualiser</button></div>
        <div class="checklist-history-legend">
          <div><span class="badge validated">Validée</span><br>Checklist contrôlée : aucune action supplémentaire n’est attendue.</div>
          <div><span class="badge cancelled">Suivi nécessaire</span><br>Une ou plusieurs anomalies doivent encore être traitées et clôturées.</div>
        </div>
        <div class="filters" style="grid-template-columns:2fr 1fr 1fr">
          <div class="field"><label>Rechercher</label><input id="checklistHistorySearch" class="input" placeholder="Checklist, personne ou département…"></div>
          <div class="field"><label>Statut</label><select id="checklistHistoryStatus" class="input"><option value="">Tous</option><option value="en_cours">En cours</option><option value="a_controler">À contrôler</option><option value="validee">Validée</option><option value="suivi_necessaire">Suivi nécessaire</option></select></div>
          <div class="field"><label>Ordre</label><select id="checklistHistorySort" class="input"><option value="desc">Plus récent</option><option value="asc">Plus ancien</option></select></div>
        </div>
        <div id="checklistHistoryList" class="checklist-history-list"><div class="checklist-empty">Chargement…</div></div>
      </div>`;

    history.append(tabs,orderPanel,checklistPanel);
    tabs.querySelectorAll("[data-history-mode]").forEach(button=>button.addEventListener("click",()=>setHistoryMode(button.dataset.historyMode)));
    checklistPanel.querySelector("#refreshChecklistHistory").addEventListener("click",()=>loadChecklistHistory(true));
    ["checklistHistorySearch","checklistHistoryStatus","checklistHistorySort"].forEach(id=>{
      checklistPanel.querySelector("#"+id).addEventListener(id==="checklistHistorySearch"?"input":"change",renderChecklistHistory);
    });
  }

  function setHistoryMode(mode){
    state.mode=mode==="checklists"?"checklists":"orders";
    document.querySelectorAll("[data-history-mode]").forEach(button=>button.classList.toggle("active",button.dataset.historyMode===state.mode));
    document.getElementById("orderHistoryPanel")?.classList.toggle("hidden",state.mode!=="orders");
    document.getElementById("checklistHistoryPanel")?.classList.toggle("hidden",state.mode!=="checklists");
    if(state.mode==="checklists")loadChecklistHistory(false);
  }

  async function loadChecklistHistory(force){
    if(!cloudReady()){
      const list=document.getElementById("checklistHistoryList");
      if(list)list.innerHTML='<div class="checklist-empty">L’historique des checklists nécessite la connexion Supabase.</div>';
      return;
    }
    if(state.loading)return;
    if(state.runs.length&&!force){renderChecklistHistory();return}
    state.loading=true;
    const list=document.getElementById("checklistHistoryList");
    if(list)list.innerHTML='<div class="checklist-empty">Chargement…</div>';
    try{
      const {data,error}=await supabaseClient
        .from("checklist_runs")
        .select("id,template_id,template_name,template_version,department,status,performed_by,performed_by_name,started_at,completed_at,validated_by,validated_by_name,validated_at,validator_note,checklist_run_items(id,item_order,section_label,label,required,checked,anomaly,note,anomaly_status,anomaly_reported_at,resolved_at,resolved_by_name,resolution_note)")
        .order("started_at",{ascending:false})
        .limit(200);
      if(error)throw error;
      state.runs=(data||[]).map(run=>({...run,items:(run.checklist_run_items||[]).sort((a,b)=>a.item_order-b.item_order)}));
      renderChecklistHistory();
    }catch(error){
      if(list)list.innerHTML=`<div class="checklist-empty">Impossible de charger l’historique : ${escapeHtml(error?.message||error)}</div>`;
    }finally{state.loading=false}
  }

  function filteredRuns(){
    const q=String(document.getElementById("checklistHistorySearch")?.value||"").trim().toLowerCase();
    const status=document.getElementById("checklistHistoryStatus")?.value||"";
    const sort=document.getElementById("checklistHistorySort")?.value||"desc";
    return [...state.runs]
      .filter(run=>(!status||run.status===status)&&(!q||JSON.stringify(run).toLowerCase().includes(q)))
      .sort((a,b)=>(new Date(b.started_at)-new Date(a.started_at))*(sort==="desc"?1:-1));
  }

  function anomalySummary(run){
    const anomalies=(run.items||[]).filter(item=>item.anomaly);
    const unresolved=anomalies.filter(item=>(item.anomaly_status||"a_traiter")!=="resolue");
    return {total:anomalies.length,unresolved:unresolved.length,resolved:anomalies.length-unresolved.length};
  }

  function renderChecklistHistory(){
    const list=document.getElementById("checklistHistoryList");
    if(!list)return;
    const runs=filteredRuns();
    if(!runs.length){list.innerHTML='<div class="checklist-empty">Aucune checklist ne correspond aux filtres.</div>';return}
    list.innerHTML=runs.map(run=>{
      const anomalies=anomalySummary(run);
      const anomalyText=!anomalies.total?"Aucune anomalie":anomalies.unresolved?`${anomalies.unresolved} à traiter / ${anomalies.total}`:`${anomalies.total} résolue(s)`;
      const anomalyClass=anomalies.unresolved?"open":anomalies.total?"resolved":"";
      return `<article class="checklist-history-row">
        <div>
          <div class="flex wrap"><b>${escapeHtml(run.template_name)}</b><span class="badge ${badgeClass(run.status)}">${escapeHtml(statusLabel(run.status))}</span><span class="checklist-pill department">${escapeHtml(departmentLabel(run.department))}</span></div>
          <div class="checklist-history-meta">
            <span><b>Effectuée par</b><br>${escapeHtml(run.performed_by_name||"—")}</span>
            <span><b>Début / fin</b><br>${escapeHtml(formatDate(run.started_at))}<br>${escapeHtml(formatDate(run.completed_at))}</span>
            <span><b>Durée</b><br>${escapeHtml(durationLabel(run.started_at,run.completed_at))}</span>
            <span><b>Contrôlée par</b><br>${escapeHtml(run.validated_by_name||"—")}</span>
            <span><b>Heure du contrôle</b><br>${escapeHtml(formatDate(run.validated_at))}</span>
            <span class="checklist-anomaly-count ${anomalyClass}"><b>Anomalies</b><br>${escapeHtml(anomalyText)}</span>
          </div>
        </div>
        <button class="btn ghost small" data-checklist-history-detail="${run.id}" type="button">Voir le détail</button>
      </article>`;
    }).join("");
    list.querySelectorAll("[data-checklist-history-detail]").forEach(button=>button.addEventListener("click",()=>showChecklistDetail(button.dataset.checklistHistoryDetail)));
  }

  function showChecklistDetail(runId){
    const run=state.runs.find(item=>item.id===runId);
    if(!run)return;
    const anomalies=anomalySummary(run);
    const groups=[];
    for(const item of run.items||[]){
      const section=item.section_label||"Tâches";
      let group=groups.find(entry=>entry.section===section);
      if(!group){group={section,items:[]};groups.push(group)}
      group.items.push(item);
    }

    document.getElementById("modalBox").innerHTML=`
      <div class="flex between wrap"><div><h2>${escapeHtml(run.template_name)}</h2><div class="flex wrap"><span class="badge ${badgeClass(run.status)}">${escapeHtml(statusLabel(run.status))}</span><span class="checklist-pill department">${escapeHtml(departmentLabel(run.department))}</span></div></div><button class="btn ghost" id="closeModal" type="button">Fermer</button></div>
      <div class="checklist-history-legend" style="margin-top:12px">
        <div><b>Validée</b><br>Aucun suivi ne reste à effectuer.</div>
        <div><b>Suivi nécessaire</b><br>Au moins une anomalie reste à résoudre.</div>
      </div>
      <div class="checklist-detail-grid">
        <div><small>Effectuée par</small><b>${escapeHtml(run.performed_by_name||"—")}</b></div>
        <div><small>Début</small><b>${escapeHtml(formatDate(run.started_at))}</b></div>
        <div><small>Fin</small><b>${escapeHtml(formatDate(run.completed_at))}</b></div>
        <div><small>Durée</small><b>${escapeHtml(durationLabel(run.started_at,run.completed_at))}</b></div>
        <div><small>Contrôlée par</small><b>${escapeHtml(run.validated_by_name||"—")}</b></div>
        <div><small>Heure du contrôle</small><b>${escapeHtml(formatDate(run.validated_at))}</b></div>
      </div>
      <div class="notice"><b>Résultat :</b> ${run.items.filter(item=>item.checked).length} tâche(s) cochée(s) sur ${run.items.length}. ${anomalies.total?`${anomalies.unresolved} anomalie(s) restent à traiter sur ${anomalies.total}.`:"Aucune anomalie signalée."}</div>
      ${run.validator_note?`<p><b>Note du contrôle :</b><br>${escapeHtml(run.validator_note).replace(/\n/g,"<br>")}</p>`:""}
      <div>${groups.map(group=>`<section class="history-checklist-section"><h3>${escapeHtml(group.section)}</h3>${group.items.map(item=>renderHistoryItem(item)).join("")}</section>`).join("")}</div>`;

    document.getElementById("modal").classList.remove("hidden");
    document.getElementById("closeModal").onclick=()=>document.getElementById("modal").classList.add("hidden");
    bindAnomalyButtons(run.id);
  }

  function renderHistoryItem(item){
    const anomalyStatus=item.anomaly_status||"a_traiter";
    return `<div class="history-checklist-item">
      <div class="history-checklist-item-head"><div>${escapeHtml(item.label)}${item.required?"":' <span class="checklist-pill optional">Conditionnelle</span>'}</div><span class="history-checklist-state ${item.checked?"done":"missing"}">${item.checked?"Cochée":"Non cochée"}</span></div>
      ${item.anomaly?`<button class="btn small ${anomalyStatus==="resolue"?"secondary":"danger"} history-anomaly-button" data-history-anomaly="${item.id}" type="button">${anomalyStatus==="resolue"?"Anomalie résolue — voir le détail":"Anomalie à traiter — voir le détail"}</button><div class="history-anomaly-detail ${anomalyStatus==="resolue"?"resolved":""} hidden" data-history-anomaly-detail="${item.id}">${anomalyDetailHtml(item)}</div>`:""}
    </div>`;
  }

  function anomalyDetailHtml(item){
    const resolved=item.anomaly_status==="resolue";
    return `<b>${resolved?"Anomalie résolue":"Anomalie signalée"}</b>
      <p><b>Remarque :</b><br>${escapeHtml(item.note||"Aucune remarque saisie.")}</p>
      <p class="muted"><b>Signalée le :</b> ${escapeHtml(formatDate(item.anomaly_reported_at))}</p>
      ${resolved?`<div class="history-resolution"><b>Action réalisée</b><p>${escapeHtml(item.resolution_note||"Aucune précision.")}</p><small class="muted">Résolue par ${escapeHtml(item.resolved_by_name||"—")} le ${escapeHtml(formatDate(item.resolved_at))}</small></div>`:managerAccess()?`<div class="history-resolution"><label><b>Action réalisée</b></label><textarea class="input" data-resolution-note="${item.id}" placeholder="Décrire ce qui a été fait pour résoudre l’anomalie"></textarea><button class="btn primary small" data-resolve-anomaly="${item.id}" type="button" style="margin-top:8px">Marquer comme résolue</button></div>`:'<div class="history-resolution muted">En attente du traitement par un Responsable ou un Administrateur.</div>'}`;
  }

  function bindAnomalyButtons(runId){
    document.querySelectorAll("[data-history-anomaly]").forEach(button=>button.addEventListener("click",()=>{
      const detail=document.querySelector(`[data-history-anomaly-detail="${button.dataset.historyAnomaly}"]`);
      detail?.classList.toggle("hidden");
    }));
    document.querySelectorAll("[data-resolve-anomaly]").forEach(button=>button.addEventListener("click",()=>resolveAnomaly(button.dataset.resolveAnomaly,runId)));
  }

  async function resolveAnomaly(itemId,runId){
    if(!managerAccess())return alert("Cette action est réservée aux Responsables et Administrateurs.");
    const note=String(document.querySelector(`[data-resolution-note="${itemId}"]`)?.value||"").trim();
    if(!note)return alert("Indiquez l’action réalisée avant de résoudre l’anomalie.");
    if(!confirm("Marquer cette anomalie comme résolue ?"))return;
    try{
      const {data,error}=await supabaseClient.rpc("resolve_checklist_anomaly",{p_item_id:itemId,p_resolution_note:note});
      if(error)throw error;
      const result=Array.isArray(data)?data[0]:data;
      await loadChecklistHistory(true);
      const updated=state.runs.find(run=>run.id===runId);
      if(updated){
        showChecklistDetail(runId);
        if(Number(result?.remaining_anomalies||0)===0)alert("Toutes les anomalies sont résolues. La checklist est maintenant validée.");
      }
    }catch(error){alert("Résolution impossible : "+(error?.message||error))}
  }

  async function openRunnerAnomaly(itemId){
    if(!cloudReady())return;
    try{
      const {data:item,error}=await supabaseClient.from("checklist_run_items").select("id,run_id,label,note,anomaly,anomaly_status,anomaly_reported_at,resolved_at,resolved_by_name,resolution_note").eq("id",itemId).single();
      if(error)throw error;
      const {data:run,error:runError}=await supabaseClient.from("checklist_runs").select("id,template_name,status").eq("id",item.run_id).single();
      if(runError)throw runError;
      document.getElementById("modalBox").innerHTML=`<div class="flex between"><div><h2>Détail de l’anomalie</h2><p class="muted">${escapeHtml(run.template_name)}</p></div><button class="btn ghost" id="closeModal" type="button">Fermer</button></div><div class="history-anomaly-detail ${item.anomaly_status==="resolue"?"resolved":""}" style="margin-top:12px">${anomalyDetailHtml(item)}</div>`;
      document.getElementById("modal").classList.remove("hidden");
      document.getElementById("closeModal").onclick=()=>document.getElementById("modal").classList.add("hidden");
      const resolve=document.querySelector("[data-resolve-anomaly]");
      if(resolve)resolve.onclick=async()=>{
        await resolveAnomaly(item.id,run.id);
        document.getElementById("modal").classList.add("hidden");
        if(typeof page==="function")page("checklists");
      };
    }catch(error){alert("Impossible d’ouvrir l’anomalie : "+(error?.message||error))}
  }

  function makeRunnerAnomaliesInteractive(){
    document.querySelectorAll('#checklistRunner [data-run-anomaly]').forEach(button=>{
      const isRecorded=button.textContent.toLowerCase().includes("anomalie signalée");
      if(!isRecorded||!button.disabled||button.dataset.historyViewer)return;
      button.disabled=false;
      button.dataset.historyViewer="true";
      button.classList.add("runner-anomaly-view");
      button.title="Voir le détail et le suivi de cette anomalie";
      button.addEventListener("click",event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        openRunnerAnomaly(button.dataset.runAnomaly);
      },true);
    });
  }

  function explainChecklistStatuses(){
    const runsCard=[...document.querySelectorAll("#checklistHome .card")].find(card=>card.querySelector("h2")?.textContent.trim()==="Exécutions récentes");
    if(!runsCard||runsCard.querySelector(".checklist-history-legend"))return;
    const legend=document.createElement("div");
    legend.className="checklist-history-legend";
    legend.innerHTML='<div><span class="badge validated">Validée</span><br>Aucun suivi ne reste à effectuer.</div><div><span class="badge cancelled">Suivi nécessaire</span><br>Une anomalie ou une action reste à clôturer.</div>';
    runsCard.querySelector("h2")?.insertAdjacentElement("afterend",legend);
  }

  function correctLunchSpelling(root=document.getElementById("app")){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const corrected=node.nodeValue.replace(/Lunches/g,"Lunchs").replace(/lunches/g,"lunchs");
      if(corrected!==node.nodeValue)node.nodeValue=corrected;
    });
  }

  function patchHistory(){
    if(window.stopflow050HistoryPatched||typeof renderHistory!=="function")return;
    window.stopflow050HistoryPatched=true;
    const previous=renderHistory;
    renderHistory=function(){
      previous();
      installHistoryUI();
      if(state.mode==="checklists")loadChecklistHistory(false);
    };
  }

  function initialize(){
    if(state.installed)return;
    if(typeof renderHistory!=="function"||!document.getElementById("app")){
      setTimeout(initialize,50);
      return;
    }
    state.installed=true;
    injectStyles();
    patchHistory();
    installHistoryUI();
    explainChecklistStatuses();
    makeRunnerAnomaliesInteractive();
    correctLunchSpelling();

    const observer=new MutationObserver(()=>{
      explainChecklistStatuses();
      makeRunnerAnomaliesInteractive();
      correctLunchSpelling();
    });
    observer.observe(document.getElementById("app"),{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);else initialize();
})();
