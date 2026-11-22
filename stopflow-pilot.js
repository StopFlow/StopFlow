/* Pilot feedback uses the same verified development client, never a server key. */
(function () {
  'use strict';
  if (window.stopflowPilot?.active) return;
  const target = 'https://mmrdpyhoawwoplbzqwag.supabase.co';
  const storePrefix = 'stopflow-pilot-idea:';
  let busy = false;
  function identity() {
    return window.stopflowEnvironment?.environment === 'development' &&
      window.stopflowEnvironment?.supabaseUrl === target &&
      typeof session !== 'undefined' && session?.authMode === 'supabase' && session?.id ? session.id : '';
  }
  function status(form, text) {
    let box = form.querySelector('[data-pilot-idea-status]');
    if (!box) {
      box = document.createElement('p'); box.dataset.pilotIdeaStatus = '1';
      box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); form.appendChild(box);
    }
    box.textContent = text;
  }
  function payload(form) {
    return {p_title: form.querySelector('#sugTitle').value.trim(),
      p_description: form.querySelector('#sugDesc').value.trim(),
      p_category: form.querySelector('#sugCategory').value,
      p_priority: form.querySelector('#sugPriority').value};
  }
  async function submit(event) {
    const form = event.target;
    if (form.id !== 'suggestionForm') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (busy) return;
    const actor = identity();
    if (!actor || typeof supabaseClient === 'undefined') return status(form, 'Connectez-vous au pilote pour envoyer une idée.');
    if (!form.reportValidity()) return;
    const args = payload(form), key = storePrefix + actor;
    if (!args.p_title || !args.p_description) return status(form, 'Complétez le titre et la description.');
    let intent;
    try {
      intent = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (intent && JSON.stringify(intent.args) !== JSON.stringify(args))
        return status(form, 'Un envoi reste à vérifier. Reprenez les mêmes champs pour confirmer cet envoi avant une nouvelle idée. Votre saisie est conservée.');
      intent ||= {id: crypto.randomUUID(), args};
      sessionStorage.setItem(key, JSON.stringify(intent));
    } catch { return status(form, 'Le reçu local ne peut pas être conservé. Aucun envoi effectué.'); }
    busy = true;
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    status(form, 'Envoi en cours…');
    try {
      const response = await supabaseClient.rpc('pilot_share_idea', {p_id: intent.id, ...intent.args});
      if (response.error || response.data?.id !== intent.id) throw new Error('IDEA_NOT_CONFIRMED');
      const read = await supabaseClient.from('pilot_ideas').select('id,title,description,category,priority,created_at').eq('id', intent.id).single();
      if (read.error || read.data?.id !== intent.id) throw new Error('IDEA_READ_NOT_CONFIRMED');
      if (identity() !== actor) return;
      sessionStorage.removeItem(key);
      if (JSON.stringify(payload(form)) === JSON.stringify(intent.args)) form.reset();
      status(form, 'Idée partagée et relue sur le serveur du pilote.');
      window.dispatchEvent(new CustomEvent('stopflow-idea-saved'));
    } catch {
      if (identity() === actor) status(form, 'Envoi non confirmé. Votre saisie et le même reçu sont conservés ; réessayez à l’identique.');
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }
  // Capture prevents the legacy localStorage submit handler from reporting a false send.
  document.addEventListener('submit', submit, true);
  window.stopflowPilot = Object.freeze({active: true, target});
})();
