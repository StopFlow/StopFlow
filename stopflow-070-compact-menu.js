/* StopFlow 0.7.0 — menu mobile compact pour la navigation par grandes zones. */
(function(){
  if(window.stopflow070CompactMenu)return;
  window.stopflow070CompactMenu=true;

  const style=document.createElement('style');
  style.id='stopflow070CompactMenuStyles';
  style.textContent=`
    @media screen and (max-width:950px){
      .sf70-simple-mobile{
        display:grid!important;
        gap:1px!important;
        padding:3px 0!important;
      }
      .sf70-simple-mobile .sf52-nav-home{
        min-height:34px!important;
        padding:7px 9px!important;
        gap:7px!important;
        border-radius:7px!important;
        font-size:12px!important;
        line-height:1.1!important;
        font-weight:760!important;
      }
      .sf70-simple-mobile .sf52-nav-home>span:first-child{
        width:20px!important;
        min-width:20px!important;
        display:inline-grid!important;
        place-items:center!important;
        font-size:14px!important;
        line-height:1!important;
      }
      .sf70-simple-mobile .sf52-nav-home>span:nth-child(2){
        min-width:0!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      .sf70-simple-mobile .sf52-nav-home.active{
        background:#2463eb!important;
        color:#fff!important;
      }
      .sf52-drawer-scroll:has(.sf70-simple-mobile){
        padding-top:6px!important;
      }
    }
    @media screen and (max-width:420px){
      .sf70-simple-mobile .sf52-nav-home{
        min-height:32px!important;
        padding:6px 8px!important;
      }
    }
  `;
  document.head.appendChild(style);
})();
