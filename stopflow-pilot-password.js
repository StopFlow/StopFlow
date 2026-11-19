/* No storage, logging or form submission. Native input/autofill is preserved. */
(function(){'use strict';
 const input=document.getElementById('password');if(!input||document.getElementById('sfPilotPasswordToggle'))return;
 const wrap=document.createElement('div');wrap.className='sfPilotPassword';input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);
 const button=document.createElement('button');button.id='sfPilotPasswordToggle';button.type='button';button.className='sfPilotPasswordToggle';
 function paint(){const visible=input.type==='text';button.innerHTML='<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(visible?'<path d="M3 3l18 18"/>':'')+'</svg>';button.setAttribute('aria-label',visible?'Masquer le mot de passe':'Afficher le mot de passe');button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-controls',input.id);button.title=visible?'Masquer le mot de passe':'Afficher le mot de passe';}
 input.type='password';paint();wrap.appendChild(button);button.addEventListener('click',()=>{const start=input.selectionStart,end=input.selectionEnd;input.type=input.type==='password'?'text':'password';paint();try{input.setSelectionRange(start,end);}catch{}});
 document.getElementById('loginForm')?.addEventListener('submit',()=>{input.type='password';paint();});
})();
