/* StopFlow 0.8.0 — Accueil plus direct : 4 zones visibles, grille mobile 2×2. */
(function(){
  if(window.stopflow080HomeUx?.active)return;

  function injectStyles(){
    if(document.getElementById('stopflow080HomeUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080HomeUxStyles';
    style.textContent=`
      /* Accueil uniquement : ne modifie pas les cartes des sous-pages. */
      #sf70Home .sf70-home-intro{
        margin-bottom:16px;
        padding:16px 18px;
      }
      #sf70Home .sf70-card-grid{
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:16px;
      }
      #sf70Home .sf70-action-card{
        min-height:166px;
        padding:18px;
      }
      #sf70Home .sf70-card-icon{
        width:42px;
        height:42px;
        font-size:21px;
      }
      #sf70Home .sf70-card-title{
        font-size:17px;
        line-height:1.22;
      }

      @media(max-width:950px){
        #sf70Home .sf70-card-grid{
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:12px;
        }
        #sf70Home .sf70-action-card{
          min-height:136px;
        }
      }

      @media(max-width:620px){
        #sf70Home{
          padding-bottom:76px;
        }
        #sf70Home .sf70-home-intro{
          margin-bottom:12px;
          padding:12px 14px;
          border-radius:14px;
        }
        #sf70Home .sf70-home-intro h2{
          font-size:22px;
          margin-bottom:2px;
        }
        #sf70Home .sf70-home-intro p{
          font-size:13px;
          line-height:1.35;
        }
        #sf70Home .sf70-card-grid{
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          gap:10px;
        }
        #sf70Home .sf70-action-card{
          min-width:0;
          min-height:116px!important;
          padding:13px 12px 12px 14px;
          gap:7px;
          border-radius:15px;
        }
        #sf70Home .sf70-action-card:before{
          width:4px;
        }
        #sf70Home .sf70-card-icon{
          width:38px;
          height:38px;
          border-radius:10px;
          font-size:19px;
        }
        #sf70Home .sf70-card-title{
          font-size:15px;
          line-height:1.18;
          overflow-wrap:anywhere;
        }
        #sf70Home .sf70-card-description{
          display:none;
        }
        #sf70Home .sf70-card-meta{
          margin-top:auto;
          min-height:18px;
          justify-content:flex-end;
        }
        #sf70Home .sf70-card-meta > span:first-child{
          display:none;
        }
        #sf70Home .sf70-card-arrow{
          font-size:20px;
          line-height:1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function refresh(){
    injectStyles();
    const home=document.getElementById('sf70Home');
    if(home)home.dataset.sf80HomeUx='1';
  }

  window.stopflow080HomeUx={
    active:true,
    version:'0.8.0',
    refresh
  };

  refresh();
  [100,300,800,1600].forEach(delay=>setTimeout(refresh,delay));
})();
