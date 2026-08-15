/* StopFlow 0.8.0 — ergonomie Utilisateurs / Profils / Permissions sans modifier les droits. */
(function(){
  if(window.stopflow080UsersUx?.active)return;

  function injectStyles(){
    if(document.getElementById('stopflow080UsersUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080UsersUxStyles';
    style.textContent=`
      #users{max-width:1120px}
      #users > .card{margin-top:0}
      #users .sf70-user-permission-summary{line-height:1.3}

      @media(max-width:720px){
        #users{padding-bottom:84px}
        #users > .card{padding:15px}
        #users > .card > .flex.between{
          display:grid!important;
          grid-template-columns:1fr!important;
          align-items:start!important;
          gap:12px!important;
        }
        #users > .card > .flex.between h2{font-size:20px;line-height:1.2}
        #users > .card > .flex.between p{font-size:13px;line-height:1.4;margin:4px 0 0}
        #users #addUser{width:100%!important;min-height:48px!important}
        #users .kpis{
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          gap:8px!important;
          margin:12px 0!important;
        }
        #users .kpi{padding:10px 8px!important}
        #users .kpi span{font-size:11px;line-height:1.2}
        #users .kpi strong{font-size:22px;margin-top:4px}
        #users #userSearch{font-size:16px;min-height:46px;width:100%}
        #users table[data-sf73-mobile-layout="cards"] tbody>tr{padding:3px 12px!important}
        #users table[data-sf73-mobile-layout="cards"] tbody>tr>td{
          grid-template-columns:minmax(88px,32%) minmax(0,1fr)!important;
          gap:8px!important;
          padding:9px 0!important;
        }
        #users table[data-sf73-mobile-layout="cards"] .btn{min-height:44px!important;width:100%!important}
        #users .notice{font-size:12px;line-height:1.4}

        /* Création / édition utilisateur */
        #modalBox:has(#newUserFirstName),
        #modalBox:has(#editUserFirstName){padding:16px!important}
        #modalBox:has(#newUserFirstName) > .flex.between,
        #modalBox:has(#editUserFirstName) > .flex.between{
          display:grid!important;
          grid-template-columns:1fr!important;
          gap:10px!important;
          align-items:start!important;
        }
        #modalBox:has(#newUserFirstName) > .flex.between > .btn,
        #modalBox:has(#editUserFirstName) > .flex.between > .btn{width:100%!important}
        #modalBox:has(#newUserFirstName) .filters,
        #modalBox:has(#editUserFirstName) .filters{
          grid-template-columns:1fr!important;
          gap:10px!important;
        }
        #modalBox:has(#newUserFirstName) .input,
        #modalBox:has(#editUserFirstName) .input{
          width:100%!important;
          min-height:46px!important;
          font-size:16px!important;
        }
        #modalBox:has(#newUserFirstName) .field > .flex,
        #modalBox:has(#editUserFirstName) .field > .flex,
        #modalBox #sf70PasswordReset .field > .flex{
          display:grid!important;
          grid-template-columns:1fr!important;
          gap:8px!important;
          width:100%!important;
        }
        #modalBox:has(#newUserFirstName) #generateUserPassword,
        #modalBox #sf70PasswordReset .btn{width:100%!important;min-height:44px!important}
        #modalBox:has(#newUserFirstName) #createUserButton,
        #modalBox:has(#editUserFirstName) #saveUserButton,
        #modalBox #deleteUserButton{
          width:100%!important;
          min-height:48px!important;
        }
        #modalBox #createdTemporaryPassword{display:block;width:100%;font-size:15px!important;overflow-wrap:anywhere}
        #modalBox #createdTemporaryPassword + .btn{width:100%!important;margin-top:8px}

        /* Permissions : une colonne claire, interrupteurs plus faciles à toucher */
        .sf70-permissions-modal{width:100%!important;padding:15px!important}
        .sf70-permission-head{align-items:flex-start!important;margin-top:14px!important}
        .sf70-permission-head > *{min-width:0}
        .sf70-permission-grid{grid-template-columns:1fr!important;gap:10px!important;margin-top:10px!important}
        .sf70-permission-section{border-radius:13px!important}
        .sf70-permission-section h3{padding:11px 12px!important;font-size:15px!important}
        .sf70-permission-list{padding:4px 8px!important}
        .sf70-switch-row{min-height:50px!important;padding:9px 4px!important;gap:11px!important}
        .sf70-switch-row.sf70-child{margin-left:14px!important;font-size:13px!important}
        .sf70-switch{width:48px!important;height:28px!important;flex-basis:48px!important}
        .sf70-track{border-radius:999px!important}
        .sf70-thumb{width:20px!important;height:20px!important;top:4px!important;left:4px!important}
        .sf70-switch input:checked~.sf70-thumb{transform:translateX(20px)!important}
        .sf70-switch-label{font-size:14px;line-height:1.3;overflow-wrap:anywhere}
        .sf70-scope-group{padding:9px 4px!important}
        .sf70-scope-title{font-size:14px;margin-bottom:5px!important}
        .sf70-scope-list{grid-template-columns:1fr!important;gap:0!important}
        .sf70-scope-list .sf70-switch-row{min-height:46px!important;padding:7px 0!important}
        .sf70-admin-access{padding:13px!important;font-size:13px;line-height:1.45}
        .sf70-status-row{min-height:50px!important}
        #sf70PasswordReset,#sf70DeleteUser{margin-top:16px!important;padding-top:14px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function applyHints(){
    document.querySelectorAll('#userSearch,#newUserFirstName,#newUserLastName,#editUserFirstName,#editUserLastName').forEach(field=>{
      if(!field.getAttribute('enterkeyhint'))field.setAttribute('enterkeyhint','next');
    });
    document.querySelectorAll('#newUserEmail').forEach(field=>field.setAttribute('inputmode','email'));
  }

  function refresh(){
    injectStyles();
    applyHints();
  }

  window.stopflow080UsersUx={active:true,version:'0.8.0',refresh};
  refresh();
  [100,300,800,1600,3000].forEach(delay=>setTimeout(refresh,delay));
})();
