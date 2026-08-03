/* StopFlow — Blocs D et E : suivi d'envoi, tableau de bord, journal, sauvegardes et préparation 1.0. */
(function(){
  const VERSION='0.9.0-test';
  let opsOrders=[];
  let activityEvents=[];
  const money=value=>new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR'}).format(Number(value||0));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const download=(name,content,type='application/json')=>{const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},1000)};
  const roleCanManage=()=>typeof canValidateOrders==='function'&&canValidateOrders();

  function totalForOrder(order){
    return (order.lines||[]).reduce((sum,line)=>sum+Number(line.quantity||0)*Number(line.purchasePrice??line.purchase_price??0),0);
  }
  function supplierFor(order){
    return (db.suppliers||[]).find(s=>String(s.name).toLowerCase()===String(order.supplier).toLowerCase())||{};
  }

  async function loadOpsData(){
    if(!window.supabaseClient||typeof isCloudMode!=='function'||!isCloudMode())return;
    const [ordersResult,eventsResult]=await Promise.all([
      supabaseClient.from('orders').select('id,supplier_email,estimated_total,sent_at,sent_by_name,delivered_at,delivery_note'),
      roleCanManage()?supabaseClient.from('activity_events').select('id,created_at,actor_name,event_type,entity_type,entity_id,label,details').order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null})
    ]);
    if(!ordersResult.error)opsOrders=ordersResult.data||[];
    if(!eventsResult.error)activityEvents=eventsResult.data||[];
    (db.orders||[]).forEach(order=>Object.assign(order,opsOrders.find(x=>x.id===order.id)||{}));
  }

  function alertItems(){
    const items=[];
    const now=Date.now();
    for(const order of db.orders||[]){
      const age=(now-new Date(order.updatedAt||order.inventoryAt||order.createdAt).getTime())/86400000;
      if(order.status==='Brouillon'&&age>2)items.push({level:'warning',text:`Brouillon ${order.supplier} sans activité depuis ${Math.floor(age)} jours`,id:order.id});
      if(order.status==='Validé'&&!order.sent_at)items.push({level:'urgent',text:`Commande ${order.supplier} validée mais pas encore envoyée`,id:order.id});
      if(order.status==='Commandé'&&!order.delivered_at&&age>7)items.push({level:'warning',text:`Livraison ${order.supplier} à confirmer`,id:order.id});
    }
    const noPrice=(db.articles||[]).filter(a=>a.active&&(a.purchasePrice===null||a.purchasePrice===undefined||a.purchasePrice==='')).length;
    if(noPrice)items.push({level:'info',text:`${noPrice} article(s) actif(s) sans prix d’achat`});
    return items.slice(0,8);
  }

  function injectDashboard(){
    const pageEl=document.querySelector('#dashboard'); if(!pageEl)return;
    let panel=document.querySelector('#opsDashboardPanel');
    if(!panel){panel=document.createElement('div');panel.id='opsDashboardPanel';panel.className='card';pageEl.appendChild(panel)}
    const orders=db.orders||[];
    const sent=orders.filter(o=>o.sent_at).length, delivered=orders.filter(o=>o.delivered_at).length;
    const monthStart=new Date();monthStart.setDate(1);monthStart.setHours(0,0,0,0);
    const monthTotal=orders.filter(o=>o.sent_at&&new Date(o.sent_at)>=monthStart).reduce((s,o)=>s+Number(o.estimated_total||totalForOrder(o)),0);
    const alerts=alertItems();
    panel.innerHTML=`<div class="flex between wrap"><div><h2>Suivi opérationnel</h2><p class="muted">Version ${VERSION} — commandes, alertes et activité.</p></div><button class="btn ghost" id="opsRefresh">Actualiser</button></div>
      <div class="kpis"><div class="kpi"><span class="muted">Envoyées</span><strong>${sent}</strong></div><div class="kpi"><span class="muted">Livrées</span><strong>${delivered}</strong></div><div class="kpi"><span class="muted">Total du mois</span><strong style="font-size:18px">${money(monthTotal)}</strong></div><div class="kpi"><span class="muted">Alertes</span><strong>${alerts.length}</strong></div></div>
      <h3>À traiter</h3><div>${alerts.length?alerts.map(a=>`<div class="notice" style="margin:8px 0;${a.level==='urgent'?'background:#fff0f0;border-color:#efbcbc;color:#9f2929':a.level==='warning'?'background:#fff8e8;border-color:#efd291;color:#79540a':''}"><div class="flex between wrap"><span>${esc(a.text)}</span>${a.id?`<button class="btn small ghost" data-ops-open="${esc(a.id)}">Ouvrir</button>`:''}</div></div>`).join(''):'<div class="notice">Aucune action urgente.</div>'}</div>
      ${roleCanManage()?`<div class="flex between wrap" style="margin-top:18px"><h3 style="margin:0">Dernières activités</h3><button class="btn small ghost" id="opsExportBackup">Sauvegarde complète</button></div><div id="opsActivityPreview">${activityEvents.slice(0,8).map(e=>`<div style="padding:9px 0;border-bottom:1px solid var(--line)"><b>${esc(e.label)}</b><br><small class="muted">${esc(e.actor_name||'Système')} · ${typeof fmt==='function'?fmt(e.created_at):esc(e.created_at)}</small></div>`).join('')||'<p class="muted">Aucune activité enregistrée.</p>'}</div>`:''}`;
    panel.querySelector('#opsRefresh').onclick=async()=>{await loadSharedOrders();await loadOpsData();injectDashboard()};
    panel.querySelectorAll('[data-ops-open]').forEach(b=>b.onclick=()=>showDetail(b.dataset.opsOpen));
    const backup=panel.querySelector('#opsExportBackup');if(backup)backup.onclick=exportCompleteBackup;
  }

  function orderMailBody(order){
    const lines=(order.lines||[]).map(l=>`- ${l.name} : ${l.quantity} ${l.unit||''}`.trim()).join('\n');
    return `Bonjour,\n\nVeuillez trouver la commande ${order.number||''} de la Brasserie L'Union :\n\n${lines}\n\nRemarque : ${order.note||'aucune'}\n\nBien à vous,\n${session.name||'L’Union'}`;
  }

  async function markSent(order,email,total){
    if(!isCloudMode())return alert('Le suivi d’envoi nécessite Supabase.');
    const {error}=await supabaseClient.rpc('mark_order_sent',{p_order_id:order.id,p_supplier_email:email||null,p_estimated_total:total||null});
    if(error)return alert(error.message||'Impossible de marquer la commande comme envoyée.');
    await loadSharedOrders();await loadOpsData();alert('Commande marquée comme envoyée.');showDetail(order.id);injectDashboard();
  }
  async function markDelivered(order){
    const note=prompt('Note de livraison facultative :','')??null;if(note===null)return;
    const {error}=await supabaseClient.rpc('mark_order_delivered',{p_order_id:order.id,p_note:note||null});
    if(error)return alert(error.message||'Impossible de confirmer la livraison.');
    await loadSharedOrders();await loadOpsData();alert('Livraison confirmée.');showDetail(order.id);injectDashboard();
  }

  function enhanceDetail(order){
    if(!roleCanManage()||!order)return;
    const box=document.querySelector('#modalBox');if(!box||box.querySelector('#opsOrderTracking'))return;
    const supplier=supplierFor(order),email=order.supplier_email||supplier.orderEmail||supplier.email||'';
    const total=Number(order.estimated_total||totalForOrder(order));
    const panel=document.createElement('div');panel.id='opsOrderTracking';panel.className='notice';panel.style.marginTop='16px';
    panel.innerHTML=`<h3 style="margin-top:0">Suivi de la commande</h3>
      <div class="filters" style="grid-template-columns:2fr 1fr"><div class="field"><label>E-mail fournisseur</label><input id="opsSupplierEmail" class="input" type="email" value="${esc(email)}" placeholder="Adresse du fournisseur"></div><div class="field"><label>Total estimé HTVA</label><input id="opsEstimatedTotal" class="input" type="number" min="0" step="0.01" value="${total?total.toFixed(2):''}"></div></div>
      <div class="muted" style="font-size:13px;margin-bottom:10px">${order.sent_at?`Envoyée le ${fmt(order.sent_at)} par ${esc(order.sent_by_name||'—')}`:'Pas encore envoyée'}${order.delivered_at?` · Livrée le ${fmt(order.delivered_at)}`:''}</div>
      <div class="flex wrap"><button class="btn secondary" id="opsPrepareEmail">Préparer l’e-mail</button>${!order.sent_at?'<button class="btn primary" id="opsMarkSent">Marquer envoyée</button>':''}${order.sent_at&&!order.delivered_at?'<button class="btn primary" id="opsMarkDelivered">Confirmer la livraison</button>':''}</div>
      <p class="muted" style="font-size:12px;margin-bottom:0">StopFlow prépare l’e-mail dans l’application de messagerie. Le PDF reste à joindre manuellement afin d’éviter tout envoi automatique accidentel.</p>`;
    box.appendChild(panel);
    panel.querySelector('#opsPrepareEmail').onclick=()=>{const to=panel.querySelector('#opsSupplierEmail').value.trim(),subject=encodeURIComponent(`Commande ${order.number||''} — L'Union`),body=encodeURIComponent(orderMailBody(order));location.href=`mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`};
    const sentBtn=panel.querySelector('#opsMarkSent');if(sentBtn)sentBtn.onclick=()=>markSent(order,panel.querySelector('#opsSupplierEmail').value.trim(),Number(panel.querySelector('#opsEstimatedTotal').value||0));
    const deliveredBtn=panel.querySelector('#opsMarkDelivered');if(deliveredBtn)deliveredBtn.onclick=()=>markDelivered(order);
  }

  async function exportCompleteBackup(){
    if(!isCloudMode())return download(`StopFlow_sauvegarde_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(db,null,2));
    const tables=['profiles','suppliers','articles','orders','order_lines','app_settings','user_admin_events','activity_events'];
    const backup={version:VERSION,exportedAt:new Date().toISOString(),tables:{}};
    for(const table of tables){const {data,error}=await supabaseClient.from(table).select('*');backup.tables[table]=error?{error:error.message}:data}
    download(`StopFlow_sauvegarde_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(backup,null,2));
    try{await supabaseClient.rpc('log_stopflow_event',{p_event_type:'backup_export',p_entity_type:'app',p_entity_id:VERSION,p_label:'Sauvegarde complète exportée',p_details:{tables}})}catch{}
  }

  function installSettingsTools(){
    const settings=document.querySelector('#settings');if(!settings||document.querySelector('#opsMaintenanceCard'))return;
    const card=document.createElement('div');card.id='opsMaintenanceCard';card.className='card';card.innerHTML=`<h2>Maintenance et sécurité</h2><p class="muted">Outils réservés à la préparation de StopFlow 1.0.</p><div class="flex wrap"><button class="btn primary" id="opsBackupSettings">Exporter une sauvegarde complète</button><button class="btn ghost" id="opsDiagnostics">Contrôle de cohérence</button></div><div id="opsDiagnosticResult" style="margin-top:14px"></div>`;settings.appendChild(card);
    card.querySelector('#opsBackupSettings').onclick=exportCompleteBackup;
    card.querySelector('#opsDiagnostics').onclick=()=>{const issues=[];if(!(db.articles||[]).length)issues.push('Aucun article.');if(!(db.suppliers||[]).length)issues.push('Aucun fournisseur.');const missingPrices=(db.articles||[]).filter(a=>a.active&&(a.purchasePrice==null)).length;if(missingPrices)issues.push(`${missingPrices} article(s) actif(s) sans prix.`);const orphans=(db.articles||[]).filter(a=>!(db.suppliers||[]).some(s=>String(s.name).toLowerCase()===String(a.supplier).toLowerCase())).length;if(orphans)issues.push(`${orphans} article(s) sans fournisseur reconnu.`);card.querySelector('#opsDiagnosticResult').innerHTML=issues.length?`<div class="notice" style="background:#fff8e8;border-color:#efd291;color:#79540a">${issues.map(esc).join('<br>')}</div>`:'<div class="notice" style="background:#e7f7ef;border-color:#bde7d2;color:#0f7048">Cohérence générale correcte.</div>'};
  }

  function patchApp(){
    if(window.__stopflowOpsPatched)return;window.__stopflowOpsPatched=true;
    const originalDashboard=window.renderDashboard;window.renderDashboard=function(){if(originalDashboard)originalDashboard();loadOpsData().then(injectDashboard).catch(()=>injectDashboard())};
    const originalDetail=window.showDetail;window.showDetail=function(id){if(originalDetail)originalDetail(id);setTimeout(()=>enhanceDetail((db.orders||[]).find(o=>o.id===id)),0)};
    const originalSettings=window.loadSettings;window.loadSettings=function(){if(originalSettings)originalSettings();installSettingsTools()};
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&isCloudMode())loadOpsData().then(()=>{injectDashboard();installSettingsTools()})});
    loadOpsData().then(()=>{injectDashboard();installSettingsTools()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patchApp);else patchApp();
})();