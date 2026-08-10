/* StopFlow 0.7.0 — harmonise les interactions tactiles des sous-pages avec l'Accueil. */
(function(){
  if(window.stopflow070MobileSubpageTouchFix)return;
  window.stopflow070MobileSubpageTouchFix=true;

  const MOVE_THRESHOLD=5;
  const SCROLL_THRESHOLD=1;
  const state={gesture:null,syntheticButton:null,suppressButton:null,suppressUntil:0};
  const isMobile=()=>window.matchMedia?.('(max-width: 950px)').matches===true;

  const actionButton=event=>event.target.closest?.('#sf70TemperatureV3 [data-tv3-action]')||null;
  const temperatureCard=event=>event.target.closest?.('#sf70ZonePage .sf70-action-card[data-sf70-card="temperatures.use"]')||null;

  /*
   * La carte Températures possède encore un ancien pont V3 qui agit au pointerdown
   * dans #app. Sur mobile, le propriétaire global des cartes 0.7.0 doit être le seul
   * à décider si le geste est un tap ou un scroll. On laisse donc son listener
   * document s'exécuter, puis on empêche seulement la propagation vers l'ancien pont.
   */
  document.addEventListener('pointerdown',event=>{
    if(!isMobile())return;
    if(temperatureCard(event))event.stopPropagation();
  },true);

  /* Les boutons internes Températures V3 ne doivent plus agir dès le contact. */
  document.addEventListener('pointerdown',event=>{
    if(!isMobile()||(event.button!=null&&event.button!==0))return;
    const button=actionButton(event);
    if(!button)return;

    state.gesture={
      button,
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      startScrollX:window.scrollX,
      startScrollY:window.scrollY,
      moved:false,
      startedAt:Date.now()
    };

    /* Autorise le scroll natif mais bloque le handler pointerdown de V3 situé plus bas. */
    event.stopPropagation();
  },true);

  document.addEventListener('pointermove',event=>{
    const g=state.gesture;
    if(!g||g.pointerId!==event.pointerId)return;
    const dx=event.clientX-g.startX;
    const dy=event.clientY-g.startY;
    if(Math.hypot(dx,dy)>MOVE_THRESHOLD)g.moved=true;
    if(Math.abs(window.scrollX-g.startScrollX)>SCROLL_THRESHOLD||Math.abs(window.scrollY-g.startScrollY)>SCROLL_THRESHOLD)g.moved=true;
  },true);

  document.addEventListener('touchmove',event=>{
    const g=state.gesture;
    if(!g||!event.touches?.length)return;
    const touch=event.touches[0];
    if(Math.hypot(touch.clientX-g.startX,touch.clientY-g.startY)>MOVE_THRESHOLD)g.moved=true;
  },{capture:true,passive:true});

  document.addEventListener('scroll',()=>{
    if(state.gesture)state.gesture.moved=true;
  },true);

  document.addEventListener('pointerup',event=>{
    const g=state.gesture;
    if(!g||g.pointerId!==event.pointerId)return;
    state.gesture=null;

    const dx=event.clientX-g.startX;
    const dy=event.clientY-g.startY;
    const pageMoved=Math.abs(window.scrollX-g.startScrollX)>SCROLL_THRESHOLD||Math.abs(window.scrollY-g.startScrollY)>SCROLL_THRESHOLD;
    const sameButton=g.button===actionButton(event)||g.button.contains(event.target);
    const tap=!g.moved&&Math.hypot(dx,dy)<=MOVE_THRESHOLD&&!pageMoved&&sameButton&&Date.now()-g.startedAt<1000;

    /* Empêche toujours le pointerup natif d'atteindre d'éventuelles anciennes couches. */
    event.stopPropagation();

    state.suppressButton=g.button;
    state.suppressUntil=Date.now()+900;

    if(!tap)return;

    /* Un click synthétique unique réutilise l'action V3 existante sans la dupliquer. */
    state.syntheticButton=g.button;
    g.button.click();
    state.syntheticButton=null;
  },true);

  document.addEventListener('pointercancel',event=>{
    const g=state.gesture;
    if(!g||g.pointerId!==event.pointerId)return;
    state.suppressButton=g.button;
    state.suppressUntil=Date.now()+900;
    state.gesture=null;
  },true);

  /* Laisse passer uniquement le click synthétique créé après un vrai tap. */
  document.addEventListener('click',event=>{
    if(!isMobile())return;
    const button=actionButton(event);
    if(!button)return;
    if(state.syntheticButton===button)return;

    if(state.suppressButton===button&&Date.now()<state.suppressUntil){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  },true);
})();
