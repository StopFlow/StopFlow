/* StopFlow 0.7.0 — conserver la navigation 0.7.0 face aux reconstructions héritées 0.6.0. */
(function(){
  if(window.stopflow070MenuEnforcer)return;
  window.stopflow070MenuEnforcer=true;

  let refreshTimer=null;
  const api=()=>window.stopflow070CardNavigation;

  function legacyMenuPresent(){
    return Boolean(
      document.querySelector('#sf52DrawerContent .sf52-nav-group') ||
      document.querySelector('#sf53DesktopNav .sf53-group')
    );
  }

  function enforceSoon(delay=0){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>{
      const navigation=api();
      if(!navigation?.active||typeof navigation.refreshMenus!=="function")return;
      if(legacyMenuPresent() ||
         !document.querySelector('#sf52DrawerContent.sf70-simple-mobile') ||
         !document.querySelector('#sf53DesktopNav.sf70-simple-nav')){
        navigation.refreshMenus();
      }
    },delay);
  }

  function observeContainer(node){
    if(!node||node.dataset.sf70MenuEnforcer==='1')return;
    node.dataset.sf70MenuEnforcer='1';
    const observer=new MutationObserver(()=>{
      if(legacyMenuPresent())enforceSoon(0);
    });
    observer.observe(node,{childList:true,subtree:true});
  }

  function attach(){
    observeContainer(document.getElementById('sf52DrawerContent'));
    observeContainer(document.getElementById('sf53DesktopNav'));
    enforceSoon(0);
  }

  let attempts=0;
  const timer=setInterval(()=>{
    attach();
    attempts+=1;
    if(attempts>=40 || (document.getElementById('sf52DrawerContent')&&document.getElementById('sf53DesktopNav'))){
      clearInterval(timer);
    }
  },100);

  [0,120,350,800,1400,2400].forEach(delay=>setTimeout(attach,delay));

  const style=document.createElement('style');
  style.id='stopflow070MenuEnforcerStyles';
  style.textContent=`
    @media screen and (max-width:950px){
      #sf52DrawerContent.sf70-simple-mobile{
        display:grid!important;
        align-content:start!important;
        gap:1px!important;
        padding:5px 0!important;
      }
      #sf52DrawerContent.sf70-simple-mobile>.sf52-nav-home{
        display:grid!important;
        grid-template-columns:22px minmax(0,1fr)!important;
        align-items:center!important;
        min-height:34px!important;
        height:34px!important;
        margin:0!important;
        padding:6px 9px!important;
        gap:7px!important;
        border-radius:7px!important;
        font-size:12px!important;
        line-height:1!important;
      }
      #sf52DrawerContent.sf70-simple-mobile>.sf52-nav-home>span:first-child{
        width:20px!important;
        min-width:20px!important;
        text-align:center!important;
        font-size:13px!important;
      }
      #sf52DrawerContent.sf70-simple-mobile>.sf52-nav-home>span:nth-child(2){
        white-space:nowrap!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
      }
    }
  `;
  document.head.appendChild(style);
})();
