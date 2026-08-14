/* StopFlow 0.7.3 — standard générique fournisseur + validation + page de fin. */
(function(){
  if(window.stopflow073InventoryStandard?.active)return;

  const VERSION='0.7.3';
  const MOBILE_QUERY='(max-width: 950px)';
  const MOVE_THRESHOLD=8;
  const DEPARTMENTS={
    salle:'Salle',
    cuisine:'Cuisine',
    nettoyage:'Entretien & hygiène',
    general:'Général'
  };
  const state={
    saving:false,
    gesture:null,
    pdfBlob:null,
    pdfUrl:null,
    pdfFileName:'',
    savedOrder:null,
    rows:[],
    extraActions:new Map(),
    supplierScopeInstalled:false,
    pendingSupplierDepartment:null
  };

  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches===true;
  const summaryPage=()=>document.getElementById('summary');
  const summaryVisible=()=>Boolean(summaryPage()&&!summaryPage().classList.contains('hidden'));

  function escapeHtml(value){
    return String(value??'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function safeFilePart(value){
    return String(value||'inventaire')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9_-]+/gi,'-')
      .replace(/^-+|-+$/g,'')
      .slice(0,70)||'inventaire';
  }

  function normalizeDepartment(value){
    const key=String(value||'').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(DEPARTMENTS,key)?key:'salle';
  }

  function catalogSuppliers(){
    try{
      if(typeof ensureLocalSuppliers==='function')return ensureLocalSuppliers();
    }catch{}
    try{
      if(typeof db!=='undefined'&&Array.isArray(db.suppliers))return db.suppliers;
    }catch{}
    return [];
  }

  function currentSupplier(){
    try{return String(current?.supplier||'').trim()}catch{return ''}
  }

  function currentArticles(){
    try{return typeof activeArticles==='function'?activeArticles():[]}catch{return []}
  }

  function orderQuantity(article){
    try{
      if(typeof calc==='function')return Math.max(0,Number(calc(article)||0));
      const present=Number(current?.stocks?.[article.id]??0);
      return Math.max(0,Number(article?.target||0)-present);
    }catch{return 0}
  }

  function fullRows(){
    return currentArticles().map(article=>({
      id:article.id,
      name:String(article.name||''),
      unit:String(article.unit||''),
      category:String(article.category||''),
      stock:Number(current?.stocks?.[article.id]??0),
      target:Number(article.target||0),
      order:orderQuantity(article)
    }));
  }

  function supplierRecord(name){
    try{
      if(typeof supplierByName==='function')return supplierByName(name);
    }catch{}
    const key=String(name||'').trim().toLowerCase();
    return catalogSuppliers().find(item=>String(item?.name||'').trim().toLowerCase()===key)||null;
  }

  function cloudMode(){
    try{return typeof isCloudMode==='function'&&isCloudMode()}catch{return false}
  }

  async function hydrateSupplierDepartments(){
    const suppliers=catalogSuppliers();
    if(!suppliers.length)return suppliers;

    if(!cloudMode()||typeof supabaseClient==='undefined'||!supabaseClient){
      suppliers.forEach(item=>{item.department=normalizeDepartment(item.department||'salle')});
      return suppliers;
    }

    const {data,error}=await supabaseClient.from('suppliers').select('id,department');
    if(error)throw error;
    const departments=new Map((data||[]).map(row=>[String(row.id||''),normalizeDepartment(row.department)]));
    suppliers.forEach(item=>{
      item.department=departments.get(String(item.id||''))||normalizeDepartment(item.department||'salle');
    });
    try{if(typeof save==='function')save()}catch{}
    return suppliers;
  }

  function enhanceSupplierDepartmentField(id){
    const modal=document.getElementById('modal');
    const box=document.getElementById('modalBox');
    const nameInput=box?.querySelector('#supplierName');
    const saveButton=box?.querySelector('#saveSupplier');
    if(!modal||!box||!nameInput||!saveButton||box.querySelector('#supplierDepartment'))return;

    let supplier=null;
    try{
      if(id&&typeof supplierById==='function')supplier=supplierById(id);
      if(!supplier&&id)supplier=catalogSuppliers().find(item=>String(item.id||item.code||'')===String(id))||null;
    }catch{}
    const selected=normalizeDepartment(supplier?.department||'salle');

    const field=document.createElement('div');
    field.className='field';
    field.style.marginTop='12px';
    field.innerHTML=`<label>Espace d’inventaire</label>
      <select id="supplierDepartment" class="input">
        ${Object.entries(DEPARTMENTS).map(([key,label])=>`<option value="${key}" ${key===selected?'selected':''}>${escapeHtml(label)}</option>`).join('')}
      </select>
      <small class="muted" style="display:block;margin-top:5px">Le fournisseur apparaîtra automatiquement dans l’inventaire de cet espace.</small>`;

    const description=box.querySelector('#supplierDescription')?.closest('.field')||box.querySelector('#supplierDescription');
    if(description)description.insertAdjacentElement('afterend',field);
    else nameInput.closest('.field')?.insertAdjacentElement('afterend',field);

    const captureDepartment=()=>{
      state.pendingSupplierDepartment=normalizeDepartment(box.querySelector('#supplierDepartment')?.value||selected);
    };
    saveButton.addEventListener('pointerdown',captureDepartment,true);
    saveButton.addEventListener('touchstart',captureDepartment,{capture:true,passive:true});
    saveButton.addEventListener('click',captureDepartment,true);
  }

  function installSupplierScopeStandard(){
    if(state.supplierScopeInstalled)return;
    if(typeof loadSharedCatalog!=='function'||typeof saveSharedSupplier!=='function'||typeof supplierModal!=='function')return;
    state.supplierScopeInstalled=true;

    const originalLoad=loadSharedCatalog;
    window.loadSharedCatalog=async function(...args){
      const result=await originalLoad.apply(this,args);
      try{await hydrateSupplierDepartments()}catch(error){console.warn('StopFlow 0.7.3 — départements fournisseurs',error)}
      return result;
    };

    const originalSaveSupplier=saveSharedSupplier;
    window.saveSharedSupplier=async function(supplier){
      const previous=supplierRecord(supplier?.name)||catalogSuppliers().find(item=>String(item?.id||'')===String(supplier?.id||''))||null;
      const department=normalizeDepartment(supplier?.department||state.pendingSupplierDepartment||previous?.department||'salle');
      state.pendingSupplierDepartment=null;

      const saved=await originalSaveSupplier({...supplier,department});
      if(saved){
        saved.department=department;
        const memory=catalogSuppliers().find(item=>String(item?.id||item?.code||'')===String(saved.id||saved.code||''));
        if(memory)memory.department=department;
      }

      if(cloudMode()&&saved?.id&&typeof supabaseClient!=='undefined'&&supabaseClient){
        const {error}=await supabaseClient.from('suppliers').update({department}).eq('id',saved.id);
        if(error)throw error;
      }
      try{if(typeof save==='function')save()}catch{}
      return saved;
    };

    const originalSupplierModal=supplierModal;
    window.supplierModal=function(id){
      const result=originalSupplierModal.apply(this,arguments);
      setTimeout(()=>enhanceSupplierDepartmentField(id),0);
      setTimeout(()=>enhanceSupplierDepartmentField(id),80);
      return result;
    };

    hydrateSupplierDepartments()
      .then(()=>window.stopflow073SalleInventoryFlow?.render?.())
      .catch(error=>console.warn('StopFlow 0.7.3 — initialisation périmètre fournisseurs',error));
  }

  function injectStyles(){
    if(document.getElementById('sf73InventoryStandardStyles'))return;
    const style=document.createElement('style');
    style.id='sf73InventoryStandardStyles';
    style.textContent=`
      #sf73InventoryComplete{max-width:100%;overflow-x:hidden;padding-bottom:110px}
      #sf73InventoryComplete .sf73-complete-shell{max-width:720px;margin:0 auto}
      #sf73InventoryComplete .sf73-complete-hero{margin:6px 0 12px;padding:22px 18px;border:1px solid #cfe8dc;border-radius:18px;background:#f2fbf6;text-align:center;box-shadow:0 6px 18px rgba(13,35,62,.05)}
      #sf73InventoryComplete .sf73-complete-icon{width:58px;height:58px;margin:0 auto 10px;border-radius:50%;display:grid;place-items:center;background:#dff5e9;color:#118354;font-size:31px;font-weight:900}
      #sf73InventoryComplete .sf73-complete-hero h2{margin:0 0 6px;font-size:23px;line-height:1.15}
      #sf73InventoryComplete .sf73-complete-hero p{margin:0;color:var(--muted);font-size:14px;line-height:1.45}
      #sf73InventoryComplete .sf73-complete-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px}
      #sf73InventoryComplete .sf73-complete-kpi{min-width:0;padding:11px 9px;border:1px solid var(--line);border-radius:12px;background:#fff;text-align:center}
      #sf73InventoryComplete .sf73-complete-kpi span{display:block;color:var(--muted);font-size:11px;margin-bottom:3px}
      #sf73InventoryComplete .sf73-complete-kpi strong{display:block;font-size:18px;overflow-wrap:anywhere}
      #sf73InventoryComplete .sf73-complete-card{padding:14px;border:1px solid var(--line);border-radius:14px;background:#fff;margin-bottom:10px}
      #sf73InventoryComplete .sf73-complete-card h3{margin:0 0 5px;font-size:16px}
      #sf73InventoryComplete .sf73-complete-card p{margin:0;color:var(--muted);font-size:13px;line-height:1.45}
      #sf73InventoryComplete .sf73-complete-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}
      #sf73InventoryComplete .sf73-complete-actions .btn{min-height:50px;white-space:normal;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      #sf73InventoryComplete .sf73-complete-actions .sf73-wide{grid-column:1/-1}
      #sf73InventoryComplete .sf73-complete-email{font-size:12px;color:var(--muted);margin-top:8px!important}
      @media(max-width:520px){
        #sf73InventoryComplete .sf73-complete-actions{grid-template-columns:1fr}
        #sf73InventoryComplete .sf73-complete-actions .sf73-wide{grid-column:auto}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureCompletionPage(){
    let pageNode=document.getElementById('sf73InventoryComplete');
    if(pageNode)return pageNode;
    const main=document.querySelector('#app main.main')||document.querySelector('#app main')||document.querySelector('main.main');
    if(!main)return null;
    pageNode=document.createElement('section');
    pageNode.id='sf73InventoryComplete';
    pageNode.className='page hidden';
    main.appendChild(pageNode);
    return pageNode;
  }

  function showOnly(pageNode){
    document.querySelectorAll('#app .page').forEach(node=>node.classList.add('hidden'));
    pageNode?.classList.remove('hidden');
    const pageTitle=document.getElementById('pageTitle');
    if(pageTitle)pageTitle.textContent='Inventaire terminé';
    document.querySelectorAll('[data-page]').forEach(button=>button.classList.remove('active'));
    const mobileTitle=document.getElementById('sf52MobileTitle');
    if(mobileTitle)mobileTitle.textContent='Inventaire terminé';
    window.stopflow070BackNavigation?.refresh?.();
    window.stopflow073MobileActions?.refresh?.();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function revokePdf(){
    if(state.pdfUrl){try{URL.revokeObjectURL(state.pdfUrl)}catch{}}
    state.pdfBlob=null;
    state.pdfUrl=null;
    state.pdfFileName='';
  }

  function safePdfText(value){
    return String(value??'')
      .replace(/œ/g,'oe').replace(/Œ/g,'OE')
      .replace(/[–—]/g,'-')
      .replace(/[’]/g,"'")
      .replace(/€/g,'EUR');
  }

  function pdfEscapeText(value){
    return safePdfText(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  }

  function binaryBytes(str){
    const out=new Uint8Array(str.length);
    for(let i=0;i<str.length;i++)out[i]=str.charCodeAt(i)&255;
    return out;
  }

  function buildValidationPdf(snapshot,rows){
    const PAGE_W=595, PAGE_H=842, LEFT=38, ROWS_PER_PAGE=25;
    const chunks=[];
    for(let i=0;i<rows.length;i+=ROWS_PER_PAGE)chunks.push(rows.slice(i,i+ROWS_PER_PAGE));
    if(!chunks.length)chunks.push([]);

    const streams=chunks.map((chunk,pageIndex)=>{
      let y=800;
      const ops=[];
      const text=(s,x,yy,size=9,bold=false)=>ops.push(`BT /F${bold?2:1} ${size} Tf ${x} ${yy} Td (${pdfEscapeText(s)}) Tj ET`);
      const line=(x1,y1,x2,y2)=>ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
      text('StopFlow - Inventaire valide',LEFT,y,17,true); y-=23;
      text(`Fournisseur : ${safePdfText(snapshot.supplier)}`,LEFT,y,10,true);
      text(`Bon : ${safePdfText(snapshot.number||'-')}`,380,y,9,true); y-=16;
      text(`Inventaire : ${new Date(snapshot.inventoryAt||Date.now()).toLocaleString('fr-BE')}`,LEFT,y,8);
      text(`Page ${pageIndex+1}/${chunks.length}`,470,y,8); y-=20;
      line(LEFT,y,555,y); y-=15;
      text('Article',LEFT,y,8,true); text('Stock',330,y,8,true); text('Cible',395,y,8,true); text('A commander',455,y,8,true);
      y-=8; line(LEFT,y,555,y); y-=14;
      chunk.forEach(row=>{
        const label=(safePdfText(row.name)+(row.unit?` (${safePdfText(row.unit)})`:'')).slice(0,54);
        text(label,LEFT,y,8); text(String(row.stock),345,y,9,true); text(String(row.target),410,y,9); text(String(row.order),485,y,9,true);
        y-=20; line(LEFT,y+6,555,y+6);
      });
      if(pageIndex===chunks.length-1){
        y-=10;
        const note=safePdfText(snapshot.note||'').slice(0,150);
        text(`Remarque : ${note||'-'}`,LEFT,Math.max(45,y),8);
      }
      return ops.join('\n');
    });

    const objects=['<< /Type /Catalog /Pages 2 0 R >>'];
    const pageRefs=[];
    let next=3;
    streams.forEach(()=>{pageRefs.push(next);next+=2});
    const fontRegular=next, fontBold=next+1;
    objects[1]=`<< /Type /Pages /Kids [${pageRefs.map(n=>`${n} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;
    streams.forEach((stream,index)=>{
      const pageObj=pageRefs[index], contentObj=pageObj+1;
      objects[pageObj-1]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentObj} 0 R >>`;
      objects[contentObj-1]=`<< /Length ${binaryBytes(stream).length} >>\nstream\n${stream}\nendstream`;
    });
    objects[fontRegular-1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[fontBold-1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    let pdf='%PDF-1.4\n%âãÏÓ\n';
    const offsets=[0];
    objects.forEach((obj,index)=>{offsets.push(binaryBytes(pdf).length);pdf+=`${index+1} 0 obj\n${obj}\nendobj\n`});
    const xref=binaryBytes(pdf).length;
    pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
    for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
    pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([binaryBytes(pdf)],{type:'application/pdf'});
  }

  function completionStats(rows){
    const orderRows=rows.filter(row=>row.order>0);
    return {articles:rows.length,orderLines:orderRows.length,orderQty:orderRows.reduce((sum,row)=>sum+Number(row.order||0),0)};
  }

  function completionExtraButtons(context){
    return [...state.extraActions.values()]
      .filter(action=>{try{return typeof action.visible==='function'?action.visible(context)!==false:action.visible!==false}catch{return false}})
      .map(action=>`<button type="button" class="btn ghost" data-sf73-extra-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`)
      .join('');
  }

  function bindTap(button,handler){
    if(!button||button.dataset.sf73TapBound==='1')return;
    button.dataset.sf73TapBound='1';
    let gesture=null,last=0;
    button.addEventListener('pointerdown',event=>{
      if(event.button!=null&&event.button!==0)return;
      gesture={id:event.pointerId,x:event.clientX,y:event.clientY,t:Date.now(),moved:false};
    },true);
    button.addEventListener('pointermove',event=>{
      if(!gesture||gesture.id!==event.pointerId)return;
      if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>MOVE_THRESHOLD)gesture.moved=true;
    },true);
    button.addEventListener('pointerup',event=>{
      if(!gesture||gesture.id!==event.pointerId)return;
      const tap=!gesture.moved&&Date.now()-gesture.t<1000;
      gesture=null;
      if(!tap)return;
      event.preventDefault();event.stopPropagation();
      const now=Date.now(); if(now-last<450)return; last=now;
      Promise.resolve(handler(event)).catch(error=>console.warn('StopFlow 0.7.3 — action fin inventaire',error));
    },true);
    button.addEventListener('click',event=>event.preventDefault());
  }

  function downloadPdf(){
    if(!state.pdfUrl||!state.pdfBlob)return;
    const link=document.createElement('a');
    link.href=state.pdfUrl;
    link.download=state.pdfFileName||'StopFlow-Inventaire.pdf';
    document.body.appendChild(link);link.click();link.remove();
  }

  async function sharePdf(){
    if(!state.pdfBlob||!state.savedOrder)return;
    const file=new File([state.pdfBlob],state.pdfFileName||'StopFlow-Inventaire.pdf',{type:'application/pdf'});
    const payload={title:`StopFlow — ${state.savedOrder.supplier}`,text:`Inventaire validé ${state.savedOrder.number||''} — ${state.savedOrder.supplier}`,files:[file]};
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
      try{await navigator.share(payload);return}catch(error){if(error?.name==='AbortError')return}
    }
    prepareEmail();
  }

  function prepareEmail(){
    const order=state.savedOrder;
    if(!order)return;
    const supplier=supplierRecord(order.supplier);
    const to=String(supplier?.email||'').trim();
    const stats=completionStats(state.rows);
    const subject=`Commande StopFlow — ${order.supplier} — ${order.number||''}`;
    const body=['Bonjour,','',`Veuillez trouver la commande issue de l’inventaire StopFlow ${order.number||''}.`,`Fournisseur : ${order.supplier}`,`Références à commander : ${stats.orderLines}`,`Quantité totale : ${stats.orderQty}`,'','Le PDF généré par StopFlow peut être joint à ce message.','','Cordialement'].join('\n');
    window.location.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function openHistory(){
    if(typeof page==='function')page('history');
    else window.stopflow070CardNavigation?.openZone?.('salle');
    if(state.savedOrder?.id&&typeof showDetail==='function')setTimeout(()=>showDetail(state.savedOrder.id),40);
  }

  function newInventoryFromCompletion(){
    revokePdf();
    state.savedOrder=null;state.rows=[];
    const zone=window.stopflow070CardNavigation?.runtime?.currentZone||'';
    if(zone==='salle'&&typeof window.stopflow073SalleInventoryFlow?.open==='function'){
      window.stopflow073SalleInventoryFlow.open();return;
    }
    if(zone&&zone!=='home'&&typeof window.stopflow070CardNavigation?.openZone==='function'){
      window.stopflow070CardNavigation.openZone(zone);return;
    }
    if(typeof page==='function')page('dashboard');
  }

  function bindCompletionActions(pageNode,context){
    bindTap(pageNode.querySelector('#sf73DonePdf'),downloadPdf);
    bindTap(pageNode.querySelector('#sf73DoneShare'),sharePdf);
    bindTap(pageNode.querySelector('#sf73DoneEmail'),prepareEmail);
    bindTap(pageNode.querySelector('#sf73DoneHistory'),openHistory);
    bindTap(pageNode.querySelector('#sf73DoneNew'),newInventoryFromCompletion);
    pageNode.querySelectorAll('[data-sf73-extra-action]').forEach(button=>{
      const action=state.extraActions.get(button.dataset.sf73ExtraAction);
      if(action)bindTap(button,()=>action.handler?.(context));
    });
  }

  function renderCompletion(saved,{pending=false,pdfBlob=null,rows=[]}={}){
    injectStyles();
    const pageNode=ensureCompletionPage();
    if(!pageNode)return;

    revokePdf();
    state.savedOrder=saved;state.rows=rows;
    if(pdfBlob){
      state.pdfBlob=pdfBlob;
      state.pdfUrl=URL.createObjectURL(pdfBlob);
      state.pdfFileName=`StopFlow-Inventaire-${safeFilePart(saved.supplier)}-${safeFilePart(saved.number||'valide')}.pdf`;
    }

    const stats=completionStats(rows);
    const supplier=supplierRecord(saved.supplier);
    const supplierEmail=String(supplier?.email||'').trim();
    const context={saved,pending,pdfBlob,state,stats,supplier};
    const extra=completionExtraButtons(context);

    pageNode.innerHTML=`
      <div class="sf73-complete-shell">
        <div class="sf73-complete-hero">
          <div class="sf73-complete-icon">✓</div>
          <h2>${pending?'Inventaire envoyé pour validation':'Inventaire bien enregistré'}</h2>
          <p>${pending
            ?`L’inventaire ${escapeHtml(saved.supplier)} est enregistré. Il apparaîtra dans l’historique avec le statut « À valider ».`
            :`L’inventaire ${escapeHtml(saved.supplier)} est validé et enregistré. Tu peux le retrouver à tout moment dans l’historique.`}</p>
        </div>
        <div class="sf73-complete-meta">
          <div class="sf73-complete-kpi"><span>Fournisseur</span><strong>${escapeHtml(saved.supplier)}</strong></div>
          <div class="sf73-complete-kpi"><span>${pending?'Statut':'N° document'}</span><strong>${escapeHtml(pending?'À valider':(saved.number||'—'))}</strong></div>
          <div class="sf73-complete-kpi"><span>Références à commander</span><strong>${stats.orderLines}</strong></div>
          <div class="sf73-complete-kpi"><span>Quantité totale</span><strong>${stats.orderQty}</strong></div>
        </div>
        <div class="sf73-complete-card">
          <h3>${pending?'Prochaine étape':'Que veux-tu faire maintenant ?'}</h3>
          <p>${pending
            ?'Un responsable pourra contrôler puis valider cet inventaire. Le PDF final sera généré à la validation.'
            :'Le PDF contient l’inventaire complet : stock présent, stock cible et quantité à commander.'}</p>
          <div class="sf73-complete-actions">
            ${pending?'':`<button type="button" class="btn primary" id="sf73DonePdf">Télécharger le PDF</button>
            <button type="button" class="btn secondary" id="sf73DoneShare">Envoyer / partager le PDF</button>
            <button type="button" class="btn ghost" id="sf73DoneEmail">Préparer un e-mail</button>`}
            <button type="button" class="btn ghost" id="sf73DoneHistory">Voir dans l’historique</button>
            <button type="button" class="btn ghost sf73-wide" id="sf73DoneNew">Faire un autre inventaire</button>
            ${extra}
          </div>
          ${!pending?`<p class="sf73-complete-email">${supplierEmail
            ?`E-mail fournisseur enregistré : ${escapeHtml(supplierEmail)}. « Envoyer / partager » permet notamment de choisir Mail sur iPhone avec le PDF.`
            :'Aucun e-mail fournisseur n’est encore enregistré. « Préparer un e-mail » ouvrira un message sans destinataire ; « Envoyer / partager » peut partager directement le PDF.'}</p>`:''}
        </div>
      </div>`;

    showOnly(pageNode);
    bindCompletionActions(pageNode,context);
  }

  async function finalizeValidation(){
    if(state.saving)return;
    const button=document.getElementById('sf73ValidationConfirm');
    const original=button?.textContent||'Valider';
    state.saving=true;
    if(button){button.disabled=true;button.textContent='Enregistrement…'}

    try{
      const note=document.getElementById('sf73ValidationNote')?.value||'';
      current.note=note;
      current.adjustments={};
      const legacyNote=document.getElementById('generalNote');
      if(legacyNote)legacyNote.value=note;

      const rows=fullRows();
      const responsible=typeof canValidateOrders==='function'&&canValidateOrders();
      if(!responsible){
        if(typeof canSubmitOrders==='function'&&!canSubmitOrders())throw new Error('Action non autorisée.');
        if(typeof orderSnapshot!=='function'||typeof upsertOrder!=='function')throw new Error('Enregistrement indisponible.');
        const pending=orderSnapshot('À valider');
        const saved=await upsertOrder(pending)||pending;
        renderCompletion(saved,{pending:true,rows});
        return;
      }

      if(typeof orderSnapshot!=='function'||typeof upsertOrder!=='function')throw new Error('Validation indisponible.');
      const snapshot=orderSnapshot('Validé');
      const saved=await upsertOrder(snapshot)||snapshot;
      const pdfBlob=buildValidationPdf(saved,rows);
      renderCompletion(saved,{pending:false,pdfBlob,rows});
    }catch(error){
      console.warn('StopFlow 0.7.3 — validation générique inventaire',error);
      const message=typeof cloudErrorMessage==='function'?cloudErrorMessage(error,'Validation impossible.'):(error?.message||'Validation impossible.');
      alert(message);
    }finally{
      state.saving=false;
      if(button&&button.isConnected){button.disabled=false;button.textContent=original}
    }
  }

  function validationButton(target){
    const button=target?.closest?.('#sf73ValidationConfirm')||null;
    if(!button||!isMobile()||!summaryVisible())return null;
    return summaryPage()?.contains(button)?button:null;
  }

  function installValidationOwner(){
    document.addEventListener('pointerdown',event=>{
      const button=validationButton(event.target);
      if(!button||(event.button!=null&&event.button!==0))return;
      state.gesture={button,id:event.pointerId,x:event.clientX,y:event.clientY,scrollY:window.scrollY,moved:false,startedAt:Date.now()};
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    },true);
    document.addEventListener('pointermove',event=>{
      const gesture=state.gesture;
      if(!gesture||gesture.id!==event.pointerId)return;
      if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>MOVE_THRESHOLD||Math.abs(window.scrollY-gesture.scrollY)>1)gesture.moved=true;
    },true);
    document.addEventListener('pointerup',event=>{
      const gesture=state.gesture;
      const button=validationButton(event.target);
      if(!gesture||gesture.id!==event.pointerId||!button)return;
      state.gesture=null;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      if(!gesture.moved&&button===gesture.button&&Date.now()-gesture.startedAt<1000)finalizeValidation();
    },true);
    document.addEventListener('pointercancel',event=>{if(state.gesture?.id===event.pointerId)state.gesture=null},true);
    document.addEventListener('click',event=>{
      const button=validationButton(event.target);
      if(!button)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    },true);
    if(!window.PointerEvent){
      document.addEventListener('touchend',event=>{
        const button=validationButton(event.target);
        if(!button)return;
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();finalizeValidation();
      },{capture:true,passive:false});
    }
  }

  function registerCompletionAction(action){
    if(!action?.id||!action?.label||typeof action.handler!=='function')return false;
    state.extraActions.set(String(action.id),{id:String(action.id),label:String(action.label),handler:action.handler,visible:action.visible});
    return true;
  }

  injectStyles();
  installValidationOwner();
  installSupplierScopeStandard();
  [100,400,1000,2200].forEach(delay=>setTimeout(installSupplierScopeStandard,delay));

  window.stopflow073InventoryStandard={
    active:true,
    version:VERSION,
    generic:true,
    supplierAgnostic:true,
    departments:{...DEPARTMENTS},
    finalize:finalizeValidation,
    renderCompletion,
    registerCompletionAction,
    refreshSupplierScopes:hydrateSupplierDepartments,
    getContext:()=>({supplier:currentSupplier(),articles:currentArticles(),rows:fullRows()})
  };
})();