/* StopFlow 0.7.0 — fiabilise les interactions de la page Températures. */
(function(){
  if(window.stopflow070TemperatureClickFix)return;
  window.stopflow070TemperatureClickFix=true;

  const S=window.SF54;
  if(!S)return;
  let lastTab={view:'',at:0};

  function currentPageId(){
    return document.querySelector('#app .page:not(.hidden)')?.id||'';
  }

  function stabilizeRender(){
    if(typeof S.render!=='function'||S.render.sf70TemperatureStable)return;
    const previous=S.render;
    const wrapped=function(){
      if(currentPageId()==='sf54Temperatures'&&document.getElementById('sf70TemperatureBody'))return;
      return previous.apply(this,arguments);
    };
    wrapped.sf70TemperatureStable=true;
    S.render=wrapped;
  }

  function activateTab(view){
    const module=window.stopflow070TemperatureRefactor;
    if(!module?.active||!module.state)return;
    module.state.view=view;
    const page=document.getElementById('sf54Temperatures');
    page?.querySelectorAll('[data-temp-view]').forEach(button=>button.classList.toggle('active',button.dataset.tempView===view));
    Promise.resolve(module.open?.()).catch(error=>console.warn('StopFlow 0.7.0 — changement onglet températures',error));
  }

  function bindPage(){
    const page=document.getElementById('sf54Temperatures');
    if(!page||page.dataset.sf70TemperatureClickFix==='1')return;
    page.dataset.sf70TemperatureClickFix='1';
    page.style.pointerEvents='auto';

    page.addEventListener('pointerdown',event=>{
      if(event.button!=null&&event.button!==0)return;
      const target=event.target?.nodeType===1?event.target:event.target?.parentElement;
      const button=target?.closest?.('[data-temp-view]');
      if(!button||!page.contains(button))return;
      const view=button.dataset.tempView||'';
      if(!view)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      lastTab={view,at:Date.now()};
      activateTab(view);
    },true);

    page.addEventListener('click',event=>{
      const target=event.target?.nodeType===1?event.target:event.target?.parentElement;
      const button=target?.closest?.('[data-temp-view]');
      if(!button||!page.contains(button))return;
      const view=button.dataset.tempView||'';
      const duplicate=lastTab.view===view&&Date.now()-lastTab.at<800;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(!duplicate)activateTab(view);
    },true);
  }

  function injectStyles(){
    if(document.getElementById('stopflow070TemperatureClickFixStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow070TemperatureClickFixStyles';
    style.textContent=`
      #sf54Temperatures,#sf54Temperatures .sf70-temp-tabs,#sf54Temperatures .sf70-temp-tab,#sf54Temperatures #sf70TemperatureBody{pointer-events:auto!important}
      #sf54Temperatures .sf70-temp-tab{touch-action:manipulation!important;-webkit-user-select:none!important;user-select:none!important}
    `;
    document.head.appendChild(style);
  }

  function apply(){
    stabilizeRender();
    injectStyles();
    bindPage();
  }

  let attempts=0;
  const timer=setInterval(()=>{
    apply();
    attempts+=1;
    if(attempts>=40||(window.stopflow070TemperatureRefactor?.active&&document.getElementById('sf54Temperatures'))){clearInterval(timer);apply()}
  },100);
  [0,120,350,800,1600].forEach(delay=>setTimeout(apply,delay));
})();
