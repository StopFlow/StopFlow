/* StopFlow 0.8.0 — audit Administration / Permissions / Paramètres. */
(function(){
  if(window.stopflow080AdminPermissionsAudit?.active)return;

  const SCOPES=['cuisine','salle','nettoyage'];
  const LABELS={cuisine:'Cuisine',salle:'Salle',nettoyage:'Entretien & hygiène'};
  const state={
    scheduled:false,
    proposalBusy:false,
    observers:[],
    checklistSuggestionsLoading:false,
    checklistSuggestionsSignature:'',
    checklistRun:{itemId:'',loading:false,data:null}
  };
  const S=window.SF54;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const sessionNow=()=>{try{return typeof session!=='undefined'?session:null}catch{return null}};
  const isAdminUser=()=>{try{return typeof isAdmin==='function'?isAdmin():String(sessionNow()?.role||'').toLowerCase()==='admin'}catch{return false}};
  const nav=()=>window.stopflow070CardNavigation;
  const has=(key,scope)=>isAdminUser()||Boolean(nav()?.hasPermission?.(key,scope));
  const anyScope=key=>SCOPES.some(scope=>has(key,scope));
  const cloud=()=>Boolean(window.supabaseClient&&typeof isCloudMode==='function'&&isCloudMode());
  const currentName=()=>{const s=sessionNow();return String(s?.name||[s?.prenom,s?.nom].filter(Boolean).join(' ')||'').trim()};

  function bindTap(button,handler){
    if(!button||button.dataset.sf80AuditBound==='1')return;
    button.dataset.sf80AuditBound='1';
    if(typeof window.stopflow073MobileTap?.bind==='function'){
      window.stopflow073MobileTap.bind(button,handler);
      button.addEventListener('click',event=>{
        if(window.matchMedia?.('(max-width:950px)').matches)return;
        handler(event);
      });
      return;
    }
    button.addEventListener('click',handler);
  }

  function setText(node,value){
    if(node&&node.textContent!==String(value))node.textContent=String(value);
  }

  function injectStyles(){
    if(document.getElementById('stopflow080AdminPermissionsAuditStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080AdminPermissionsAuditStyles';
    style.textContent=`
      #sf54CuisineSuggestions .sf80-proposal-review-actions,
      #sf54Lunchs .sf80-proposal-review-actions{display:none!important}
      .sf80-audit-review-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .sf80-audit-review-actions .btn{min-height:42px}
      #sf80AuditReviewModal{z-index:13700}
      #sf80AuditReviewModal .modalbox{width:min(620px,100%)}
      #sf80AuditReviewNote{width:100%;min-height:145px;font-size:16px!important;line-height:1.5}
      .sf80-audit-modal-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}
      .sf80-audit-role-help{margin-top:7px;padding:9px 11px;border:1px solid #dce6f2;border-radius:10px;background:#f7f9fc;color:#586b81;font-size:11px;line-height:1.45}
      .sf80-audit-user-summary{display:inline-flex;margin-top:5px;padding:3px 7px;border-radius:999px;background:#f0f3f7;color:#607086;font-size:10px;font-weight:800}
      .sf80-audit-shared-note{margin:0 0 12px;padding:10px 12px;border:1px solid #d5e5fb;border-radius:11px;background:#f2f7ff;color:#365b84;font-size:12px;line-height:1.45}
      #settings .sf80-audit-local-card .sf80-audit-hidden-cloud{display:none!important}
      #checklistRunnerActions .sf80-audit-checklist-review{display:inline-flex}
      #checklistManagerPanel .sf80-audit-manager-note{margin:10px 0;padding:9px 11px;border:1px solid #dbe6f4;border-radius:10px;background:#f7faff;color:#4a6684;font-size:11px;line-height:1.4}
      #checklists .sf80-audit-no-run{display:none!important}
      @media(max-width:720px){
        .sf80-audit-review-actions{display:grid;grid-template-columns:1fr 1fr}
        #sf80AuditReviewModal{padding:10px!important;align-items:flex-start!important;padding-top:max(14px,env(safe-area-inset-top))!important}
        #sf80AuditReviewModal .modalbox{margin:0!important;max-height:calc(100dvh - 24px)!important;overflow:auto!important;border-radius:16px!important}
        .sf80-audit-modal-actions{grid-template-columns:1fr}
        #modalBox:has(.sf70-permissions-holder) #createUserButton,
        #modalBox:has(.sf70-permissions-holder) #saveUserButton{
          position:sticky!important;bottom:0!important;z-index:5!important;width:100%!important;
          margin-top:14px!important;box-shadow:0 -8px 18px rgba(255,255,255,.95)
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureReviewModal(){
    let modal=document.getElementById('sf80AuditReviewModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='sf80AuditReviewModal';
    modal.className='modal hidden';
    modal.innerHTML=`<div class="modalbox">
      <h2>Refuser la proposition</h2>
      <p class="muted" id="sf80AuditReviewHint">Ajoutez une remarque pour le proposant si nécessaire.</p>
      <textarea id="sf80AuditReviewNote" class="input" placeholder="Remarque pour le proposant…"></textarea>
      <div class="sf80-audit-modal-actions">
        <button type="button" class="btn ghost" id="sf80AuditReviewCancel">Annuler</button>
        <button type="button" class="btn danger" id="sf80AuditReviewConfirm">Refuser</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    bindTap(modal.querySelector('#sf80AuditReviewCancel'),()=>modal.classList.add('hidden'));
    bindTap(modal.querySelector('#sf80AuditReviewConfirm'),async()=>{
      const id=modal.dataset.itemId,kind=modal.dataset.kind;
      const note=String(modal.querySelector('#sf80AuditReviewNote')?.value||'').trim();
      const button=modal.querySelector('#sf80AuditReviewConfirm');
      button.disabled=true;button.textContent='Refus…';
      try{await decideProposal(id,'rejected',kind,note);modal.classList.add('hidden')}
      finally{button.disabled=false;button.textContent='Refuser'}
    });
    return modal;
  }

  function canReviewKind(kind){
    return kind==='suggestion'
      ?has('monthly_suggestions.manage','cuisine')
      :kind==='lunch'&&has('lunchs.manage','cuisine');
  }

  function proposalContent(){return Array.isArray(S?.state?.content)?S.state.content:[]}
  function proposalStatus(item){return item?.review_status==='approved'?'approved':item?.review_status==='rejected'?'rejected':'pending'}

  function proposalForCard(card,kind){
    const cached=card.dataset.sf80ProposalId;
    if(cached){
      const found=proposalContent().find(item=>String(item.id)===String(cached));
      if(found)return found;
    }
    if(kind==='suggestion'){
      const direct=card.querySelector('[data-sf80-ms-approve],[data-sf80-ms-reject]');
      const id=direct?.dataset.sf80MsApprove||direct?.dataset.sf80MsReject;
      if(id){
        const found=proposalContent().find(item=>String(item.id)===String(id));
        if(found){card.dataset.sf80ProposalId=found.id;return found}
      }
      const title=String(card.querySelector('h3')?.textContent||'').trim();
      const body=String(card.querySelector('.sf80-ms-content')?.textContent||'').trim();
      const found=proposalContent().find(item=>
        item.content_type==='monthly_suggestion'&&
        String(item.title||'').trim()===title&&String(item.content||'').trim()===body
      );
      if(found)card.dataset.sf80ProposalId=found.id;
      return found||null;
    }
    const archive=card.querySelector('[data-sf80-lunch-archive]');
    const id=archive?.dataset.sf80LunchArchive;
    if(id){
      const found=proposalContent().find(item=>String(item.id)===String(id));
      if(found){card.dataset.sf80ProposalId=found.id;return found}
    }
    const title=String(card.querySelector('h3')?.textContent||'').trim();
    const candidates=proposalContent().filter(item=>item.content_type==='weekly_lunch'&&String(item.title||'').trim()===title);
    let found=candidates[0]||null;
    if(candidates.length>1){
      const text=normalize(card.textContent);
      found=candidates.find(item=>String(item.content||'').split(/\n+/)
        .filter(line=>/^plat\s*[12]\s*:/i.test(line))
        .every(line=>text.includes(normalize(line.replace(/^plat\s*[12]\s*:\s*/i,'')))))||found;
    }
    if(found)card.dataset.sf80ProposalId=found.id;
    return found;
  }

  async function decideProposal(id,status,kind,note=''){
    if(state.proposalBusy||!id||!canReviewKind(kind))return;
    const item=proposalContent().find(row=>String(row.id)===String(id));
    if(!item)return;
    state.proposalBusy=true;
    const s=sessionNow(),now=new Date().toISOString();
    const patch={
      review_status:status,review_note:String(note||'').trim(),
      reviewed_by:s?.id||null,reviewed_by_name:currentName(),reviewed_at:now,updated_at:now
    };
    try{
      if(cloud()){
        const {data,error}=await window.supabaseClient.from('department_content').update(patch).eq('id',id).select('*').single();
        if(error)throw error;
        Object.assign(item,data||patch);
      }else{
        Object.assign(item,patch);
        localStorage.setItem('sf54_content',JSON.stringify(proposalContent()));
      }
      window.stopflow080MonthlySuggestionsFlow?.refresh?.();
      window.stopflow080KitchenPlanning?.renderLunchList?.();
      window.stopflow080ProposalReviewFlow?.refresh?.();
      window.stopflow080MonthlySuggestionsHistoryFilters?.refresh?.();
      setTimeout(schedule,80);
    }catch(error){
      console.warn('StopFlow 0.8.0 — décision proposition',error);
      alert(error?.message||'Impossible d’enregistrer cette décision.');
    }finally{state.proposalBusy=false}
  }

  function openReject(item,kind){
    if(!item||!canReviewKind(kind))return;
    const modal=ensureReviewModal();
    modal.dataset.itemId=String(item.id||'');
    modal.dataset.kind=kind;
    setText(modal.querySelector('#sf80AuditReviewHint'),`${item.title||'Cette proposition'} sera refusée. Vous pouvez expliquer la décision au proposant.`);
    const textarea=modal.querySelector('#sf80AuditReviewNote');textarea.value='';
    modal.classList.remove('hidden');
    try{textarea.focus({preventScroll:true})}catch{}
  }

  function syncProposalActions(card,kind){
    const item=proposalForCard(card,kind);
    const shouldShow=Boolean(item&&proposalStatus(item)==='pending'&&canReviewKind(kind));
    let actions=card.querySelector('.sf80-audit-review-actions');
    if(!shouldShow){actions?.remove();return}
    if(actions&&actions.dataset.itemId===String(item.id)&&actions.dataset.kind===kind)return;
    actions?.remove();
    actions=document.createElement('div');
    actions.className='sf80-audit-review-actions';
    actions.dataset.itemId=String(item.id);actions.dataset.kind=kind;
    actions.innerHTML='<button type="button" class="btn small secondary" data-sf80-audit-approve>Valider</button><button type="button" class="btn small danger" data-sf80-audit-reject>Refuser</button>';
    const holder=kind==='suggestion'?(card.querySelector('.sf80-ms-actions')||card):(card.querySelector('.sf80-planning-tools')||card);
    holder.appendChild(actions);
    bindTap(actions.querySelector('[data-sf80-audit-approve]'),()=>decideProposal(item.id,'approved',kind,''));
    bindTap(actions.querySelector('[data-sf80-audit-reject]'),()=>openReject(item,kind));
  }

  function alignProposals(){
    const suggestions=document.getElementById('sf54CuisineSuggestions');
    suggestions?.querySelectorAll('.sf80-ms-item').forEach(card=>syncProposalActions(card,'suggestion'));
    const lunch=document.getElementById('sf54Lunchs');
    lunch?.querySelectorAll('.sf80-planning-item').forEach(card=>syncProposalActions(card,'lunch'));

    const lunchDot=lunch?.querySelector('.sf80-lunch-pending-dot');
    if(lunchDot){
      if(!canReviewKind('lunch'))lunchDot.classList.remove('show');
      else if(Number(lunchDot.textContent||0)>0)lunchDot.classList.add('show');
    }
  }

  function alignArticleCategories(){
    const allowed=anyScope('articles.manage');
    document.querySelectorAll('.sf80-category-add').forEach(button=>button.hidden=!allowed);
    const modal=document.getElementById('sf80ArticleCategoryModal');
    if(modal&&!allowed&&!modal.classList.contains('hidden'))modal.classList.add('hidden');
  }

  function departmentFromText(value){
    const text=normalize(value);
    if(text.includes('entretien'))return 'nettoyage';
    if(text.includes('cuisine'))return 'cuisine';
    if(text.includes('salle'))return 'salle';
    return '';
  }

  function fallbackChecklistRun(){
    const meta=String(document.getElementById('checklistRunMeta')?.textContent||'');
    const ownName=normalize(currentName());
    return {
      performed_by:null,
      department:departmentFromText(meta),
      status:normalize(meta).includes('a controler')?'a_controler':'',
      fallbackOwn:Boolean(ownName&&normalize(meta).includes(`commence par ${ownName}`))
    };
  }

  async function resolveChecklistRun(){
    const runner=document.getElementById('checklistRunner');
    if(!runner||runner.classList.contains('hidden')||!cloud())return;
    const itemId=runner.querySelector('[data-run-check]')?.dataset.runCheck||'';
    if(!itemId)return;
    if(state.checklistRun.itemId!==itemId){
      state.checklistRun={itemId,loading:false,data:null};
    }
    if(state.checklistRun.data||state.checklistRun.loading)return;
    state.checklistRun.loading=true;
    try{
      const {data:item,error:itemError}=await window.supabaseClient.from('checklist_run_items').select('run_id').eq('id',itemId).single();
      if(itemError)throw itemError;
      const {data:run,error:runError}=await window.supabaseClient.from('checklist_runs').select('id,performed_by,department,status').eq('id',item.run_id).single();
      if(runError)throw runError;
      if(state.checklistRun.itemId===itemId)state.checklistRun.data=run;
    }catch(error){
      console.warn('StopFlow 0.8.0 — résolution checklist',error);
    }finally{
      if(state.checklistRun.itemId===itemId)state.checklistRun.loading=false;
      schedule();
    }
  }

  async function checklistValidate(status){
    const run=state.checklistRun.data||fallbackChecklistRun();
    const scope=run.department;
    if(!scope||!has('checklists.review',scope))return alert('Vous n’avez pas le droit de contrôler cette checklist.');
    let runId=run.id||null;
    if(!runId){
      const itemId=document.querySelector('#checklistRunItems [data-run-check]')?.dataset.runCheck;
      if(!itemId||!cloud())return alert('Checklist introuvable.');
      const {data:item,error}=await window.supabaseClient.from('checklist_run_items').select('run_id').eq('id',itemId).single();
      if(error||!item?.run_id)return alert(error?.message||'Checklist introuvable.');
      runId=item.run_id;
    }
    const note=prompt(status==='validee'?'Note de validation facultative :':'Quel suivi est nécessaire ?');
    if(note===null||(status!=='validee'&&!String(note).trim()))return;
    const now=new Date().toISOString();
    const {error}=await window.supabaseClient.from('checklist_runs').update({
      status,validated_by:sessionNow()?.id||null,validated_by_name:currentName(),
      validated_at:now,validator_note:String(note||'').trim(),updated_at:now
    }).eq('id',runId);
    if(error)return alert(error.message);
    state.checklistRun={itemId:'',loading:false,data:null};
    document.getElementById('backToChecklists')?.click();
    setTimeout(()=>document.getElementById('refreshChecklists')?.click(),80);
  }

  function syncChecklistRunner(){
    const runner=document.getElementById('checklistRunner');
    if(!runner||runner.classList.contains('hidden'))return;
    resolveChecklistRun();

    const fallback=fallbackChecklistRun();
    const run=state.checklistRun.data||fallback;
    const own=run.performed_by
      ?String(run.performed_by)===String(sessionNow()?.id||'')
      :Boolean(fallback.fallbackOwn);

    if(!own){
      runner.querySelectorAll('[data-run-check],[data-run-anomaly],[data-run-note]').forEach(control=>control.disabled=true);
    }

    const actions=document.getElementById('checklistRunnerActions');
    if(!actions)return;
    actions.querySelectorAll('.sf80-audit-checklist-review').forEach(button=>button.remove());
    [...actions.querySelectorAll('button')].forEach(button=>{
      const text=normalize(button.textContent);
      if(text.includes('valider la checklist')||text.includes('demander un suivi'))button.remove();
      if(text.includes('terminer la checklist'))button.hidden=!own;
    });
  }

  function addChecklistTask(templateId,templateName,scope){
    if(!templateId||!scope||!has('checklists.templates.manage',scope))return alert('Vous n’avez pas le droit de modifier ce modèle.');
    const modal=document.getElementById('modal'),box=document.getElementById('modalBox');if(!modal||!box)return;
    box.innerHTML=`<div class="flex between"><div><h2>Ajouter une tâche</h2><p class="muted">${esc(templateName||'Checklist')}</p></div><button type="button" class="btn ghost" id="sf80AuditTaskClose">Fermer</button></div>
      <div class="field" style="margin-top:12px"><label>Section</label><input class="input" id="sf80AuditTaskSection" value="Ajouts validés"></div>
      <div class="field" style="margin-top:10px"><label>Tâche *</label><textarea class="input" id="sf80AuditTaskLabel" style="min-height:110px"></textarea></div>
      <label class="input" style="margin-top:10px"><input type="checkbox" id="sf80AuditTaskRequired" checked> Tâche obligatoire</label>
      <button type="button" class="btn primary" id="sf80AuditTaskSave" style="margin-top:14px;width:100%">Ajouter au modèle</button>`;
    modal.classList.remove('hidden');
    bindTap(box.querySelector('#sf80AuditTaskClose'),()=>modal.classList.add('hidden'));
    bindTap(box.querySelector('#sf80AuditTaskSave'),async()=>{
      const label=String(box.querySelector('#sf80AuditTaskLabel')?.value||'').trim();
      if(!label)return alert('La tâche est obligatoire.');
      const {data,error}=await window.supabaseClient.from('checklist_template_items').select('item_order').eq('template_id',templateId).order('item_order',{ascending:false}).limit(1);
      if(error)return alert(error.message);
      const next=Number(data?.[0]?.item_order||0)+1;
      const {error:insertError}=await window.supabaseClient.from('checklist_template_items').insert({
        template_id:templateId,item_order:next,
        section_label:String(box.querySelector('#sf80AuditTaskSection')?.value||'').trim()||'Ajouts validés',
        label,required:Boolean(box.querySelector('#sf80AuditTaskRequired')?.checked),
        input_type:'checkbox',help_text:'',active:true
      });
      if(insertError)return alert(insertError.message);
      modal.classList.add('hidden');
      setTimeout(()=>document.getElementById('refreshChecklists')?.click(),80);
    });
  }

  async function loadChecklistManagerSuggestions(){
    const panel=document.getElementById('checklistManagerPanel'),box=document.getElementById('checklistSuggestions');
    if(!panel||panel.classList.contains('hidden')||!box||state.checklistSuggestionsLoading||!cloud()||!anyScope('checklists.templates.manage'))return;
    state.checklistSuggestionsLoading=true;
    try{
      const {data,error}=await window.supabaseClient.from('checklist_suggestions')
        .select('id,template_id,proposed_by_name,department,proposed_label,explanation,status,created_at')
        .eq('status','en_attente').order('created_at',{ascending:false}).limit(100);
      if(error)throw error;
      const rows=(data||[]).filter(item=>has('checklists.templates.manage',item.department));
      const signature=rows.map(item=>`${item.id}:${item.status}`).join('|');
      if(signature===state.checklistSuggestionsSignature&&box.dataset.sf80AuditManaged==='1')return;
      state.checklistSuggestionsSignature=signature;
      box.dataset.sf80AuditManaged='1';

      if(!rows.length){
        box.innerHTML='<div class="checklist-empty">Aucune suggestion en attente pour les départements que vous gérez.</div>';
        return;
      }
      const templateIds=[...new Set(rows.map(item=>item.template_id).filter(Boolean))];
      let names=new Map();
      if(templateIds.length){
        const {data:templates}=await window.supabaseClient.from('checklist_templates').select('id,name').in('id',templateIds);
        names=new Map((templates||[]).map(item=>[String(item.id),item.name]));
      }
      box.innerHTML=rows.map(item=>`<div class="checklist-suggestion" data-sf80-audit-suggestion="${esc(item.id)}">
        <b>${esc(item.proposed_label)}</b><br>
        <small class="muted">${esc(names.get(String(item.template_id))||'Checklist')} · ${esc(item.proposed_by_name||'')} · ${esc(LABELS[item.department]||item.department)}</small>
        ${item.explanation?`<p>${esc(item.explanation)}</p>`:''}
        <div class="flex wrap"><button type="button" class="btn primary small" data-sf80-audit-accept>Accepter et ajouter</button><button type="button" class="btn danger small" data-sf80-audit-refuse>Refuser</button></div>
      </div>`).join('');

      rows.forEach(item=>{
        const card=[...box.querySelectorAll('[data-sf80-audit-suggestion]')].find(node=>String(node.dataset.sf80AuditSuggestion)===String(item.id));
        if(!card)return;
        bindTap(card.querySelector('[data-sf80-audit-accept]'),async()=>{
          if(!has('checklists.templates.manage',item.department))return;
          const section=prompt('Section de la nouvelle tâche :','Ajouts validés');if(section===null)return;
          const {data:orders,error:orderError}=await window.supabaseClient.from('checklist_template_items').select('item_order').eq('template_id',item.template_id).order('item_order',{ascending:false}).limit(1);
          if(orderError)return alert(orderError.message);
          const next=Number(orders?.[0]?.item_order||0)+1;
          const {error:itemError}=await window.supabaseClient.from('checklist_template_items').insert({
            template_id:item.template_id,item_order:next,section_label:String(section||'').trim()||'Ajouts validés',
            label:item.proposed_label,required:true,input_type:'checkbox',help_text:item.explanation||'',active:true
          });
          if(itemError)return alert(itemError.message);
          const {error:updateError}=await window.supabaseClient.from('checklist_suggestions').update({
            status:'acceptee',reviewed_by:sessionNow()?.id||null,reviewed_by_name:currentName(),
            reviewed_at:new Date().toISOString(),review_note:section
          }).eq('id',item.id);
          if(updateError)return alert(updateError.message);
          state.checklistSuggestionsSignature='';
          await loadChecklistManagerSuggestions();
          document.getElementById('refreshChecklists')?.click();
        });
        bindTap(card.querySelector('[data-sf80-audit-refuse]'),async()=>{
          if(!has('checklists.templates.manage',item.department))return;
          const note=prompt('Motif du refus :');if(note===null)return;
          const {error:updateError}=await window.supabaseClient.from('checklist_suggestions').update({
            status:'refusee',reviewed_by:sessionNow()?.id||null,reviewed_by_name:currentName(),
            reviewed_at:new Date().toISOString(),review_note:String(note||'').trim()
          }).eq('id',item.id);
          if(updateError)return alert(updateError.message);
          state.checklistSuggestionsSignature='';
          await loadChecklistManagerSuggestions();
        });
      });
    }catch(error){
      console.warn('StopFlow 0.8.0 — suggestions checklists',error);
    }finally{state.checklistSuggestionsLoading=false}
  }

  function restrictChecklistTemplateModal(){
    const select=document.getElementById('newChecklistDepartment');if(!select)return;
    [...select.options].forEach(option=>option.disabled=!has('checklists.templates.manage',option.value));
    if(select.selectedOptions[0]?.disabled){
      const first=[...select.options].find(option=>!option.disabled);
      if(first)select.value=first.value;
    }
  }

  function alignChecklistSuggestionForm(){
    const select=document.getElementById('suggestionTemplate');
    if(!select)return;
    let allowed=0;
    [...select.options].forEach(option=>{
      const scope=departmentFromText(option.textContent||'');
      const ok=Boolean(scope&&has('checklists.run',scope));
      option.disabled=!ok;
      if(ok)allowed+=1;
    });
    if(select.selectedOptions[0]?.disabled){
      const first=[...select.options].find(option=>!option.disabled);
      if(first)select.value=first.value;
    }
    const submit=document.getElementById('submitChecklistSuggestion');
    if(submit)submit.disabled=allowed===0;
    const suggestionCard=document.getElementById('checklistSuggestionCard')||select.closest('.card');
    const directManager=anyScope('checklists.templates.manage');
    suggestionCard?.classList.toggle('hidden',directManager);
    suggestionCard?.classList.toggle('sf80-audit-no-run',!directManager&&allowed===0);
  }

  function alignChecklists(){
    const page=document.getElementById('checklists');if(!page)return;
    const accessible=SCOPES.filter(scope=>
      has('checklists.run',scope)||has('checklists.review',scope)||
      has('checklists.templates.manage',scope)||has('alerts.view',scope)
    );
    const access=document.getElementById('checklistAccessText');
    if(access&&accessible.length)setText(access,`Accès selon vos permissions : ${accessible.map(scope=>LABELS[scope]).join(' · ')}.`);

    page.querySelectorAll('.checklist-template').forEach(card=>{
      const scope=departmentFromText(card.querySelector('.checklist-pill.department')?.textContent||'');
      const start=card.querySelector('[data-start-template]');
      if(start)start.hidden=!has('checklists.run',scope);
      const legacyAdd=card.querySelector('[data-add-template-item]');
      if(legacyAdd){
        legacyAdd.textContent='Modifier';
        legacyAdd.hidden=!has('checklists.templates.manage',scope);
      }

      let auditAdd=card.querySelector('.sf80-audit-add-task');
      const needAuditAdd=Boolean(scope&&has('checklists.templates.manage',scope)&&!legacyAdd);
      if(!needAuditAdd){auditAdd?.remove();return}
      if(!auditAdd){
        auditAdd=document.createElement('button');
        auditAdd.type='button';auditAdd.className='btn ghost sf80-audit-add-task';auditAdd.textContent='Modifier';
        (start?.parentElement||card).appendChild(auditAdd);
        bindTap(auditAdd,()=>{
          const templateId=start?.dataset.startTemplate;
          if(typeof window.stopflowChecklistOpenTemplateEditor==='function')return window.stopflowChecklistOpenTemplateEditor(templateId);
          alert('L’éditeur de checklist est indisponible. Actualisez la page puis réessayez.');
        });
      }
    });

    const filterButton=document.querySelector('#sf54ChecklistFilter button');
    if(filterButton)filterButton.hidden=!isAdminUser();

    alignChecklistSuggestionForm();

    const panel=document.getElementById('checklistManagerPanel');
    if(panel){
      const allowed=anyScope('checklists.templates.manage');
      panel.classList.toggle('hidden',!allowed);
      if(allowed&&!panel.querySelector('.sf80-audit-manager-note')){
        const note=document.createElement('div');note.className='sf80-audit-manager-note';
        note.textContent='Vous pouvez modifier directement les checklists des départements autorisés. Les suggestions envoyées par les équipes restent disponibles ici.';
        panel.querySelector('.flex.between')?.insertAdjacentElement('afterend',note);
      }
      if(allowed)setTimeout(loadChecklistManagerSuggestions,0);
    }

    restrictChecklistTemplateModal();
    syncChecklistRunner();
  }

  function alignHistory(){
    const allButton=document.querySelector('#sf54HistoryFilter button');
    if(allButton)allButton.hidden=!isAdminUser();
  }

  function alignUsers(){
    const box=document.getElementById('modalBox');
    const role=box?.querySelector('#newUserRole,#editUserRole');
    if(role){
      const field=role.closest('.field');
      let help=field?.querySelector('.sf80-audit-role-help');
      if(field&&!help){
        help=document.createElement('div');help.className='sf80-audit-role-help';field.appendChild(help);
      }
      if(help){
        const text=role.value==='admin'
          ?'Administrateur : accès complet à StopFlow. Les interrupteurs de permissions ne sont pas nécessaires.'
          :'Le rôle décrit le niveau du profil. Les accès métier réels sont définis par les permissions ci-dessous.';
        setText(help,text);
      }
      if(role.dataset.sf80AuditRole!=='1'){
        role.dataset.sf80AuditRole='1';
        role.addEventListener('change',()=>setTimeout(schedule,0));
      }
    }

    try{
      const users=typeof sharedUsers!=='undefined'?sharedUsers:[];
      document.querySelectorAll('#userRows [data-user-edit]').forEach(button=>{
        const user=users.find(item=>String(item.id)===String(button.dataset.userEdit));if(!user)return;
        const summary=button.closest('tr')?.querySelector('.sf70-user-permission-summary');if(!summary)return;
        let badge=summary.parentElement?.querySelector('.sf80-audit-user-summary');
        if(!badge){
          badge=document.createElement('span');badge.className='sf80-audit-user-summary';summary.insertAdjacentElement('afterend',badge);
        }
        const count=Array.isArray(user.permissions)?user.permissions.length:0;
        setText(badge,user.role==='admin'?'Accès complet':`${count} droit${count>1?'s':''} actif${count>1?'s':''}`);
      });
    }catch{}
  }

  function alignSettings(){
    const settings=document.getElementById('settings');if(!settings)return;
    const first=settings.querySelector(':scope > .card:first-child');
    if(first&&!first.querySelector('.sf80-audit-shared-note')){
      const note=document.createElement('div');note.className='sf80-audit-shared-note';
      note.textContent='Ces paramètres sont partagés : une modification enregistrée ici s’applique à StopFlow pour tous les utilisateurs autorisés.';
      first.querySelector('h2')?.insertAdjacentElement('afterend',note);
    }

    const localCard=document.getElementById('exportData')?.closest('.card');
    if(localCard){
      localCard.classList.add('sf80-audit-local-card');
      setText(localCard.querySelector('h2'),'Sauvegarde locale');
      const text=cloud()
        ?'Les données métier sont partagées via Supabase. L’export crée seulement une copie locale de consultation ; l’import et la réinitialisation locale sont masqués pour éviter toute confusion.'
        :'Outils de sauvegarde de la version locale.';
      setText(localCard.querySelector('p.muted'),text);
      document.getElementById('importData')?.closest('label')?.classList.toggle('sf80-audit-hidden-cloud',cloud());
      document.getElementById('resetData')?.classList.toggle('sf80-audit-hidden-cloud',cloud());
      const exportButton=document.getElementById('exportData');
      if(exportButton&&cloud())setText(exportButton,'Exporter une copie locale');
    }
    const save=document.getElementById('saveSettings');
    if(save)save.hidden=!has('settings.manage','global');
  }

  function refresh(){
    injectStyles();
    ensureReviewModal();
    alignArticleCategories();
    alignProposals();
    alignChecklists();
    alignHistory();
    alignUsers();
    alignSettings();
  }

  function schedule(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{state.scheduled=false;refresh()});
  }

  function observe(id){
    const node=document.getElementById(id);
    if(!node||node.dataset.sf80AuditObserved==='1')return;
    node.dataset.sf80AuditObserved='1';
    const observer=new MutationObserver(schedule);
    observer.observe(node,{childList:true,subtree:true});
    state.observers.push(observer);
  }

  function install(){
    ['sf54CuisineSuggestions','sf54Lunchs','checklists','history','users','settings','modalBox','articles'].forEach(observe);
    schedule();
  }

  window.stopflow080AdminPermissionsAudit={active:true,version:'0.8.0',refresh:schedule,hasPermission:has};
  [0,120,350,800,1600,3000,5000].forEach(delay=>setTimeout(install,delay));
})();