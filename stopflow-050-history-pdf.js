/* StopFlow 0.5.0 — actions résolues, aperçu imprimable et PDF des checklists. */
(function(){
  const DEPARTMENT_LABELS={
    salle:"Salle",
    cuisine:"Cuisine",
    nettoyage:"Entretien & hygiène",
    bureau:"Bureau"
  };
  const STATUS_LABELS={
    en_cours:"En cours",
    a_controler:"À contrôler",
    validee:"Validée",
    suivi_necessaire:"Suivi nécessaire"
  };
  let activeRunId=null;
  let rowEnhancementScheduled=false;
  let initialized=false;

  const escapeHtml=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
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

  function injectStyles(){
    if(document.getElementById("stopflow050HistoryPdfStyles"))return;
    const style=document.createElement("style");
    style.id="stopflow050HistoryPdfStyles";
    style.textContent=`
      .history-resolved-count{display:inline-flex;margin-top:6px;padding:4px 7px;border-radius:999px;background:#e6f7ef;color:#0f7f50;font-size:11px;font-weight:800}
      .checklist-detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      .resolved-actions-summary{margin:12px 0;padding:12px;border:1px solid #bde7d2;border-radius:11px;background:#eef8f3}
      .resolved-actions-summary h3{margin:0 0 8px;color:#0f7f50}
      .resolved-action-row{padding:9px 0;border-top:1px solid #cfe9db}
      .resolved-action-row:first-of-type{border-top:0;padding-top:0}
      .resolved-action-row p{margin:4px 0}
      .resolved-action-meta{font-size:11px;color:#477361}
      .checklist-pdf-status{width:100%;margin-top:4px}
    `;
    document.head.appendChild(style);
  }

  async function fetchRun(runId){
    if(!cloudReady())throw new Error("La connexion Supabase est nécessaire.");
    const {data,error}=await supabaseClient
      .from("checklist_runs")
      .select("id,template_name,template_version,department,status,performed_by_name,started_at,completed_at,validated_by_name,validated_at,validator_note,checklist_run_items(id,item_order,section_label,label,required,checked,anomaly,note,anomaly_status,anomaly_reported_at,resolved_at,resolved_by_name,resolution_note)")
      .eq("id",runId)
      .single();
    if(error)throw error;
    return {...data,items:(data.checklist_run_items||[]).sort((a,b)=>a.item_order-b.item_order)};
  }

  function resolvedActions(run){
    return (run.items||[]).filter(item=>item.anomaly&&item.anomaly_status==="resolue");
  }

  function resolvedActionsHtml(run){
    const actions=resolvedActions(run);
    if(!actions.length)return "";
    return `<section class="resolved-actions-summary" id="resolvedActionsSummary">
      <h3>Actions de suivi validées (${actions.length})</h3>
      ${actions.map(item=>`<div class="resolved-action-row">
        <b>${escapeHtml(item.label)}</b>
        <p><b>Anomalie signalée :</b> ${escapeHtml(item.note||"Aucune remarque.")}</p>
        <p><b>Action réalisée :</b> ${escapeHtml(item.resolution_note||"Aucune précision.")}</p>
        <div class="resolved-action-meta">Validée par ${escapeHtml(item.resolved_by_name||"—")} le ${escapeHtml(formatDate(item.resolved_at))}</div>
      </div>`).join("")}
    </section>`;
  }

  async function enhanceDetailModal(runId){
    const modalBox=document.getElementById("modalBox");
    if(!modalBox||modalBox.dataset.checklistPdfRun===runId)return;
    try{
      const run=await fetchRun(runId);
      if(!document.getElementById("modal")?.classList.contains("hidden")){
        modalBox.dataset.checklistPdfRun=runId;
        const header=modalBox.firstElementChild;
        const toolbar=document.createElement("div");
        toolbar.className="checklist-detail-actions";
        toolbar.innerHTML=`
          <button class="btn ghost" id="previewChecklistSummary" type="button">Aperçu imprimable</button>
          <button class="btn primary" id="downloadChecklistPdf" type="button">Télécharger le PDF</button>
          <div class="checklist-pdf-status" id="checklistPdfStatus"></div>`;
        header?.insertAdjacentElement("afterend",toolbar);

        const resultNotice=[...modalBox.querySelectorAll(".notice")].find(node=>node.textContent.includes("Résultat"));
        const resolved=document.createElement("div");
        resolved.innerHTML=resolvedActionsHtml(run);
        const summary=resolved.firstElementChild;
        if(summary){
          if(resultNotice)resultNotice.insertAdjacentElement("afterend",summary);
          else toolbar.insertAdjacentElement("afterend",summary);
        }

        modalBox.querySelectorAll(".history-checklist-state.done").forEach(node=>{
          if(node.textContent.trim()==="Cochée")node.textContent="Validée";
        });

        document.getElementById("previewChecklistSummary").onclick=()=>openPrintableSummary(run);
        document.getElementById("downloadChecklistPdf").onclick=()=>downloadChecklistPdf(run);
      }
    }catch(error){
      console.warn("StopFlow historique PDF",error);
    }
  }

  function scheduleEnhanceHistoryRows(){
    if(rowEnhancementScheduled)return;
    rowEnhancementScheduled=true;
    requestAnimationFrame(async()=>{
      rowEnhancementScheduled=false;
      await enhanceHistoryRows();
    });
  }

  async function enhanceHistoryRows(){
    if(!cloudReady())return;
    const buttons=[...document.querySelectorAll("#checklistHistoryList [data-checklist-history-detail]")];
    const ids=buttons.map(button=>button.dataset.checklistHistoryDetail).filter(Boolean);
    if(!ids.length)return;
    try{
      const {data,error}=await supabaseClient
        .from("checklist_run_items")
        .select("run_id,anomaly_status,resolution_note,resolved_by_name,resolved_at")
        .in("run_id",ids)
        .eq("anomaly",true)
        .eq("anomaly_status","resolue");
      if(error)throw error;
      const counts=new Map();
      (data||[]).forEach(item=>counts.set(item.run_id,(counts.get(item.run_id)||0)+1));
      buttons.forEach(button=>{
        const row=button.closest(".checklist-history-row");
        if(!row)return;
        const count=counts.get(button.dataset.checklistHistoryDetail)||0;
        let badge=row.querySelector(".history-resolved-count");
        if(count){
          if(!badge){
            badge=document.createElement("span");
            badge.className="history-resolved-count";
            row.querySelector(".checklist-history-meta")?.insertAdjacentElement("afterend",badge);
          }
          badge.textContent=`${count} action${count>1?"s":""} de suivi validée${count>1?"s":""}`;
        }else badge?.remove();
      });
    }catch(error){console.warn("StopFlow actions résolues",error)}
  }

  function printableHtml(run){
    const actions=resolvedActions(run);
    const checked=(run.items||[]).filter(item=>item.checked).length;
    const groups=[];
    for(const item of run.items||[]){
      const section=item.section_label||"Tâches";
      let group=groups.find(entry=>entry.section===section);
      if(!group){group={section,items:[]};groups.push(group)}
      group.items.push(item);
    }
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(run.template_name)} - StopFlow</title><style>
      @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0;font-size:11px;line-height:1.35}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 8px;border-bottom:1px solid #ccd5df;padding-bottom:4px}h3{font-size:12px;margin:14px 0 5px}.muted{color:#657184}.header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #174dcc;padding-bottom:10px}.status{font-weight:bold;color:${run.status==="validee"?"#0f7f50":"#9b2c2c"}}.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0}.meta div{border:1px solid #dbe3ec;border-radius:6px;padding:7px}.meta small{display:block;color:#657184}.summary{padding:9px;border-radius:6px;background:#edf5ff;border:1px solid #cfe1ff}.actions{padding:10px;border-radius:6px;background:#eef8f3;border:1px solid #bde7d2}.action{padding:7px 0;border-top:1px solid #cfe9db}.action:first-child{border-top:0}.task{display:flex;gap:7px;padding:5px 0;border-bottom:1px solid #edf0f4}.task-state{font-weight:bold;color:#0f7f50;white-space:nowrap}.task-state.missing{color:#bd3030}.anomaly{margin:4px 0 7px 20px;padding:7px;border-radius:5px;background:#fff5f5;border:1px solid #ffd1d1}.anomaly.resolved{background:#eef8f3;border-color:#bde7d2}.toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px 0;margin-bottom:12px}.toolbar button{padding:8px 12px;font-weight:bold}.footer{margin-top:20px;padding-top:8px;border-top:1px solid #ccd5df;color:#657184;font-size:9px}@media print{.toolbar{display:none}.avoid-break{break-inside:avoid}}
    </style></head><body><div class="toolbar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
      <div class="header"><div><h1>${escapeHtml(run.template_name)}</h1><div>${escapeHtml(departmentLabel(run.department))} - version ${escapeHtml(run.template_version||1)}</div></div><div class="status">${escapeHtml(statusLabel(run.status))}</div></div>
      <div class="meta">
        <div><small>Effectuée par</small><b>${escapeHtml(run.performed_by_name||"—")}</b></div>
        <div><small>Début</small><b>${escapeHtml(formatDate(run.started_at))}</b></div>
        <div><small>Fin</small><b>${escapeHtml(formatDate(run.completed_at))}</b></div>
        <div><small>Durée</small><b>${escapeHtml(durationLabel(run.started_at,run.completed_at))}</b></div>
        <div><small>Contrôlée par</small><b>${escapeHtml(run.validated_by_name||"—")}</b></div>
        <div><small>Heure du contrôle</small><b>${escapeHtml(formatDate(run.validated_at))}</b></div>
      </div>
      <div class="summary"><b>Résumé :</b> ${checked} tâche(s) validée(s) sur ${(run.items||[]).length}. ${actions.length} action(s) de suivi résolue(s).</div>
      ${run.validator_note?`<p><b>Note du contrôle :</b><br>${escapeHtml(run.validator_note).replace(/\n/g,"<br>")}</p>`:""}
      ${actions.length?`<h2>Actions de suivi validées</h2><div class="actions">${actions.map(item=>`<div class="action avoid-break"><b>${escapeHtml(item.label)}</b><br><b>Anomalie :</b> ${escapeHtml(item.note||"—")}<br><b>Action réalisée :</b> ${escapeHtml(item.resolution_note||"—")}<br><span class="muted">Validée par ${escapeHtml(item.resolved_by_name||"—")} le ${escapeHtml(formatDate(item.resolved_at))}</span></div>`).join("")}</div>`:""}
      <h2>Détail des tâches</h2>
      ${groups.map(group=>`<section><h3>${escapeHtml(group.section)}</h3>${group.items.map(item=>`<div class="task avoid-break"><span class="task-state ${item.checked?"":"missing"}">${item.checked?"VALIDÉE":"NON VALIDÉE"}</span><span>${escapeHtml(item.label)}</span></div>${item.anomaly?`<div class="anomaly ${item.anomaly_status==="resolue"?"resolved":""} avoid-break"><b>Anomalie :</b> ${escapeHtml(item.note||"—")}${item.anomaly_status==="resolue"?`<br><b>Action validée :</b> ${escapeHtml(item.resolution_note||"—")}<br><span class="muted">${escapeHtml(item.resolved_by_name||"—")} - ${escapeHtml(formatDate(item.resolved_at))}</span>`:"<br><b>Statut :</b> À traiter"}</div>`:""}`).join("")}</section>`).join("")}
      <div class="footer">Document StopFlow généré le ${escapeHtml(formatDate(new Date().toISOString()))}. Historique opérationnel de la Brasserie L'Union.</div>
    </body></html>`;
  }

  function openPrintableSummary(run){
    const win=window.open("","_blank");
    if(!win){
      setPdfStatus("Le navigateur a bloqué l’aperçu. Autorisez les fenêtres surgissantes.",true);
      return;
    }
    win.document.open();
    win.document.write(printableHtml(run));
    win.document.close();
    setPdfStatus("Aperçu ouvert. Utilisez « Imprimer / Enregistrer en PDF ».");
  }

  function setPdfStatus(message,error=false){
    const box=document.getElementById("checklistPdfStatus");
    if(!box)return;
    box.innerHTML=`<div class="${error?"notice":"pdf-ready"}">${escapeHtml(message)}</div>`;
  }

  function pdfSafe(value){
    return String(value??"")
      .replace(/œ/g,"oe").replace(/Œ/g,"OE")
      .replace(/[–—]/g,"-").replace(/’/g,"'")
      .replace(/€/g,"EUR").replace(/…/g,"...")
      .replace(/✓/g,"OK");
  }

  function pdfEscape(value){
    return pdfSafe(value).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
  }

  function latin1Bytes(value){
    const text=String(value);
    const bytes=new Uint8Array(text.length);
    for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i)&255;
    return bytes;
  }

  function wrapText(text,maxChars){
    const words=pdfSafe(text).replace(/\s+/g," ").trim().split(" ").filter(Boolean);
    if(!words.length)return [""];
    const lines=[];let line="";
    for(const word of words){
      if(word.length>maxChars){
        if(line){lines.push(line);line=""}
        for(let i=0;i<word.length;i+=maxChars)lines.push(word.slice(i,i+maxChars));
        continue;
      }
      const next=line?line+" "+word:word;
      if(next.length>maxChars){lines.push(line);line=word}else line=next;
    }
    if(line)lines.push(line);
    return lines;
  }

  function createChecklistPdfBlob(run){
    const W=595,H=842,left=42,right=553,top=800,bottom=48;
    const pages=[[]];let pageIndex=0,y=top;
    const current=()=>pages[pageIndex];
    const newPage=()=>{pages.push([]);pageIndex++;y=top};
    const ensure=height=>{if(y-height<bottom)newPage()};
    const textLine=(text,size=9,bold=false,x=left,color="0 0 0")=>{
      current().push(`${color} rg BT /F${bold?2:1} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(text)}) Tj ET`);
    };
    const addParagraph=(text,{size=9,bold=false,indent=0,leading=12,color="0 0 0",spaceAfter=3,maxChars=90}={})=>{
      const lines=wrapText(text,Math.max(24,maxChars-Math.round(indent/4)));
      ensure(lines.length*leading+spaceAfter);
      for(const line of lines){textLine(line,size,bold,left+indent,color);y-=leading}
      y-=spaceAfter;
    };
    const addRule=()=>{ensure(8);current().push(`0.75 G ${left} ${y} m ${right} ${y} l S`);y-=8};
    const addSection=(title)=>{ensure(24);y-=3;addParagraph(title,{size:12,bold:true,leading:15,spaceAfter:2,maxChars:70});addRule()};

    addParagraph("StopFlow - Résumé de checklist",{size:18,bold:true,leading:21,spaceAfter:2,maxChars:55});
    addParagraph(run.template_name,{size:14,bold:true,leading:17,spaceAfter:2,maxChars:65});
    addParagraph(`${departmentLabel(run.department)} - ${statusLabel(run.status)}`,{size:10,bold:true,color:run.status==="validee"?"0.06 0.50 0.31":"0.74 0.19 0.19",spaceAfter:6});
    addRule();
    addParagraph(`Effectuée par : ${run.performed_by_name||"—"}`,{bold:true});
    addParagraph(`Début : ${formatDate(run.started_at)} | Fin : ${formatDate(run.completed_at)} | Durée : ${durationLabel(run.started_at,run.completed_at)}`);
    addParagraph(`Contrôlée par : ${run.validated_by_name||"—"} | Contrôle : ${formatDate(run.validated_at)}`);
    const checked=(run.items||[]).filter(item=>item.checked).length;
    const actions=resolvedActions(run);
    addParagraph(`Résumé : ${checked} tâche(s) validée(s) sur ${(run.items||[]).length}. ${actions.length} action(s) de suivi résolue(s).`,{bold:true,spaceAfter:6});
    if(run.validator_note)addParagraph(`Note du contrôle : ${run.validator_note}`,{spaceAfter:6});

    if(actions.length){
      addSection("Actions de suivi validées");
      actions.forEach((item,index)=>{
        addParagraph(`${index+1}. ${item.label}`,{bold:true,indent:6,maxChars:82});
        addParagraph(`Anomalie : ${item.note||"—"}`,{indent:16,size:8,leading:10,maxChars:84});
        addParagraph(`Action réalisée : ${item.resolution_note||"—"}`,{indent:16,size:8,bold:true,leading:10,color:"0.06 0.50 0.31",maxChars:84});
        addParagraph(`Validée par ${item.resolved_by_name||"—"} le ${formatDate(item.resolved_at)}`,{indent:16,size:8,leading:10,spaceAfter:5,maxChars:84});
      });
    }

    addSection("Détail des tâches");
    let currentSection="";
    (run.items||[]).forEach(item=>{
      const section=item.section_label||"Tâches";
      if(section!==currentSection){currentSection=section;addParagraph(section,{size:10,bold:true,spaceAfter:3,maxChars:75})}
      addParagraph(`${item.checked?"[VALIDÉE]":"[NON VALIDÉE]"} ${item.label}`,{size:8,bold:item.checked,indent:6,leading:10,spaceAfter:2,color:item.checked?"0.06 0.50 0.31":"0.74 0.19 0.19",maxChars:88});
      if(item.anomaly){
        addParagraph(`Anomalie : ${item.note||"—"}`,{size:8,indent:18,leading:10,spaceAfter:2,maxChars:84});
        if(item.anomaly_status==="resolue"){
          addParagraph(`Action validée : ${item.resolution_note||"—"}`,{size:8,bold:true,indent:18,leading:10,color:"0.06 0.50 0.31",spaceAfter:2,maxChars:84});
          addParagraph(`${item.resolved_by_name||"—"} - ${formatDate(item.resolved_at)}`,{size:7,indent:18,leading:9,spaceAfter:4,maxChars:84});
        }else addParagraph("Statut : À traiter",{size:8,bold:true,indent:18,color:"0.74 0.19 0.19",spaceAfter:4});
      }
    });

    addRule();
    addParagraph(`Document StopFlow généré le ${formatDate(new Date().toISOString())}.`,{size:7,spaceAfter:0,maxChars:100});

    const pageCount=pages.length;
    pages.forEach((ops,index)=>{
      ops.push(`0.35 0.35 0.35 rg BT /F1 7 Tf 1 0 0 1 ${left} 25 Tm (StopFlow - ${pdfEscape(run.template_name)} - page ${index+1}/${pageCount}) Tj ET`);
    });

    const pageObjectIds=pages.map((_,index)=>3+index);
    const contentObjectIds=pages.map((_,index)=>3+pageCount+index);
    const regularFontId=3+pageCount*2;
    const boldFontId=regularFontId+1;
    const objects=[];
    objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
    objects[2]=`<< /Type /Pages /Kids [${pageObjectIds.map(id=>id+" 0 R").join(" ")}] /Count ${pageCount} >>`;
    pages.forEach((ops,index)=>{
      const pageId=pageObjectIds[index],contentId=contentObjectIds[index];
      objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
      const stream=ops.join("\n");
      objects[contentId]=`<< /Length ${latin1Bytes(stream).length} >>\nstream\n${stream}\nendstream`;
    });
    objects[regularFontId]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[boldFontId]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

    let pdf="%PDF-1.4\n%âãÏÓ\n";
    const offsets=[0];
    for(let id=1;id<objects.length;id++){
      offsets[id]=latin1Bytes(pdf).length;
      pdf+=`${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref=latin1Bytes(pdf).length;
    pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for(let id=1;id<objects.length;id++)pdf+=String(offsets[id]).padStart(10,"0")+" 00000 n \n";
    pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([latin1Bytes(pdf)],{type:"application/pdf"});
  }

  function checklistPdfFilename(run){
    const date=new Date(run.started_at||Date.now()).toISOString().slice(0,10);
    const name=pdfSafe(run.template_name).replace(/[^A-Za-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"");
    return `Checklist_${name||"StopFlow"}_${date}.pdf`;
  }

  function downloadChecklistPdf(run){
    try{
      const blob=createChecklistPdfBlob(run);
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download=checklistPdfFilename(run);
      link.style.display="none";
      document.body.appendChild(link);
      link.click();
      setTimeout(()=>{link.remove();URL.revokeObjectURL(url)},5000);
      setPdfStatus("Le PDF de la checklist a été généré et envoyé au téléchargement.");
    }catch(error){
      console.error("StopFlow PDF checklist",error);
      setPdfStatus("Impossible de générer le PDF : "+(error?.message||error),true);
    }
  }

  function patchHistoryRefresh(){
    if(window.stopflow050HistoryPdfPagePatched||typeof page!=="function")return;
    window.stopflow050HistoryPdfPagePatched=true;
    const previousPage=page;
    page=function(id){
      previousPage(id);
      if(id==="history")setTimeout(()=>document.getElementById("refreshChecklistHistory")?.click(),120);
    };
  }

  function initialize(){
    if(initialized)return;
    if(!document.getElementById("app")||typeof page!=="function"){
      setTimeout(initialize,50);
      return;
    }
    initialized=true;
    injectStyles();
    patchHistoryRefresh();

    document.addEventListener("click",event=>{
      const detailButton=event.target.closest?.("[data-checklist-history-detail]");
      if(detailButton){
        activeRunId=detailButton.dataset.checklistHistoryDetail;
        setTimeout(()=>enhanceDetailModal(activeRunId),40);
      }
      const checklistTab=event.target.closest?.('[data-history-mode="checklists"]');
      if(checklistTab)setTimeout(()=>{
        document.getElementById("refreshChecklistHistory")?.click();
        scheduleEnhanceHistoryRows();
      },80);
    },true);

    const historyList=document.getElementById("checklistHistoryList");
    if(historyList)new MutationObserver(scheduleEnhanceHistoryRows).observe(historyList,{childList:true,subtree:true});
    else{
      const appObserver=new MutationObserver(()=>{
        const list=document.getElementById("checklistHistoryList");
        if(list){
          appObserver.disconnect();
          new MutationObserver(scheduleEnhanceHistoryRows).observe(list,{childList:true,subtree:true});
          scheduleEnhanceHistoryRows();
        }
      });
      appObserver.observe(document.getElementById("app"),{childList:true,subtree:true});
    }
    scheduleEnhanceHistoryRows();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);else initialize();
})();
