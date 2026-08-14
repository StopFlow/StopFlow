/* StopFlow 0.7.3 — bouton + fixe et menu d’actions contextuelles mobile. */
(function(){
  if(window.stopflow073MobileActions?.active)return;

  const MOBILE_QUERY='(max-width: 950px)';
  const VALID_CARD_ZONES=new Set(['home','cuisine','salle','nettoyage','general']);
  const state={open:false,observer:null,scheduled:false,lastPage:null,context:null};

  const isMobile=()=>window.matchMedia?.(MOBILE_QUERY).matches===true;
  const nav=()=>window.stopflow070CardNavigation;
  const personalization=()=>window.stopflow070CardPersonalization;
  const visiblePage=()=>document.querySelector('#app .page:not(.hidden)');
  const currentZone=()=>nav()?.runtime?.currentZone||'home';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

  function bindTap(node,handler){
    if(!node||node.dataset.sf73TapBound==='1')return;
    node.dataset.sf73TapBound='1';
    let firedAt=0;
    const fire=event=>{
      const now=Date.now();
      if((event.type==='click'||event.type==='touchend')&&now-firedAt<650){
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        return;
      }
      if(event.type==='pointerup'&&event.button!=null&&event.button!==0)return;
      firedAt=now;
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      handler(event);
    };
    if(window.PointerEvent)node.addEventListener('pointerup',fire,true);
    else node.addEventListener('touchend',fire,{capture:true,passive:false});
    node.addEventListener('click',fire,true);
  }

  function injectStyles(){
    if(document.getElementById('sf73MobileActionsStyles'))return;
    const style=document.createElement('style');
    style.id='sf73MobileActionsStyles';
    style.textContent=`
      #sf73MobileActionFab{display:none}
      #sf73MobileActionBackdrop,#sf73MobileActionSheet{display:none}
      @media(max-width:950px){
        .sf70-personalize-toolbar{display:none!important}
        #sf73MobileActionFab{
          position:fixed!important;
          left:max(14px,calc(env(safe-area-inset-left) + 10px))!important;
          bottom:max(14px,calc(env(safe-area-inset-bottom) + 12px))!important;
          z-index:10020!important;
          width:48px;height:48px;border-radius:50%;border:1px solid rgba(22,69,142,.16);
          background:#2463eb;color:#fff;box-shadow:0 10px 28px rgba(19,54,104,.28);
          display:grid;place-items:center;padding:0;font-size:30px;font-weight:400;line-height:1;
          cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;pointer-events:auto!important;
          -webkit-user-select:none;user-select:none;
        }
        #sf73MobileActionFab:active{transform:scale(.96)}
        #sf73MobileActionFab[hidden]{display:none!important}
        #sf73MobileActionBackdrop{
          position:fixed!important;inset:0!important;z-index:10030!important;background:rgba(5,18,31,.42);display:block;
          opacity:0;pointer-events:none;transition:opacity .16s ease;
        }
        #sf73MobileActionBackdrop.open{opacity:1;pointer-events:auto!important}
        #sf73MobileActionSheet{
          position:fixed!important;left:0!important;right:0!important;bottom:0!important;z-index:10031!important;display:block;
          background:#fff;border-radius:20px 20px 0 0;
          box-shadow:0 -18px 48px rgba(8,31,55,.22);
          padding:10px 14px calc(14px + env(safe-area-inset-bottom));
          transform:translate3d(0,105%,0);-webkit-transform:translate3d(0,105%,0);transition:transform .18s ease;
          max-height:min(68vh,540px);overflow:auto;pointer-events:auto!important;
          -webkit-overflow-scrolling:touch;
        }
        #sf73MobileActionSheet.open{transform:translate3d(0,0,0);-webkit-transform:translate3d(0,0,0)}
        .sf73-mobile-sheet-grip{width:38px;height:4px;border-radius:99px;background:#d4dbe5;margin:2px auto 12px}
        .sf73-mobile-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
        .sf73-mobile-sheet-head h3{margin:0 0 3px;font-size:17px}
        .sf73-mobile-sheet-head p{margin:0;font-size:12px;color:var(--muted)}
        .sf73-mobile-sheet-close{width:34px;height:34px;border:0;border-radius:10px;background:#f0f3f7;color:#44546a;font-size:22px;line-height:1;touch-action:manipulation}
        .sf73-mobile-actions{display:grid;gap:8px}
        .sf73-mobile-action{
          width:100%;border:1px solid var(--line);border-radius:13px;background:#fff;color:var(--text);
          padding:13px 14px;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:12px;
          min-height:50px;font-weight:800;touch-action:manipulation;-webkit-tap-highlight-color:transparent;
        }
        .sf73-mobile-action span:last-child{color:#8a98aa;font-size:18px}
        .sf73-mobile-action.primary{border-color:#c9d9ff;background:#f4f7ff;color:#1d55bd}
        .sf73-mobile-action.danger{border-color:#f0d6d6;background:#fff8f8;color:#a33c3c}
        body.sf73-mobile-actions-open{overflow:hidden!important;touch-action:none}
        body.sf73-mobile-actions-open #sf73MobileActionFab{pointer-events:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureUi(){
    injectStyles();
    let fab=document.getElementById('sf73MobileActionFab');
    if(!fab){
      fab=document.createElement('button');
      fab.id='sf73MobileActionFab';
      fab.type='button';
      fab.setAttribute('aria-label','Actions de cette page');
      fab.setAttribute('aria-expanded','false');
      fab.textContent='+';
      document.body.appendChild(fab);
    }
    bindTap(fab,()=>openSheet());

    let backdrop=document.getElementById('sf73MobileActionBackdrop');
    if(!backdrop){
      backdrop=document.createElement('div');
      backdrop.id='sf73MobileActionBackdrop';
      document.body.appendChild(backdrop);
    }
    bindTap(backdrop,()=>closeSheet());

    let sheet=document.getElementById('sf73MobileActionSheet');
    if(!sheet){
      sheet=document.createElement('aside');
      sheet.id='sf73MobileActionSheet';
      sheet.setAttribute('role','dialog');
      sheet.setAttribute('aria-modal','true');
      sheet.setAttribute('aria-label','Actions de cette page');
      document.body.appendChild(sheet);
    }
    return {fab,backdrop,sheet};
  }

  function cardPageContext(pageNode){
    const zone=currentZone();
    if(!VALID_CARD_ZONES.has(zone))return null;
    if(!['sf70Home','sf70ZonePage'].includes(pageNode?.id))return null;
    const p=personalization();
    if(!p?.active)return null;
    const editing=p.state?.editingZone===zone;
    const zoneLabel=zone==='home'?'Accueil':zone==='general'?'Général':zone==='cuisine'?'Cuisine':zone==='salle'?'Salle':'Entretien & hygiène';
    const actions=[];
    if(editing){
      actions.push({id:'personalize-done',label:'Terminer la personnalisation',primary:true,run:()=>document.querySelector('.sf70-personalize-toolbar .sf70-done')?.click()});
      actions.push({id:'personalize-reset',label:'Réinitialiser les cartes',danger:true,run:()=>p.resetZone?.(zone)});
    }else{
      actions.push({id:'personalize-start',label:'Personnaliser les cartes',primary:true,run:()=>p.personalize?.(zone)});
    }
    return {title:zoneLabel,subtitle:'Actions disponibles pour cette page',actions};
  }

  function supplierContext(pageNode){
    if(pageNode?.id!=='sf73SalleInventory')return null;
    return {
      title:'Inventaire — Salle',
      subtitle:'Actions liées aux fournisseurs',
      actions:[
        {id:'supplier-refresh',label:'Actualiser les fournisseurs',primary:true,run:()=>window.stopflow073SalleInventoryFlow?.render?.()},
        {id:'supplier-back',label:'Retour à Salle',run:()=>nav()?.openZone?.('salle')}
      ]
    };
  }

  function inventoryContext(pageNode){
    if(pageNode?.id!=='inventory')return null;
    const department=String(window.current?.department||window.SF54?.state?.department||'').toLowerCase();
    if(department!=='salle')return null;
    return {
      title:'Inventaire en cours',
      subtitle:'Actions liées à cet inventaire',
      actions:[
        {id:'inventory-back',label:'Retour aux fournisseurs',run:()=>window.stopflow073SalleInventoryFlow?.open?.()}
      ]
    };
  }

  function context(){
    const pageNode=visiblePage();
    return cardPageContext(pageNode)||supplierContext(pageNode)||inventoryContext(pageNode)||null;
  }

  function renderSheet(){
    const {sheet}=ensureUi();
    const ctx=context()||state.context;
    if(!ctx){sheet.innerHTML='';return false}
    state.context=ctx;
    sheet.innerHTML=`
      <div class="sf73-mobile-sheet-grip"></div>
      <div class="sf73-mobile-sheet-head">
        <div><h3>${esc(ctx.title)}</h3><p>${esc(ctx.subtitle||'Actions de cette page')}</p></div>
        <button type="button" class="sf73-mobile-sheet-close" aria-label="Fermer">×</button>
      </div>
      <div class="sf73-mobile-actions">
        ${ctx.actions.map(action=>`<button type="button" class="sf73-mobile-action${action.primary?' primary':''}${action.danger?' danger':''}" data-sf73-action="${esc(action.id)}"><span>${esc(action.label)}</span><span>›</span></button>`).join('')}
      </div>`;
    bindTap(sheet.querySelector('.sf73-mobile-sheet-close'),()=>closeSheet());
    sheet.querySelectorAll('[data-sf73-action]').forEach(button=>{
      bindTap(button,()=>{
        const action=ctx.actions.find(item=>item.id===button.dataset.sf73Action);
        closeSheet();
        setTimeout(()=>action?.run?.(),30);
      });
    });
    return true;
  }

  function openSheet(){
    if(!isMobile())return;
    if(!renderSheet())return;
    const {fab,backdrop,sheet}=ensureUi();
    state.open=true;
    fab.setAttribute('aria-expanded','true');
    backdrop.classList.add('open');
    sheet.classList.add('open');
    backdrop.style.opacity='1';
    backdrop.style.pointerEvents='auto';
    sheet.style.transform='translate3d(0,0,0)';
    sheet.style.webkitTransform='translate3d(0,0,0)';
    document.body.classList.add('sf73-mobile-actions-open');
  }

  function closeSheet(){
    const {fab,backdrop,sheet}=ensureUi();
    state.open=false;
    fab.setAttribute('aria-expanded','false');
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    backdrop.style.removeProperty('opacity');
    backdrop.style.removeProperty('pointer-events');
    sheet.style.removeProperty('transform');
    sheet.style.removeProperty('-webkit-transform');
    document.body.classList.remove('sf73-mobile-actions-open');
  }

  function refresh(){
    const {fab}=ensureUi();
    const pageNode=visiblePage();
    const ctx=isMobile()&&!document.getElementById('app')?.classList.contains('hidden')?context():null;
    state.context=ctx;
    fab.hidden=!ctx;
    state.lastPage=pageNode?.id||null;
    if(!ctx&&state.open)closeSheet();
    if(state.open&&ctx)renderSheet();
  }

  function scheduleRefresh(){
    if(state.scheduled)return;
    state.scheduled=true;
    requestAnimationFrame(()=>{
      state.scheduled=false;
      refresh();
    });
  }

  function observe(){
    if(state.observer)return;
    state.observer=new MutationObserver(scheduleRefresh);
    state.observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  }

  function install(){
    ensureUi();
    observe();
    refresh();
    window.matchMedia?.(MOBILE_QUERY).addEventListener?.('change',scheduleRefresh);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.open)closeSheet()});
  }

  window.stopflow073MobileActions={active:true,state,open:openSheet,close:closeSheet,refresh};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
