/* StopFlow 0.7.3 — inventaire mobile terrain : comptage, résumé lecture seule et validation finale. */
(function(){
  if(window.stopflow073InventoryMobileUx?.active)return;

  const MOBILE_QUERY='(max-width: 950px)';
  const MOVE_THRESHOLD=7;
  const FLOW_SELECTOR='[data-minus],[data-plus],#setAllZero,#showSummary,#saveDraft,#sf73SummaryRedo,#sf73SummaryContinue,#sf73ValidationBack,#sf73ValidationConfirm';
  const state={
    observer:null,
    scheduled:false,
    gesture:null,
    suppressAction:null,
    suppressUntil:0,
    syntheticAction:null,
    mode:'summary',
    renderingSummary:false,
    validating:false
  };

  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches===true;
  const inventoryPage=()=>document.getElementById('inventory');
  const summaryPage=()=>document.getElementById('summary');
  const pageVisible=node=>Boolean(node&&!node.classList.contains('hidden'));
  const inventoryVisible=()=>pageVisible(inventoryPage());
  const summaryVisible=()=>pageVisible(summaryPage());
  const inventoryFlowVisible=()=>{
    if(inventoryVisible()||summaryVisible())return true;
    return pageVisible(document.getElementById('sf73SalleInventory'));
  };

  function htmlEscape(value){
    return String(value??'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function injectStyles(){
    if(document.getElementById('sf73InventoryMobileUxStyles'))return;
    const style=document.createElement('style');
    style.id='sf73InventoryMobileUxStyles';
    style.textContent=`
      @media(max-width:950px){
        /* Sur tout le parcours inventaire : flèche seule dans l'en-tête, jamais de titre tronqué. */
        body.sf73-inventory-flow-visible.sf73-mobile-back-active #sf52MobileHeader{grid-template-columns:42px!important}
        body.sf73-inventory-flow-visible.sf73-mobile-back-active #sf52MobileTitle{display:none!important}

        #inventory,#summary{max-width:100%!important;overflow-x:hidden!important}
        #inventory .tablewrap{overflow:visible!important;border:0!important;border-radius:0!important;background:transparent!important}
        #inventory table{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;border-collapse:separate!important}
        #inventory thead{display:none!important}
        #inventory tbody{display:grid!important;width:100%!important;gap:9px!important}

        #inventory #inventoryMeta{display:none!important}
        #inventory > .notice{display:none!important}
        #inventory .stepper,#summary > .stepper{margin:4px 0 12px!important;gap:6px!important}
        #inventory .step,#summary > .stepper .step{font-size:12px!important;white-space:nowrap}
        #inventory .step b,#summary > .stepper .step b{width:23px!important;height:23px!important}
        #inventory .line,#summary > .stepper .line{min-width:12px!important}
        #inventory #inventoryHeading{font-size:21px!important;margin:7px 0 3px!important}
        #inventory #articleSearch{font-size:16px!important;min-height:46px!important}
        #inventory #setAllZero,
        #inventory #showSummary,
        #inventory #saveDraft,
        #sf73SummaryRedo,
        #sf73SummaryContinue,
        #sf73ValidationBack,
        #sf73ValidationConfirm{
          touch-action:manipulation!important;
          -webkit-tap-highlight-color:transparent!important
        }
        #inventory #setAllZero{min-height:44px!important}

        #inventory #inventoryRows tr{
          display:grid!important;
          grid-template-columns:minmax(0,1fr)!important;
          grid-template-areas:'article' 'stock'!important;
          gap:0!important;
          width:100%!important;
          min-width:0!important;
          padding:12px 14px!important;
          border:1px solid var(--line)!important;
          border-radius:14px!important;
          background:#fff!important;
          box-shadow:0 4px 14px rgba(13,35,62,.05)!important;
        }
        #inventory #inventoryRows td{min-width:0!important;width:auto!important;padding:0!important;border:0!important;background:transparent!important;text-align:left!important}
        #inventory #inventoryRows td:nth-child(1){grid-area:article!important;display:block!important;padding-bottom:9px!important;margin-bottom:9px!important;border-bottom:1px solid #edf1f6!important;overflow-wrap:anywhere!important}
        #inventory #inventoryRows td:nth-child(1)::before{display:none!important;content:none!important}
        #inventory #inventoryRows td:nth-child(1) b{font-size:17px!important;line-height:1.2!important;color:var(--text)!important}
        #inventory #inventoryRows td:nth-child(1) small{display:block!important;margin-top:3px!important;font-size:12px!important}
        #inventory #inventoryRows td:nth-child(2),
        #inventory #inventoryRows td:nth-child(3),
        #inventory #inventoryRows td:nth-child(5){display:none!important}
        #inventory #inventoryRows td:nth-child(2)::before,
        #inventory #inventoryRows td:nth-child(3)::before,
        #inventory #inventoryRows td:nth-child(5)::before{display:none!important;content:none!important}
        #inventory #inventoryRows td:nth-child(4){grid-area:stock!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important}
        #inventory #inventoryRows td:nth-child(4)::before{content:'Stock présent'!important;display:block!important;position:static!important;width:auto!important;height:auto!important;margin:0!important;color:#5e7087!important;font-size:12px!important;font-weight:800!important;letter-spacing:.02em!important;text-transform:none!important}
        #inventory #inventoryRows .qty{flex:0 0 auto!important;display:grid!important;grid-template-columns:56px 64px 56px!important;height:48px!important;border-radius:12px!important;overflow:hidden!important;background:#fff!important}
        #inventory #inventoryRows .qty button{width:56px!important;height:48px!important;padding:0!important;font-size:24px!important;line-height:1!important;touch-action:manipulation!important;-webkit-tap-highlight-color:transparent!important}
        #inventory #inventoryRows .qty input{width:64px!important;height:48px!important;padding:0 4px!important;font-size:19px!important;font-weight:850!important;text-align:center!important}

        /* L'ancien résumé desktop reste disponible sur grand écran, mais disparaît sur iPhone. */
        #summary > .card{display:none!important}
        #sf73MobileReviewRoot{display:block!important;width:100%!important;min-width:0!important}
        #sf73MobileReviewRoot *{box-sizing:border-box}
        .sf73-review-heading{font-size:23px!important;line-height:1.15!important;margin:8px 0 12px!important;color:var(--text)!important}
        .sf73-review-kpis{
          display:grid!important;
          grid-template-columns:1fr 1fr!important;
          gap:8px!important;
          margin:0 0 12px!important
        }
        .sf73-review-kpi{
          min-width:0!important;
          padding:10px 8px!important;
          border:1px solid var(--line)!important;
          border-radius:12px!important;
          background:#fff!important;
          text-align:center!important
        }
        .sf73-review-kpi span{display:block!important;font-size:11px!important;color:var(--muted)!important;margin-bottom:3px!important}
        .sf73-review-kpi strong{display:block!important;font-size:22px!important;line-height:1.1!important;color:var(--text)!important}
        .sf73-review-note{
          margin:0 0 12px!important;
          padding:10px 12px!important;
          border-radius:11px!important;
          background:#edf5ff!important;
          color:#315779!important;
          font-size:13px!important;
          line-height:1.35!important
        }
        .sf73-review-list{display:grid!important;gap:9px!important;width:100%!important;min-width:0!important;padding-bottom:88px!important}
        .sf73-review-card{
          width:100%!important;
          min-width:0!important;
          padding:12px!important;
          border:1px solid var(--line)!important;
          border-radius:14px!important;
          background:#fff!important;
          box-shadow:0 4px 14px rgba(13,35,62,.045)!important
        }
        .sf73-review-article{min-width:0!important;padding-bottom:9px!important;margin-bottom:9px!important;border-bottom:1px solid #edf1f6!important}
        .sf73-review-article strong{display:block!important;font-size:16px!important;line-height:1.2!important;overflow-wrap:anywhere!important}
        .sf73-review-article small{display:block!important;margin-top:3px!important;font-size:12px!important;color:var(--muted)!important}
        .sf73-review-values{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}
        .sf73-review-value{
          min-width:0!important;
          padding:8px 6px!important;
          border-radius:10px!important;
          background:#f7f9fc!important;
          text-align:center!important
        }
        .sf73-review-value span{display:block!important;font-size:10px!important;color:#728196!important;margin-bottom:3px!important;white-space:nowrap!important}
        .sf73-review-value b{display:block!important;font-size:19px!important;line-height:1!important;color:var(--text)!important}
        .sf73-review-value.sf73-order b{color:var(--green)!important}
        .sf73-review-value.sf73-none b{color:#98a2b0!important}
        .sf73-mobile-actionsbar{
          position:sticky!important;
          z-index:12!important;
          bottom:calc(10px + env(safe-area-inset-bottom))!important;
          display:grid!important;
          grid-template-columns:1fr 1.25fr!important;
          gap:8px!important;
          margin:0 -2px 4px!important;
          padding:8px!important;
          border:1px solid rgba(221,229,239,.95)!important;
          border-radius:14px!important;
          background:rgba(255,255,255,.96)!important;
          box-shadow:0 10px 28px rgba(13,35,62,.14)!important;
          backdrop-filter:blur(12px)!important
        }
        .sf73-mobile-actionsbar .btn{min-height:48px!important;padding:10px 12px!important;font-size:14px!important}

        .sf73-validation-panel{
          padding-bottom:92px!important;
          width:100%!important;
          min-width:0!important
        }
        .sf73-validation-card{
          padding:14px!important;
          border:1px solid var(--line)!important;
          border-radius:14px!important;
          background:#fff!important;
          box-shadow:0 4px 14px rgba(13,35,62,.045)!important;
          margin-bottom:10px!important
        }
        .sf73-validation-card h3{margin:0 0 6px!important;font-size:16px!important}
        .sf73-validation-card p{margin:0!important;font-size:13px!important;line-height:1.45!important;color:var(--muted)!important}
        .sf73-order-lines{display:grid!important;gap:7px!important;margin-top:10px!important}
        .sf73-order-line{
          display:flex!important;
          align-items:center!important;
          justify-content:space-between!important;
          gap:12px!important;
          padding:8px 0!important;
          border-bottom:1px solid #edf1f6!important
        }
        .sf73-order-line:last-child{border-bottom:0!important}
        .sf73-order-line span{min-width:0!important;font-size:13px!important;overflow-wrap:anywhere!important}
        .sf73-order-line b{flex:0 0 auto!important;font-size:17px!important;color:var(--green)!important}
        #sf73ValidationNote{width:100%!important;min-height:96px!important;font-size:16px!important;resize:vertical!important}
      }
    `;
    document.head.appendChild(style);
  }

  function syncFlowState(){
    document.body.classList.toggle('sf73-inventory-flow-visible',isMobile()&&inventoryFlowVisible());
  }

  function syncMobileTitle(){
    if(!isMobile()||!inventoryVisible())return;
    const mobileTitle=document.getElementById('sf52MobileTitle');
    let supplier='';
    try{supplier=String(current?.supplier||'').trim()}catch{}
    if(mobileTitle)mobileTitle.textContent=supplier||'Inventaire';
  }

  function enhanceInventoryRows(){
    if(!isMobile()||!inventoryVisible())return;
    document.querySelectorAll('#inventoryRows [data-minus]').forEach(button=>button.setAttribute('aria-label','Diminuer le stock'));
    document.querySelectorAll('#inventoryRows [data-plus]').forEach(button=>button.setAttribute('aria-label','Augmenter le stock'));
    document.querySelectorAll('#inventoryRows [data-stock]').forEach(input=>input.setAttribute('aria-label','Stock présent'));
    const zero=document.getElementById('setAllZero');
    if(zero)zero.setAttribute('aria-label','Mettre tous les stocks à zéro');
  }

  function stats(){
    const arts=typeof activeArticles==='function'?activeArticles():[];
    let lines=0;
    let qty=0;
    let filled=0;
    arts.forEach(article=>{
      const raw=current?.stocks?.[article.id];
      if(raw!==null&&raw!=='')filled++;
      const orderQty=typeof calc==='function'?Number(calc(article)||0):0;
      if(orderQty>0){lines++;qty+=orderQty}
    });
    return {arts,lines,qty,filled};
  }

  function ensureMobileReviewRoot(){
    const page=summaryPage();
    if(!page)return null;
    let root=document.getElementById('sf73MobileReviewRoot');
    if(root)return root;
    root=document.createElement('div');
    root.id='sf73MobileReviewRoot';
    root.hidden=true;
    const stepper=page.querySelector(':scope > .stepper');
    if(stepper?.nextSibling)page.insertBefore(root,stepper.nextSibling);
    else page.appendChild(root);
    return root;
  }

  function setStepperMode(mode){
    const page=summaryPage();
    const steps=[...(page?.querySelectorAll(':scope > .stepper .step')||[])];
    if(steps.length<3)return;
    steps.forEach(step=>step.classList.remove('active'));
    if(mode==='validation'){
      steps[0].querySelector('b').textContent='✓';
      steps[1].querySelector('b').textContent='✓';
      steps[2].querySelector('b').textContent='3';
      steps[2].classList.add('active');
    }else{
      steps[0].querySelector('b').textContent='✓';
      steps[1].querySelector('b').textContent='2';
      steps[2].querySelector('b').textContent='3';
      steps[1].classList.add('active');
    }
  }

  function renderSummaryMode(){
    if(!isMobile()||!summaryVisible())return;
    state.mode='summary';
    setStepperMode('summary');
    const root=ensureMobileReviewRoot();
    if(!root)return;
    const {arts,lines,qty,filled}=stats();
    const supplier=htmlEscape(current?.supplier||'');
    const cards=arts.map(article=>{
      const present=Number(current?.stocks?.[article.id]??0);
      const target=Number(article.target??0);
      const orderQty=typeof calc==='function'?Number(calc(article)||0):Math.max(0,target-present);
      return `<article class="sf73-review-card">
        <div class="sf73-review-article">
          <strong>${htmlEscape(article.name)}</strong>
          <small>${htmlEscape(article.unit||'')}</small>
        </div>
        <div class="sf73-review-values">
          <div class="sf73-review-value"><span>Présent</span><b>${present}</b></div>
          <div class="sf73-review-value"><span>Cible</span><b>${target}</b></div>
          <div class="sf73-review-value ${orderQty>0?'sf73-order':'sf73-none'}"><span>À commander</span><b>${orderQty}</b></div>
        </div>
      </article>`;
    }).join('');

    root.innerHTML=`
      <h2 class="sf73-review-heading">Résumé — ${supplier}</h2>
      <div class="sf73-review-kpis">
        <div class="sf73-review-kpi"><span>Articles</span><strong>${arts.length}</strong></div>
        <div class="sf73-review-kpi"><span>Saisis</span><strong>${filled}</strong></div>
        <div class="sf73-review-kpi"><span>Références à commander</span><strong>${lines}</strong></div>
        <div class="sf73-review-kpi"><span>Quantité totale</span><strong>${qty}</strong></div>
      </div>
      <p class="sf73-review-note">Vérifie simplement le stock compté par rapport à la cible. Les quantités ne sont plus modifiables ici.</p>
      <div class="sf73-review-list">${cards}</div>
      <div class="sf73-mobile-actionsbar">
        <button type="button" class="btn ghost" id="sf73SummaryRedo">Refaire l’inventaire</button>
        <button type="button" class="btn primary" id="sf73SummaryContinue">Continuer</button>
      </div>
    `;
    root.hidden=false;
    window.stopflow070BackNavigation?.refresh?.();
  }

  function renderValidationMode(){
    if(!isMobile()||!summaryVisible())return;
    state.mode='validation';
    setStepperMode('validation');
    const root=ensureMobileReviewRoot();
    if(!root)return;
    const {arts,lines,qty,filled}=stats();
    const supplier=htmlEscape(current?.supplier||'');
    const orderLines=arts.map(article=>{
      const orderQty=typeof calc==='function'?Number(calc(article)||0):0;
      if(orderQty<=0)return '';
      return `<div class="sf73-order-line"><span>${htmlEscape(article.name)}</span><b>${orderQty}</b></div>`;
    }).join('');
    const note=htmlEscape(current?.note||document.getElementById('generalNote')?.value||'');
    const responsible=typeof canValidateOrders==='function'&&canValidateOrders();
    const actionLabel=responsible?'Valider et générer le PDF':'Envoyer pour validation';

    root.innerHTML=`
      <h2 class="sf73-review-heading">Validation — ${supplier}</h2>
      <div class="sf73-review-kpis">
        <div class="sf73-review-kpi"><span>Articles comptés</span><strong>${filled}/${arts.length}</strong></div>
        <div class="sf73-review-kpi"><span>À commander</span><strong>${lines}</strong></div>
        <div class="sf73-review-kpi"><span>Quantité totale</span><strong>${qty}</strong></div>
        <div class="sf73-review-kpi"><span>Fournisseur</span><strong style="font-size:15px">${supplier}</strong></div>
      </div>
      <div class="sf73-validation-panel">
        <div class="sf73-validation-card">
          <h3>Commande calculée</h3>
          <p>Le PDF final reprendra l’inventaire complet avec le stock présent, le stock cible et la quantité à commander.</p>
          <div class="sf73-order-lines">${orderLines||'<div class="sf73-order-line"><span>Aucune commande nécessaire</span><b>0</b></div>'}</div>
        </div>
        <div class="sf73-validation-card">
          <h3>Remarque</h3>
          <p style="margin-bottom:8px!important">Ajoute seulement une information utile pour la validation ou la commande.</p>
          <textarea id="sf73ValidationNote" class="input" placeholder="Remarque éventuelle…">${note}</textarea>
        </div>
      </div>
      <div class="sf73-mobile-actionsbar">
        <button type="button" class="btn ghost" id="sf73ValidationBack">Retour au résumé</button>
        <button type="button" class="btn primary" id="sf73ValidationConfirm">${actionLabel}</button>
      </div>
    `;
    root.hidden=false;
    const textarea=document.getElementById('sf73ValidationNote');
    textarea?.addEventListener('input',event=>{
      current.note=event.target.value;
      const legacy=document.getElementById('generalNote');
      if(legacy)legacy.value=event.target.value;
    });
    window.stopflow070BackNavigation?.refresh?.();
  }

  function syncSummaryPresentation(){
    if(!isMobile()||!summaryVisible())return;
    if(state.renderingSummary)return;
    state.renderingSummary=true;
    try{
      if(state.mode==='validation')renderValidationMode();
      else renderSummaryMode();
    }finally{
      state.renderingSummary=false;
    }
  }

  function flowAction(target){
    const control=target?.closest?.(FLOW_SELECTOR)||null;
    if(!control)return null;
    const inventory=inventoryPage();
    const summary=summaryPage();
    if(inventory?.contains(control)||summary?.contains(control))return control;
    return null;
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

  function validationPdfBlob(snapshot){
    const arts=typeof activeArticles==='function'?activeArticles():[];
    const rows=arts.map(article=>({
      name:article.name,
      unit:article.unit||'',
      stock:Number(current?.stocks?.[article.id]??0),
      target:Number(article.target??0),
      order:typeof calc==='function'?Number(calc(article)||0):0
    }));
    const PAGE_W=595;
    const PAGE_H=842;
    const LEFT=38;
    const ROWS_PER_PAGE=25;
    const chunks=[];
    for(let i=0;i<rows.length;i+=ROWS_PER_PAGE)chunks.push(rows.slice(i,i+ROWS_PER_PAGE));
    if(!chunks.length)chunks.push([]);

    const contentStreams=chunks.map((chunk,pageIndex)=>{
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
      text('Article',LEFT,y,8,true);
      text('Stock',330,y,8,true);
      text('Cible',395,y,8,true);
      text('A commander',455,y,8,true);
      y-=8; line(LEFT,y,555,y); y-=14;
      chunk.forEach(row=>{
        const articleLabel=(safePdfText(row.name)+(row.unit?` (${safePdfText(row.unit)})`:'')).slice(0,54);
        text(articleLabel,LEFT,y,8);
        text(String(row.stock),345,y,9,true);
        text(String(row.target),410,y,9);
        text(String(row.order),485,y,9,true);
        y-=20;
        line(LEFT,y+6,555,y+6);
      });
      if(pageIndex===chunks.length-1){
        y-=10;
        const note=safePdfText(snapshot.note||'').slice(0,150);
        text(`Remarque : ${note||'-'}`,LEFT,Math.max(45,y),8);
      }
      return ops.join('\n');
    });

    const objects=[];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    const pageRefs=[];
    let nextObj=3;
    contentStreams.forEach(()=>{pageRefs.push(nextObj);nextObj+=2});
    const fontRegular=nextObj;
    const fontBold=nextObj+1;
    objects.push(`<< /Type /Pages /Kids [${pageRefs.map(n=>`${n} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
    contentStreams.forEach((stream,index)=>{
      const pageObj=pageRefs[index];
      const contentObj=pageObj+1;
      objects[pageObj-1]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentObj} 0 R >>`;
      objects[contentObj-1]=`<< /Length ${binaryBytes(stream).length} >>\nstream\n${stream}\nendstream`;
    });
    objects[fontRegular-1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[fontBold-1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    let pdf='%PDF-1.4\n%âãÏÓ\n';
    const offsets=[0];
    objects.forEach((obj,index)=>{
      offsets.push(binaryBytes(pdf).length);
      pdf+=`${index+1} 0 obj\n${obj}\nendobj\n`;
    });
    const xref=binaryBytes(pdf).length;
    pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
    for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
    pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([binaryBytes(pdf)],{type:'application/pdf'});
  }

  async function finalValidation(){
    if(state.validating)return;
    state.validating=true;
    const button=document.getElementById('sf73ValidationConfirm');
    const originalLabel=button?.textContent||'Valider';
    if(button){button.disabled=true;button.textContent='Validation…'}

    try{
      const note=document.getElementById('sf73ValidationNote')?.value||'';
      current.note=note;
      current.adjustments={};
      const legacyNote=document.getElementById('generalNote');
      if(legacyNote)legacyNote.value=note;

      const responsible=typeof canValidateOrders==='function'&&canValidateOrders();
      if(!responsible){
        if(typeof canSubmitOrders==='function'&&!canSubmitOrders())return alert('Action non autorisée.');
        if(typeof orderSnapshot!=='function'||typeof upsertOrder!=='function')throw new Error('Enregistrement indisponible.');
        const pending=orderSnapshot('À valider');
        await upsertOrder(pending);
        alert('Inventaire envoyé pour validation.');
        if(typeof page==='function')page('dashboard');
        return;
      }

      if(typeof orderSnapshot!=='function'||typeof upsertOrder!=='function')throw new Error('Validation indisponible.');
      const snapshot=orderSnapshot('Validé');
      const pdfBlob=validationPdfBlob(snapshot);
      const pdfUrl=URL.createObjectURL(pdfBlob);
      let pdfWindow=null;
      try{
        pdfWindow=window.open('about:blank','_blank');
        if(pdfWindow){
          pdfWindow.document.title='StopFlow — Validation';
          pdfWindow.document.body.innerHTML='<p style="font-family:Arial;padding:24px">Validation de l’inventaire…</p>';
        }
      }catch{}

      let saved;
      try{
        saved=await upsertOrder(snapshot)||snapshot;
      }catch(error){
        if(pdfWindow&&!pdfWindow.closed)pdfWindow.close();
        URL.revokeObjectURL(pdfUrl);
        throw error;
      }

      if(pdfWindow&&!pdfWindow.closed){
        pdfWindow.location.href=pdfUrl;
        setTimeout(()=>URL.revokeObjectURL(pdfUrl),120000);
      }else{
        const link=document.createElement('a');
        link.href=pdfUrl;
        link.target='_blank';
        link.rel='noopener';
        link.click();
        setTimeout(()=>URL.revokeObjectURL(pdfUrl),120000);
      }

      alert('Inventaire validé. Le PDF contient le stock présent, la cible et la quantité à commander.');
      if(typeof page==='function')page('history');
      if(typeof showDetail==='function')setTimeout(()=>showDetail(saved.id),0);
    }catch(error){
      console.warn('StopFlow 0.7.3 — validation mobile',error);
      const message=typeof cloudErrorMessage==='function'?cloudErrorMessage(error,'Validation impossible.'):(error?.message||'Validation impossible.');
      alert(message);
    }finally{
      state.validating=false;
      if(button&&button.isConnected){button.disabled=false;button.textContent=originalLabel}
    }
  }

  function applyDirectAction(control){
    if(!control)return false;
    try{
      if(control.id==='setAllZero'&&inventoryVisible()){
        if(typeof activeArticles!=='function'||typeof renderInventory!=='function')return true;
        activeArticles().forEach(article=>{current.stocks[article.id]=0});
        renderInventory();
        scheduleRefresh();
        return true;
      }

      if((control.dataset.plus!==undefined||control.dataset.minus!==undefined)&&inventoryVisible()){
        const id=control.dataset.plus||control.dataset.minus;
        if(!id||typeof renderInventory!=='function')return true;
        const value=Number(current.stocks[id]??0);
        if(control.dataset.plus!==undefined)current.stocks[id]=value+1;
        else current.stocks[id]=Math.max(0,value-1);
        renderInventory();
        scheduleRefresh();
        return true;
      }

      if(control.id==='sf73SummaryRedo'){
        state.mode='summary';
        if(typeof page==='function')page('inventory');
        return true;
      }

      if(control.id==='sf73SummaryContinue'){
        renderValidationMode();
        window.scrollTo({top:0,behavior:'smooth'});
        return true;
      }

      if(control.id==='sf73ValidationBack'){
        renderSummaryMode();
        window.scrollTo({top:0,behavior:'smooth'});
        return true;
      }

      if(control.id==='sf73ValidationConfirm'){
        finalValidation();
        return true;
      }
    }catch(error){
      console.warn('StopFlow 0.7.3 — commande directe inventaire mobile',error);
      return true;
    }
    return false;
  }

  function runExistingAction(control){
    if(!control)return;
    try{
      if(typeof control.onclick==='function'){
        control.onclick.call(control,new MouseEvent('click',{bubbles:false,cancelable:true,view:window}));
      }else{
        state.syntheticAction=control;
        control.click();
        state.syntheticAction=null;
      }
    }catch(error){
      state.syntheticAction=null;
      console.warn('StopFlow 0.7.3 — action parcours inventaire mobile',error);
    }
    setTimeout(scheduleRefresh,0);
    setTimeout(()=>window.stopflow070BackNavigation?.refresh?.(),30);
  }

  function activate(control){
    if(applyDirectAction(control))return;
    if(control?.id==='showSummary'){
      state.mode='summary';
      current.adjustments={};
    }
    runExistingAction(control);
  }

  function installMobileControls(){
    document.addEventListener('pointerdown',event=>{
      if(!isMobile()||(event.button!=null&&event.button!==0))return;

      if(summaryVisible()&&event.target?.closest?.('#sf73MobileBack')){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if(state.mode==='validation')renderSummaryMode();
        else if(typeof page==='function')page('inventory');
        return;
      }

      const control=flowAction(event.target);
      if(!control)return;
      state.gesture={
        control,
        pointerId:event.pointerId,
        startX:event.clientX,
        startY:event.clientY,
        startScrollX:window.scrollX,
        startScrollY:window.scrollY,
        moved:false,
        startedAt:Date.now()
      };
    },true);

    document.addEventListener('pointermove',event=>{
      const gesture=state.gesture;
      if(!gesture||gesture.pointerId!==event.pointerId)return;
      if(Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)>MOVE_THRESHOLD)gesture.moved=true;
      if(Math.abs(window.scrollX-gesture.startScrollX)>1||Math.abs(window.scrollY-gesture.startScrollY)>1)gesture.moved=true;
    },true);

    document.addEventListener('scroll',()=>{
      if(state.gesture)state.gesture.moved=true;
    },true);

    document.addEventListener('pointerup',event=>{
      const gesture=state.gesture;
      if(!gesture||gesture.pointerId!==event.pointerId)return;
      state.gesture=null;
      const control=flowAction(event.target);
      const sameControl=control===gesture.control||gesture.control.contains(event.target);
      const tap=!gesture.moved&&sameControl&&Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)<=MOVE_THRESHOLD&&Date.now()-gesture.startedAt<1000;
      state.suppressAction=gesture.control;
      state.suppressUntil=Date.now()+900;
      if(!tap)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      activate(gesture.control);
    },true);

    document.addEventListener('pointercancel',event=>{
      const gesture=state.gesture;
      if(!gesture||gesture.pointerId!==event.pointerId)return;
      state.suppressAction=gesture.control;
      state.suppressUntil=Date.now()+900;
      state.gesture=null;
    },true);

    document.addEventListener('click',event=>{
      if(!isMobile())return;
      const control=flowAction(event.target);
      if(!control)return;
      if(state.syntheticAction===control)return;
      if(state.suppressAction===control&&Date.now()<state.suppressUntil){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    },true);
  }

  function refresh(){
    injectStyles();
    syncFlowState();
    syncMobileTitle();
    enhanceInventoryRows();
    syncSummaryPresentation();
  }

  function scheduleRefresh(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{
      state.scheduled=false;
      refresh();
    });
  }

  function installObserver(){
    if(state.observer||!document.body)return;
    state.observer=new MutationObserver(scheduleRefresh);
    state.observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
  }

  window.stopflow073InventoryMobileUx={
    active:true,
    refresh:scheduleRefresh,
    showSummary:renderSummaryMode,
    showValidation:renderValidationMode
  };

  installMobileControls();
  document.addEventListener('click',()=>setTimeout(scheduleRefresh,0),true);
  document.addEventListener('pointerup',()=>setTimeout(scheduleRefresh,20),true);
  window.addEventListener('resize',scheduleRefresh);
  installObserver();
  [0,100,300,700,1400,2600].forEach(delay=>setTimeout(()=>{installObserver();scheduleRefresh()},delay));
})();