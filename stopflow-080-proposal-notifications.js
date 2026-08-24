/* StopFlow 0.8.0 — notifications internes des réponses aux propositions. */
(function(){
  if(window.stopflow080ProposalNotifications?.active)return;

  const state={items:[],loading:false,interval:null,installed:false};
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":"&#39;"}[char]));
  const client=()=>window.supabaseClient||null;
  const appVisible=()=>!document.getElementById('app')?.classList.contains('hidden');
  const unread=()=>state.items.filter(item=>!item.read_at).length;

  function bindButton(button,handler){
    if(!button||button.dataset.sf80NotificationBound==='1')return;
    button.dataset.sf80NotificationBound='1';
    button.addEventListener('click',event=>handler(event));
  }

  function injectStyles(){
    if(document.getElementById('stopflow080ProposalNotificationsStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080ProposalNotificationsStyles';
    style.textContent=`
      .sf80-notification-bell{position:relative;display:inline-grid;place-items:center;min-width:42px;min-height:42px;padding:7px 10px;font-size:18px;line-height:1}
      .sf80-notification-badge{position:absolute;top:-6px;right:-5px;display:none;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;border:2px solid #fff;border-radius:999px;background:#d93838;color:#fff;font-size:10px;font-weight:900;line-height:1}
      .sf80-notification-badge.show{display:flex}
      .topbar>.sf80-notification-bell{margin-left:auto;margin-right:6px}
      #sf80NotificationModal{z-index:13200}
      #sf80NotificationModal .modalbox{width:min(680px,100%);background:#fff}
      .sf80-notification-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
      .sf80-notification-list{display:grid;gap:10px;margin-top:14px}
      .sf80-notification-item{border:1px solid var(--line);border-radius:13px;background:#fff;padding:13px}
      .sf80-notification-item.unread{border-color:#b8cff5;background:#f7faff;box-shadow:inset 4px 0 0 #2463eb}
      .sf80-notification-item-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .sf80-notification-item h3{margin:0;font-size:15px;line-height:1.3}
      .sf80-notification-meta{margin-top:4px;color:var(--muted);font-size:11px;line-height:1.4}
      .sf80-notification-note{margin-top:10px;padding:9px 10px;border-radius:9px;background:#f3f5f8;color:#536173;font-size:12px;line-height:1.45}
      .sf80-notification-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px}
      .sf80-notification-empty{padding:18px;border:1px dashed var(--line);border-radius:12px;background:#fbfcfe;color:var(--muted);text-align:center}
      .sf80-mobile-header-actions{display:flex;align-items:center;justify-content:flex-end;gap:1px}
      .sf80-mobile-header-actions .sf80-notification-bell{width:38px;height:38px;min-width:38px;min-height:38px;padding:0;border:0;border-radius:9px;background:transparent;color:#fff;font-size:17px}
      .sf80-mobile-header-actions .sf80-notification-badge{top:-2px;right:-3px;border-color:#071d31}
      @media(max-width:950px){
        .sf52-mobile-header:has(.sf80-mobile-header-actions){grid-template-columns:42px minmax(0,1fr) auto!important}
        .topbar>.sf80-notification-bell{display:none!important}
        #sf80NotificationModal .modalbox{max-height:calc(100dvh - 24px)!important;overflow:auto!important}
      }
      @media(max-width:620px){
        #sf80NotificationModal{padding:10px!important;align-items:flex-start!important;padding-top:max(12px,env(safe-area-inset-top))!important}
        #sf80NotificationModal .modalbox{margin:0!important;border-radius:16px!important;padding:14px!important}
        .sf80-notification-item-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
        .sf80-notification-actions .btn{width:100%;min-height:44px}
      }
    `;
    document.head.appendChild(style);
  }

  function bellMarkup(id){
    const button=document.createElement('button');
    button.type='button';
    button.id=id;
    button.className='btn ghost sf80-notification-bell';
    button.setAttribute('aria-label','Ouvrir les notifications');
    button.innerHTML='<span aria-hidden="true">🔔</span><span class="sf80-notification-badge" aria-hidden="true">0</span>';
    bindButton(button,openPanel);
    return button;
  }

  function ensureDesktopBell(){
    const topbar=document.querySelector('#app .topbar');
    if(!topbar||document.getElementById('sf80NotificationBellDesktop'))return;
    const bell=bellMarkup('sf80NotificationBellDesktop');
    const logout=document.getElementById('logout');
    if(logout&&logout.parentElement===topbar)topbar.insertBefore(bell,logout);
    else topbar.appendChild(bell);
  }

  function ensureMobileBell(){
    const header=document.getElementById('sf52MobileHeader');
    const home=document.getElementById('sf52HomeButton');
    if(!header||!home||document.getElementById('sf80NotificationBellMobile'))return;
    let actions=header.querySelector('.sf80-mobile-header-actions');
    if(!actions){
      actions=document.createElement('div');
      actions.className='sf80-mobile-header-actions';
      home.insertAdjacentElement('beforebegin',actions);
      actions.appendChild(home);
    }
    actions.insertBefore(bellMarkup('sf80NotificationBellMobile'),home);
  }

  function ensurePanel(){
    let modal=document.getElementById('sf80NotificationModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='sf80NotificationModal';
    modal.className='modal hidden';
    modal.innerHTML=`<div class="modalbox"><div class="sf80-notification-head"><div><h2>Notifications</h2><p class="muted">Réponses à vos suggestions et propositions de Lunch.</p></div><button type="button" class="btn ghost" id="sf80NotificationClose">Fermer</button></div><div class="sf80-notification-list" id="sf80NotificationList"></div></div>`;
    document.body.appendChild(modal);
    bindButton(modal.querySelector('#sf80NotificationClose'),()=>modal.classList.add('hidden'));
    return modal;
  }

  function updateBadges(){
    const count=unread();
    document.querySelectorAll('.sf80-notification-badge').forEach(badge=>{
      badge.textContent=count>99?'99+':String(count);
      badge.classList.toggle('show',count>0);
    });
    document.querySelectorAll('.sf80-notification-bell').forEach(button=>{
      button.setAttribute('aria-label',count?`${count} notification${count>1?'s':''} non lue${count>1?'s':''}`:'Aucune notification non lue');
    });
  }

  function typeLabel(item){
    return item.content_type==='weekly_lunch'?'Lunch':'Suggestion';
  }
  function decisionLabel(item){
    return item.decision==='rejected'?'Refusée':'Validée';
  }
  function decisionClass(item){
    return item.decision==='rejected'?'cancelled':'validated';
  }
  function dateLabel(value){
    if(!value)return '';
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'':date.toLocaleString('fr-BE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  function renderPanel(){
    const holder=document.getElementById('sf80NotificationList');
    if(!holder)return;
    holder.innerHTML=state.items.length?state.items.map(item=>{
      const note=String(item.review_note||'').trim();
      const reviewer=String(item.reviewer_name||'').trim();
      const meta=[reviewer?`Décision par ${esc(reviewer)}`:'',dateLabel(item.reviewed_at)].filter(Boolean).join(' · ');
      return `<article class="sf80-notification-item${item.read_at?'':' unread'}" data-sf80-notification-id="${esc(item.id)}"><div class="sf80-notification-item-head"><div><h3>${esc(typeLabel(item))} ${esc(decisionLabel(item).toLowerCase())}</h3><div class="sf80-notification-meta">${esc(item.title||typeLabel(item))}${meta?`<br>${meta}`:''}</div></div><span class="badge ${decisionClass(item)}">${decisionLabel(item)}</span></div>${note?`<div class="sf80-notification-note"><b>Remarque :</b> ${esc(note)}</div>`:''}<div class="sf80-notification-actions"><button type="button" class="btn secondary" data-sf80-notification-open="${esc(item.id)}">Voir la proposition</button></div></article>`;
    }).join(''):'<div class="sf80-notification-empty">Aucune réponse à vos propositions pour le moment.</div>';
    holder.querySelectorAll('[data-sf80-notification-open]').forEach(button=>bindButton(button,()=>openNotification(button.dataset.sf80NotificationOpen)));
  }

  async function loadNotifications(){
    if(state.loading||!appVisible()||!client())return;
    state.loading=true;
    try{
      const {data,error}=await client().from('proposal_notifications').select('id,content_id,content_type,title,decision,review_note,reviewer_name,reviewed_at,created_at,read_at').order('created_at',{ascending:false}).limit(40);
      if(error)throw error;
      state.items=data||[];
      updateBadges();
      if(!document.getElementById('sf80NotificationModal')?.classList.contains('hidden'))renderPanel();
    }catch(error){
      if(!/JWT|session|auth/i.test(String(error?.message||'')))console.warn('StopFlow 0.8.0 — notifications',error);
    }finally{state.loading=false;}
  }

  async function markRead(item){
    if(!item||item.read_at||!client())return;
    const now=new Date().toISOString();
    try{
      const {error}=await client().from('proposal_notifications').update({read_at:now}).eq('id',item.id);
      if(error)throw error;
      item.read_at=now;
      updateBadges();
    }catch(error){
      console.warn('StopFlow 0.8.0 — notification lue',error);
    }
  }

  async function openNotification(id){
    const item=state.items.find(row=>String(row.id)===String(id));
    if(!item)return;
    await markRead(item);
    document.getElementById('sf80NotificationModal')?.classList.add('hidden');
    document.getElementById('sf52DrawerClose')?.click();
    const target=item.content_type==='weekly_lunch'?'sf54Lunchs':'sf54CuisineSuggestions';
    if(typeof page==='function')page(target);
    setTimeout(()=>{
      if(target==='sf54Lunchs')window.stopflow080KitchenPlanning?.renderLunchList?.();
      else window.stopflow080MonthlySuggestionsFlow?.refresh?.();
    },80);
  }

  function openPanel(){
    ensurePanel().classList.remove('hidden');
    renderPanel();
    loadNotifications();
  }

  function install(){
    injectStyles();
    ensureDesktopBell();
    ensureMobileBell();
    ensurePanel();
    updateBadges();
    if(!state.interval)state.interval=setInterval(loadNotifications,30000);
    if(!state.installed){
      state.installed=true;
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadNotifications()});
      window.addEventListener('focus',loadNotifications,{passive:true});
    }
    loadNotifications();
  }

  window.stopflow080ProposalNotifications={active:true,version:'0.8.0',refresh:loadNotifications,open:openPanel};
  [0,200,700,1600,3500].forEach(delay=>setTimeout(install,delay));
})();
