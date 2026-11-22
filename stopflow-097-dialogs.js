/* Explicit asynchronous confirmations. Never replaces window.confirm. */
(function(){'use strict';
 if(window.stopflowDialogs)return;
 let active=null;
 function confirm(message,options={}){
  if(active)return Promise.resolve(false);
  const previous=document.activeElement,dialog=document.createElement('dialog');
  dialog.className='sf97-dialog';dialog.setAttribute('aria-labelledby','sf97-title');
  const heading=document.createElement('h2');heading.id='sf97-title';heading.textContent=options.title||'Confirmer cette action';
  const text=document.createElement('p');text.textContent=message;
  const actions=document.createElement('div');actions.className='sf97-actions';
  const cancel=document.createElement('button'),accept=document.createElement('button');
  cancel.type=accept.type='button';cancel.className='btn';accept.className='btn '+(options.destructive?'danger':'primary');
  cancel.textContent=options.cancel||'Annuler';accept.textContent=options.accept||'Confirmer';
  cancel.dataset.dialogCancel='';accept.dataset.dialogAccept='';actions.append(cancel,accept);dialog.append(heading,text,actions);
  return new Promise(resolve=>{let settled=false;const finish=value=>{if(settled)return;settled=true;active=null;dialog.remove();if(previous?.isConnected)previous.focus();resolve(value);};
   active=dialog;cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);
   dialog.oncancel=event=>{event.preventDefault();finish(false);};dialog.onclose=()=>finish(false);
   dialog.onclick=event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)finish(false);}};
   document.body.appendChild(dialog);try{dialog.showModal();cancel.focus();}catch{finish(false);}
  });
 }
 window.stopflowDialogs=Object.freeze({confirm});
})();
