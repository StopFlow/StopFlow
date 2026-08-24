/* StopFlow 0.8.0 — interaction fiable des cases Checklist sur mobile, native sur PC. */
(function(){
  if(window.stopflow080ChecklistInputFix?.active)return;

  const state={observer:null};
  const isMobile=()=>window.matchMedia?.('(max-width:950px)').matches===true;

  function injectStyles(){
    if(document.getElementById('stopflow080ChecklistInputFixStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080ChecklistInputFixStyles';
    style.textContent=`
      #checklistRunner .checklist-item-main{cursor:pointer;min-width:0}
      #checklistRunner .checklist-item-main input[type="checkbox"]{
        width:24px!important;height:24px!important;min-width:24px!important;min-height:24px!important;
        margin:0!important;flex:0 0 24px!important;accent-color:#2463eb;cursor:pointer
      }
      #checklistRunner .checklist-item-main:has(input[type="checkbox"]:focus-visible){
        outline:3px solid #dce8ff;outline-offset:3px;border-radius:8px
      }
      @media(max-width:950px){
        #checklistRunner .checklist-item-main{align-items:flex-start!important;gap:12px!important;padding:2px 0;touch-action:pan-y}
        #checklistRunner .checklist-item-main input[type="checkbox"]{
          width:30px!important;height:30px!important;min-width:30px!important;min-height:30px!important;
          flex-basis:30px!important;touch-action:none!important
        }
        #checklistRunner .checklist-item-label{display:inline-block;padding-top:4px;font-size:16px!important;line-height:1.3!important}
        #checklistRunner .checklist-item.done{background:#fbfffc!important}
      }
    `;
    document.head.appendChild(style);
  }

  function dispatchChange(input){
    input.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function bindInput(input){
    if(!input||input.dataset.sf80ChecklistInput==='1')return;
    input.dataset.sf80ChecklistInput='1';
    input.setAttribute('aria-label',input.closest('.checklist-item')?.querySelector('.checklist-item-label')?.textContent?.trim()||'Tâche checklist');

    let gesture=null;
    let suppressUntil=0;

    input.addEventListener('pointerdown',event=>{
      if(!isMobile()||input.disabled||(event.button!=null&&event.button!==0))return;
      gesture={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
    });
    input.addEventListener('pointermove',event=>{
      if(!gesture||gesture.id!==event.pointerId)return;
      if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>9)gesture.moved=true;
    });
    input.addEventListener('pointerup',event=>{
      if(!isMobile()||!gesture||gesture.id!==event.pointerId||input.disabled)return;
      const tap=!gesture.moved&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<=9;
      gesture=null;
      if(!tap)return;
      event.preventDefault();
      event.stopPropagation();
      suppressUntil=Date.now()+700;
      input.checked=!input.checked;
      dispatchChange(input);
    });
    input.addEventListener('pointercancel',()=>{gesture=null});
    input.addEventListener('click',event=>{
      if(isMobile()&&Date.now()<suppressUntil){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    },true);
  }

  function bindMain(main){
    if(!main||main.dataset.sf80ChecklistMain==='1')return;
    main.dataset.sf80ChecklistMain='1';
    main.addEventListener('click',event=>{
      const input=main.querySelector('input[type="checkbox"][data-run-check]');
      if(!input||input.disabled||event.target===input)return;
      if(isMobile())return;
      event.preventDefault();
      input.click();
    });
  }

  function enhance(){
    injectStyles();
    const runner=document.getElementById('checklistRunner');
    if(!runner)return;
    runner.querySelectorAll('input[type="checkbox"][data-run-check]').forEach(bindInput);
    runner.querySelectorAll('.checklist-item-main').forEach(bindMain);
  }

  function installObserver(){
    const page=document.getElementById('checklists');
    if(!page||state.observer)return false;
    state.observer=new MutationObserver(()=>requestAnimationFrame(enhance));
    state.observer.observe(page,{subtree:true,childList:true});
    return true;
  }

  function install(){
    enhance();
    installObserver();
  }

  window.stopflow080ChecklistInputFix={active:true,version:'0.8.0',refresh:enhance};
  [0,150,450,1000,2200].forEach(delay=>setTimeout(install,delay));
})();
