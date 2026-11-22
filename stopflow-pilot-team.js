/* Pilot onboarding: Auth proves identity; PostgreSQL decides every permission. */
(function () {
  'use strict';
  if (window.stopflowPilotTeam?.active) return;
  const PUBLIC_ORIGIN = 'https://stopflow-app-git-pilot-stopflow-v1-20261117-stopflow.vercel.app';
  const TARGET = 'https://mmrdpyhoawwoplbzqwag.supabase.co';
  const GROUPS = [
    ['Cuisine', 'cuisine', [['inventory.use','Inventaires'],['checklists.run','Checklists'],['temperatures.use','Températures'],['history.view','Historique'],['lunchs.view','Voir les lunchs'],['lunchs.manage','Modifier les lunchs'],['monthly_suggestions.view','Voir les suggestions'],['monthly_suggestions.manage','Proposer/modifier les suggestions']]],
    ['Salle', 'salle', [['inventory.use','Inventaires'],['checklists.run','Checklists'],['history.view','Historique']]],
    ['Entretien & hygiène', 'nettoyage', [['inventory.use','Inventaires'],['checklists.run','Checklists'],['history.view','Historique']]],
    ['Général', 'global', [['ideas.share','Partager une idée'],['banners.manage','Messages d’équipe'],['settings.manage','Paramètres']]],
    ...['cuisine','salle','nettoyage'].map(scope => ['Gestion — ' + ({cuisine:'Cuisine',salle:'Salle',nettoyage:'Entretien & hygiène'})[scope], scope,
      [['orders.manage','Commandes et validation'],['checklists.review','Contrôler les checklists'],['checklists.templates.manage','Modèles de checklists'],['alerts.view','Anomalies et suivi'],['suppliers.manage','Fournisseurs'],['articles.manage','Articles']]]),
  ];
  const RESERVATIONS = [['can_view','Plan de salle'],['can_view_bookings','Agenda et clients'],['can_manage_bookings','Créer, modifier et annuler les réservations'],
    ['can_manage_rooms','Gérer les salles'],['can_manage_tables','Gérer les tables'],['can_manage_layouts','Éditer le plan']];
  const LABELS = {pending:'En attente',approved:'Accepté',rejected:'Refusé',revoked:'Accès retirés',unregistered:'Demande à compléter'};
  const state = {context:null, selected:'', busy:false, uncertain:false, dirty:false, message:'', error:false, epoch:0};
  let activation = null, gate = null, loaded = false, bellObserver = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const client = () => typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  const approved = () => state.context?.status === 'approved';
  const who = () => typeof session !== 'undefined' ? session?.id || '' : '';
  const validEnvironment = () => window.stopflowEnvironment?.environment === 'development' && window.stopflowEnvironment?.supabaseUrl === TARGET;
  const hasDraft = () => state.dirty || window.stopflowService?.dirty?.() || window.stopflowBookingsV1?.dirty?.();
  async function leave() {
    if (state.dirty && !await window.stopflowDialogs.confirm('Abandonner les modifications de droits non enregistrées ?')) return false;
    if (window.stopflowReservations?.confirmLeave && !await window.stopflowReservations.confirmLeave()) return false;
    state.dirty = false; return true;
  }
  async function rpc(name, args = {}) {
    if (!validEnvironment() || !client()) throw {code:'42501'};
    const result = await client().rpc(name, args);
    if (result.error) throw {code:result.error.code || 'NON_CONFIRME'};
    return result.data;
  }
  function notice(text, error=false) {
    state.message=text; state.error=error;
    const box=document.getElementById('sfPilotTeamStatus');
    if (box) {box.textContent=text; box.setAttribute('role', error?'alert':'status');}
  }
  function qr(url) {
    const code = window.qrcode(0, 'M'); code.addData(url, 'Byte'); code.make();
    return code.createSvgTag({cellSize:5,margin:20,scalable:true});
  }
  function showQR(kind) {
    if (kind === 'invite' && !state.context?.is_owner) return;
    const url = PUBLIC_ORIGIN + (kind === 'invite' ? '/?inscription=1' : '/');
    const dialog = document.createElement('dialog'); dialog.className='sfPilotDialog';
    dialog.innerHTML=`<h2>${kind==='invite'?'Inviter l’équipe':'Installer StopFlow Pilote'}</h2><div class="sfPilotQR">${qr(url)}</div><p>${kind==='invite'?'Scanner ouvre le formulaire. Aucun accès métier n’est accordé sans approbation de Quentin.':'Dans Safari : Partager → Sur l’écran d’accueil → Ajouter.'}</p><p class="sfPilotUrl">${esc(url)}</p><button type="button" class="btn primary">Fermer</button>`;
    dialog.querySelector('button').onclick=()=>dialog.close(); dialog.onclose=()=>dialog.remove();
    document.body.appendChild(dialog); dialog.showModal();
  }
  function profile() {
    const dialog=document.createElement('dialog'); dialog.className='sfPilotDialog';
    const p=state.context?.profile || {};
    dialog.innerHTML=`<h2>Mon profil</h2><p>${esc([p.first,p.last].filter(Boolean).join(' '))}</p><p>${esc(p.role||'Employé')} · ${esc(LABELS[state.context?.status]||'En attente')}</p><p>Les habilitations sont décidées par Quentin. Elles sont vérifiées côté serveur.</p><button class="btn primary" type="button">Fermer</button>`;
    dialog.querySelector('button').onclick=()=>dialog.close(); dialog.onclose=()=>dialog.remove(); document.body.appendChild(dialog); dialog.showModal();
  }
  function toolbar() {
    const top=document.querySelector('#app .topbar');if(!bellObserver&&top&&typeof MutationObserver==='function'){bellObserver=new MutationObserver(()=>toolbar());bellObserver.observe(top,{childList:true});}
    if (!document.getElementById('sfPilotToolbar') && document.querySelector('#app main.main')) {
      const node=document.createElement('div'); node.id='sfPilotToolbar'; node.className='sfPilotToolbar';
      node.innerHTML='<button type="button" class="btn ghost sfPilotHome" data-pilot-action="home" aria-label="Accueil">⌂<span>Accueil</span></button><strong>StopFlow <small class="sfPilotDefaultLabel">Pilote</small><span class="sfPilotServiceLabel">Réservations</span></strong><div data-pilot-tools><button type="button" class="btn ghost sfPilotBack" data-pilot-action="back">Retour</button><details class="sfPilotMore"><summary aria-label="Plus d’actions">⋯</summary><div data-pilot-menu><button type="button" class="btn ghost" data-pilot-action="profile">Mon profil</button><button type="button" class="btn ghost sfPilotServiceOnly" style="display:none!important" data-pilot-action="service-closures">Fermetures par période</button><button type="button" class="btn ghost sfPilotServiceOnly" data-pilot-action="service-clients">Fiches clients</button><button type="button" class="btn ghost sfPilotServiceOnly sfPilotLegacyManage" data-pilot-action="service-manage">Salles et tables</button><button type="button" class="btn ghost sfPilotServiceOnly" data-pilot-action="service-establishment">Établissement</button><button type="button" class="btn ghost" data-pilot-action="install">Installer</button><button type="button" class="btn ghost" data-pilot-action="logout">Déconnexion</button></div></details></div>';
      document.querySelector('#app main.main').prepend(node);
    }
    const bar=document.getElementById('sfPilotToolbar');const tools=bar?.querySelector('[data-pilot-tools]')||bar?.querySelector('div'),menu=bar?.querySelector('[data-pilot-menu]')||tools;const bell=document.getElementById('sf80NotificationBellDesktop');if(tools&&bell&&bell.parentElement!==tools)tools.prepend(bell);
    const closureMenu=menu?.querySelector('[data-pilot-action=service-closures]');if(closureMenu){if(window.stopflowService?.canManageClosures?.())closureMenu.style.removeProperty('display');else closureMenu.style.setProperty('display','none','important');}
    let teamButton=document.getElementById('sfPilotTeamButton');
    if(tools && state.context?.is_owner) {
      if(!teamButton){teamButton=document.createElement('button');teamButton.id='sfPilotTeamButton';teamButton.className='btn ghost';teamButton.dataset.pilotAction='team';menu.appendChild(teamButton);}
      teamButton.textContent='Équipe'+(state.context.pending_count?' · '+state.context.pending_count+' en attente':'');
    } else teamButton?.remove();
    document.querySelectorAll('[data-sf70-card="users"]').forEach(button => {
      const title=button.querySelector('.sf70-card-title');
      const label='Équipe' + (state.context?.pending_count ? ' · '+state.context.pending_count+' en attente' : '');
      if (title && title.textContent!==label) title.textContent=label;
    });
  }
  function ensureGate() {
    if (!gate) {gate=document.createElement('section'); gate.id='sfPilotGate'; gate.className='sfPilotGate hidden'; document.body.appendChild(gate);}
    return gate;
  }
  function gateMessage(text, error=false) {
    const node=ensureGate().querySelector('[data-gate-status]');
    if (node) {node.textContent=text; node.setAttribute('role',error?'alert':'status');}
  }
  function entry(mode) {
    document.body.dataset.pilotEntry=mode;
    document.getElementById('app')?.classList.add('hidden');
    document.getElementById('login')?.classList.add('hidden');
    const node=ensureGate(); node.classList.remove('hidden');
    if (mode==='activation') {
      node.innerHTML='<div class="card"><h1>Activer mon compte StopFlow Pilote</h1><p>Choisissez votre mot de passe privé. Il n’est ni enregistré dans le code ni communiqué à l’équipe.</p><form id="sfPilotActivation"><label>Mot de passe<input class="input" name="password" type="password" autocomplete="new-password" minlength="12" required></label><label>Confirmer le mot de passe<input class="input" name="confirmation" type="password" autocomplete="new-password" minlength="12" required></label><p data-gate-status role="status"></p><button class="btn primary" type="submit">Activer mon compte</button></form></div>';
    } else if (mode==='signup') {
      node.innerHTML='<div class="card"><h1>Rejoindre StopFlow Pilote</h1><p>Votre demande sera examinée par Quentin. Scanner ce QR code ne donne aucun accès aux données métier.</p><form id="sfPilotSignup"><label>Prénom<input class="input" name="first" autocomplete="given-name" maxlength="80" required></label><label>Nom<input class="input" name="last" autocomplete="family-name" maxlength="100" required></label><label>E-mail<input class="input" name="email" type="email" autocomplete="email" maxlength="254" required></label><label>Créer mon mot de passe<input class="input" name="password" type="password" autocomplete="new-password" minlength="12" required></label><p data-gate-status role="status"></p><button class="btn primary" type="submit">Envoyer ma demande</button></form><button class="btn ghost" data-pilot-action="login">J’ai déjà un compte</button></div>';
    } else {
      const status=state.context?.status || 'pending';
      node.innerHTML=`<div class="card"><h1>${esc(LABELS[status]||'Inscription en attente')}</h1><p>${status==='rejected'?'Votre demande a été refusée par Quentin.':status==='revoked'?'Vos accès ont été retirés.':'Votre compte ne peut pas consulter les données métier avant l’approbation de Quentin.'}</p>${status==='unregistered'?'<form id="sfPilotRequest"><label>Prénom<input class="input" name="first" maxlength="80" required></label><label>Nom<input class="input" name="last" maxlength="100" required></label><button class="btn primary" type="submit">Soumettre ma demande</button></form>':''}<p data-gate-status role="status"></p><button class="btn ghost" data-pilot-action="refresh-account">Vérifier mon statut</button><button class="btn ghost" data-pilot-action="gate-logout">Déconnexion</button></div>`;
    }
  }
  async function context() {const value=await rpc('pilot_team_context'); state.context=value; return value;}
  function selectedRow() {return (state.context?.requests||[]).find(x=>x.profile_id===state.selected);}
  function checked(value) {return value?' checked':'';}
  function renderTeam() {
    const node=document.getElementById('sfPilotTeam'); if (!node) return;
    if (!state.context?.is_owner) {node.innerHTML='<h2>Équipe</h2><p>Cette page est réservée à Quentin.</p>'; return;}
    const rows=state.context.requests||[], row=selectedRow();
    const permitted=new Set((row?.permissions||[]).map(x=>x.permission_key+'|'+x.scope));
    node.innerHTML=`<div class="sfPilotHeading"><div><h1>Équipe</h1><p>${state.context.pending_count||0} demande(s) en attente</p></div><div><button class="btn primary" data-pilot-action="invite">Inviter l’équipe</button><button class="btn ghost" data-pilot-action="refresh-team">Actualiser</button></div></div><p id="sfPilotTeamStatus" role="status">${esc(state.message)}</p><div class="sfPilotTeamGrid"><div class="card"><h2>Demandes et accès</h2>${rows.length?rows.map(x=>`<button class="sfPilotPerson" data-pilot-person="${esc(x.profile_id)}"><strong>${esc(x.first)} ${esc(x.last)}</strong><span>${esc(x.email)}</span><b>${esc(LABELS[x.status])}</b></button>`).join(''):'<p>Aucune demande pour le moment. Le QR code permet de s’inscrire.</p>'}</div><div>${row?`<form id="sfPilotReview" class="card"><fieldset ${state.busy||state.uncertain?'disabled':''}><legend>Accès de ${esc(row.first)} ${esc(row.last)}</legend><label>Profil<select class="input" name="role"><option value="employe" ${row.role==='employe'?'selected':''}>Employé</option><option value="responsable" ${row.role==='responsable'?'selected':''}>Responsable</option></select></label><p>Aucun droit Administrateur n’est attribué par ce formulaire.</p><div class="sfPilotPermissionGrid">${GROUPS.map(([label,scope,items])=>`<section><h3>${esc(label)}</h3>${items.map(([key,title])=>`<label class="sfPilotCheck"><input type="checkbox" data-pilot-permission="${esc(key)}" data-scope="${esc(scope)}"${checked(permitted.has(key+'|'+scope))}>${esc(title)}</label>`).join('')}</section>`).join('')}<section><h3>Réservations</h3>${RESERVATIONS.map(([key,title])=>`<label class="sfPilotCheck"><input type="checkbox" data-pilot-reservation="${key}"${checked(row.reservations?.[key])}>${esc(title)}</label>`).join('')}</section></div><div class="sfPilotDecisions"><button class="btn primary" type="submit">${row.status==='approved'?'Enregistrer les accès':'Accepter avec ces accès'}</button>${row.status!=='approved'?'<button class="btn ghost" type="button" data-pilot-action="reject">Refuser</button>':'<button class="btn danger" type="button" data-pilot-action="revoke">Retirer les accès</button>'}</div></fieldset></form>`:'<div class="card"><p>Sélectionnez une personne pour examiner sa demande ou modifier ses accès.</p></div>'}</div></div>`;
  }
  async function openTeam() {
    if (!state.context?.is_owner || !await leave()) return;
    let node=document.getElementById('sfPilotTeam');
    if (!node) {node=document.createElement('section'); node.id='sfPilotTeam'; node.className='page hidden'; document.querySelector('#app main.main').appendChild(node); try {STOPFLOW_STABLE_PAGES.add(node.id);} catch {}}
    page('sfPilotTeam'); if (document.getElementById('pageTitle')) document.getElementById('pageTitle').textContent='Général — Équipe';
    void refreshTeam();
  }
  async function refreshTeam() {
    if (state.busy) return;
    if (state.dirty && !state.uncertain && !await window.stopflowDialogs.confirm('Relire les droits enregistrés et abandonner les changements non enregistrés ?')) return;
    try {await context(); state.uncertain=false; state.dirty=false;
      if (!selectedRow()) state.selected=(state.context.requests||[]).find(x=>x.status==='pending')?.profile_id || state.context.requests?.[0]?.profile_id || '';
      renderTeam(); toolbar();
    } catch {notice('Lecture des demandes impossible. Aucun changement de droits confirmé.',true);}
  }
  function decisionPayload(decision) {
    const form=document.getElementById('sfPilotReview'), row=selectedRow();
    if (!form || !row) return null;
    const permissions=[...form.querySelectorAll('[data-pilot-permission]:checked')].map(x=>({permission_key:x.dataset.pilotPermission,scope:x.dataset.scope}));
    for (const [manage,view] of [['lunchs.manage','lunchs.view'],['monthly_suggestions.manage','monthly_suggestions.view']]) {
      if (permissions.some(x=>x.permission_key===manage) && !permissions.some(x=>x.permission_key===view)) permissions.push({permission_key:view,scope:'cuisine'});
    }
    const reservations=Object.fromEntries([...form.querySelectorAll('[data-pilot-reservation]')].map(x=>[x.dataset.pilotReservation,x.checked]));
    if (reservations.can_manage_bookings) reservations.can_view_bookings=true;
    if (reservations.can_view_bookings || reservations.can_manage_rooms || reservations.can_manage_tables || reservations.can_manage_layouts) reservations.can_view=true;
    return {p_profile:row.profile_id,p_version:row.version,p_decision:decision,p_role:form.elements.role.value,p_permissions:permissions,p_reservations:reservations};
  }
  async function review(decision) {
    if (state.busy || state.uncertain || !state.context?.is_owner) return;
    const args=decisionPayload(decision); if (!args) return;
    if (decision!=='approved' && !await window.stopflowDialogs.confirm(decision==='rejected'?'Refuser cette demande ?':'Retirer tous les accès de cette personne ?')) return;
    const actor=who();
    state.busy=true; notice('Enregistrement de la décision…');
    document.querySelector('#sfPilotReview fieldset')?.setAttribute('disabled','');
    try {const saved=await rpc('pilot_review_request',args);
      if (!saved || saved.version!==args.p_version+1) throw {code:'NON_CONFIRME'};
      if(who()!==actor)return;
      state.dirty=false; state.message='Décision enregistrée. Droits relus sur le serveur.'; await context(); renderTeam(); toolbar();
    } catch (error) {
      if(who()!==actor)return;
      state.uncertain=true;
      notice(error.code==='40001'?'Une autre décision a modifié cette demande. Votre sélection reste visible ; actualisez avant de décider.':'Résultat non confirmé. Votre sélection est conservée ; actualisez les demandes avant toute nouvelle décision.',true);
    } finally {state.busy=false;if(!state.uncertain)document.querySelector('#sfPilotReview fieldset')?.removeAttribute('disabled');}
  }
  async function refreshAccount() {
    if (!validEnvironment() || !client()) return;
    const value=await context(); toolbar();
    if (value.status!=='approved') {if (typeof session!=='undefined') session=null; window.stopflowReservations?.refreshAccess?.(); entry('pending');}
    return value;
  }
  async function submitEntry(event) {
    const form=event.target;
    if (!['sfPilotSignup','sfPilotActivation','sfPilotRequest'].includes(form.id)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (state.busy || !form.reportValidity()) return;
    if(!validEnvironment() || !client()){gateMessage('Connexion au pilote indisponible. Aucune inscription ni modification effectuée.',true);return;}
    state.busy=true; const button=form.querySelector('button[type="submit"]'); if(button)button.disabled=true;
    try {
      if (form.id==='sfPilotActivation') {
        if (!activation || form.elements.password.value!==form.elements.confirmation.value) throw {code:'PASSWORD_CONFIRMATION'};
        if (!activation.verifiedUser) {
          const verified=await client().auth.verifyOtp({token_hash:activation.hash,type:activation.type});
          if (verified.error || !verified.data?.user) throw {code:'ACTIVATION_INVALID'};
          activation.verifiedUser=verified.data.user;
        }
        const changed=await client().auth.updateUser({password:form.elements.password.value});
        if(changed.error)throw {code:'PASSWORD_INVALID'};
        await rpc('pilot_owner_activation_complete');
        const user=activation.verifiedUser;
        form.elements.password.value=''; form.elements.confirmation.value=''; activation=null;
        delete document.body.dataset.pilotEntry; gate?.classList.add('hidden'); await loadAuthenticatedProfile(user);
      } else if(form.id==='sfPilotSignup') {
        const first=form.elements.first.value.trim(), last=form.elements.last.value.trim();
        if(!first || !last){gateMessage('Complétez votre prénom et votre nom.',true);return;}
        const created=await client().auth.signUp({email:form.elements.email.value.trim(),password:form.elements.password.value,
          options:{data:{first_name:first,last_name:last},emailRedirectTo:PUBLIC_ORIGIN+'/?inscription=1'}});
        if(created.error)throw {code:'SIGNUP_REFUSED'};
        form.elements.password.value='';
        if(created.data?.session && created.data?.user) {
          await rpc('pilot_request_access',{p_first:first,p_last:last}); await refreshAccount();
        } else gateMessage('Confirmez votre adresse via le message Supabase, puis connectez-vous. Votre inscription ne donne aucun accès ; Quentin devra approuver la demande.');
      } else {
        await rpc('pilot_request_access',{p_first:form.elements.first.value.trim(),p_last:form.elements.last.value.trim()}); await refreshAccount();
      }
    } catch(error) {
      gateMessage(error.code==='PASSWORD_CONFIRMATION'?'Les deux mots de passe doivent être identiques.':
        error.code==='PASSWORD_INVALID'?'Le mot de passe a été refusé. Choisissez-en un autre.':
        error.code==='ACTIVATION_INVALID'?'Lien expiré ou déjà utilisé. Demandez une nouvelle activation privée.':
        error.code==='SIGNUP_REFUSED'?'Inscription non confirmée. Vérifiez l’adresse et les exigences du mot de passe ; aucun droit n’a été accordé.':
        'Action non confirmée. Aucun accès métier n’est accordé automatiquement.',true);
    } finally {state.busy=false; if(button)button.disabled=false;}
  }
  function install() {
    if (!validEnvironment() || typeof loadAuthenticatedProfile!=='function') {
      if(typeof window.stopflowPilotStart==='function')void window.stopflowPilotStart();
      return;
    }
    const original=loadAuthenticatedProfile;
    loadAuthenticatedProfile=async function(user) {
      const value=await context();
      if (value.status!=='approved') {
        if (typeof session!=='undefined') session=null;
        if (value.status==='activation_required') {activation={verifiedUser:user};entry('activation');return;}
        entry('pending');
        if (value.status==='unregistered') {
          const meta=user.user_metadata||{};
          const first=gate.querySelector('[name="first"]'), last=gate.querySelector('[name="last"]');
          if(first)first.value=meta.first_name||''; if(last)last.value=meta.last_name||'';
        }
        return;
      }
      delete document.body.dataset.pilotEntry; gate?.classList.add('hidden');
      const result=await original.apply(this,arguments); toolbar(); return result;
    };
    loaded=true;
    const params=new URLSearchParams(location.hash.slice(1));
    if(params.has('pilot_activation')) {
      const hash=params.get('pilot_activation'), type=params.get('type');
      history.replaceState(null,'',location.pathname+'#activation');
      if (/^[a-zA-Z0-9_-]{32,256}$/.test(hash||'') && ['invite','recovery'].includes(type)) {activation={hash,type}; entry('activation');}
      else {entry('activation'); gateMessage('Ce lien d’activation n’est pas valide.',true);}
    } else if(new URLSearchParams(location.search).get('inscription')==='1') {
      entry('signup');
      // If the email link restored a session, the existing bootstrap calls the wrapper above.
    }
    if (typeof page==='function') {
      const previous=page;
      page=function(){const value=previous.apply(this,arguments); toolbar(); return value;};
    }
    toolbar();
    if (activation) {
      if (!client()) {const button=gate?.querySelector('button[type="submit"]');if(button)button.disabled=true;void ensureSupabaseClient().then(()=>{if(button)button.disabled=false;}).catch(()=>gateMessage('Connexion indisponible. Rechargez le lien privé pour réessayer ; aucune activation effectuée.',true));}
    } else if (typeof window.stopflowPilotStart==='function') void window.stopflowPilotStart();
  }
  document.addEventListener('submit',event=>{
    if(event.target.id==='sfPilotReview'){event.preventDefault();event.stopImmediatePropagation();void review('approved');}
    else void submitEntry(event);
  },true);
  document.addEventListener('input',event=>{if(event.target.closest?.('#sfPilotReview'))state.dirty=true;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelector('#sfPilotToolbar details')?.removeAttribute('open');});
  document.addEventListener('click',async event=>{
    if(!event.target.closest?.('#sfPilotToolbar .sfPilotMore'))document.querySelector('#sfPilotToolbar details')?.removeAttribute('open');
    const team=event.target.closest?.('[data-sf70-card="users"]');
    if(team){event.preventDefault();event.stopImmediatePropagation();openTeam();return;}
    const person=event.target.closest?.('[data-pilot-person]');
    if(person){event.preventDefault();if(!state.dirty||await window.stopflowDialogs.confirm('Abandonner les changements non enregistrés ?')){state.selected=person.dataset.pilotPerson;state.dirty=false;state.message='';renderTeam();}return;}
    const action=event.target.closest?.('[data-pilot-action]')?.dataset.pilotAction; if(!action)return;
    event.preventDefault();event.stopImmediatePropagation();document.querySelector('#sfPilotToolbar details')?.removeAttribute('open');
    if(action==='home'&&await leave())window.stopflow070CardNavigation?.openHome();
    if(action==='back'&&await leave()){const contextual=window.stopflowHarmony?.backTarget?.();if(contextual)contextual.click();else window.stopflow070BackNavigation?.back();}
    if(action==='service-closures')void window.stopflowService?.openClosures?.();if(action==='service-clients')void window.stopflowService?.openClients?.();if(action==='service-manage'&&await leave())document.querySelector('#sf91Reservations [data-action=manage]')?.click();if(action==='service-establishment'){const f=document.querySelector('#sf91Reservations .sf91-filters');f?.classList.toggle('sf93-show-establishment');}if(action==='profile')profile();
    if(action==='install')showQR('install');
    if(action==='invite')showQR('invite');
    if(action==='team')openTeam();
    if(action==='refresh-team')void refreshTeam();
    if(action==='reject')void review('rejected');
    if(action==='revoke')void review('revoked');
    if(action==='logout'&&await leave())document.getElementById('logout')?.click();
    if(action==='gate-logout'){void client()?.auth.signOut().then(()=>{location.href=PUBLIC_ORIGIN+'/';});}
    if(action==='login'){delete document.body.dataset.pilotEntry;gate?.classList.add('hidden');history.replaceState(null,'',location.pathname);showLogin();}
    if(action==='refresh-account'){void refreshAccount().then(async value=>{if(value?.status==='approved'){const u=await client().auth.getUser();if(u.data?.user)await loadAuthenticatedProfile(u.data.user);}}).catch(()=>gateMessage('Statut non confirmé. Réessayez plus tard.',true));}
  },true);
  window.addEventListener('focus',()=>{if(loaded&&who()&&!state.busy&&!hasDraft())void refreshAccount().catch(()=>{});});
  window.addEventListener('beforeunload',event=>{if(state.dirty||state.uncertain){event.preventDefault();event.returnValue='';}});
  window.stopflowPilotTeam=Object.freeze({active:true,open:openTeam,refresh:refreshAccount,publicOrigin:PUBLIC_ORIGIN});
  install();
})();
