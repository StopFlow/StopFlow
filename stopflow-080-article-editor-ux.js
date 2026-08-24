/* StopFlow 0.8.0 — création/modification d'article pensée mobile, cohérente sur PC. */
(function(){
  if(window.stopflow080ArticleEditorUx?.active)return;

  const QUICK_UNITS=['bouteille','casier','carton','pack','fût 20 L','kg'];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let installed=false;

  function injectStyles(){
    if(document.getElementById('stopflow080ArticleEditorUxStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080ArticleEditorUxStyles';
    style.textContent=`
      #modalBox[data-sf80-article-editor="1"]{width:min(680px,100%)!important;padding:0!important;overflow:auto!important}
      .sf80-article-editor{display:flex;flex-direction:column;min-height:0;background:#fff}
      .sf80-article-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 20px 14px;border-bottom:1px solid #e5ebf2;background:#fff}
      .sf80-article-editor-head h2{margin:0 0 4px;font-size:22px;line-height:1.2}
      .sf80-article-editor-head p{margin:0;color:#68778b;font-size:12px;line-height:1.4}
      .sf80-article-editor-body{display:grid;gap:12px;padding:16px 20px 18px}
      .sf80-article-block{padding:14px;border:1px solid #dfe7f0;border-radius:13px;background:#fbfcfe}
      .sf80-article-block-title{margin:0 0 11px;font-size:13px;font-weight:900;color:#314961}
      .sf80-article-fields{display:grid;grid-template-columns:1fr 1fr;gap:11px}
      .sf80-article-fields.one{grid-template-columns:1fr}
      .sf80-article-editor .field{gap:6px;margin:0!important}
      .sf80-article-editor .field label{font-size:12px;font-weight:850;color:#3b5066}
      .sf80-article-editor .input{width:100%!important;min-height:48px;font-size:16px!important;background:#fff}
      .sf80-article-editor #mName{font-size:17px!important;font-weight:750}
      .sf80-article-helper{margin-top:6px;color:#7b8796;font-size:10.5px;line-height:1.4}
      .sf80-unit-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      .sf80-unit-chip{min-height:34px;padding:6px 9px;border:1px solid #d8e2ee;border-radius:999px;background:#fff;color:#405873;font-size:11px;font-weight:800}
      .sf80-unit-chip.active{border-color:#8eb2ec;background:#edf4ff;color:#245fc8}
      .sf80-article-editor-actions{position:sticky;z-index:3;bottom:0;display:grid;grid-template-columns:1fr 1.45fr;gap:9px;padding:13px 20px calc(13px + env(safe-area-inset-bottom));border-top:1px solid #e4eaf1;background:rgba(255,255,255,.98);backdrop-filter:blur(10px)}
      .sf80-article-editor-actions .btn{min-height:49px}
      #modalBox[data-sf80-article-editor="1"] .sf80-category-row{align-items:stretch}
      @media(max-width:620px){
        #modal:has(#modalBox[data-sf80-article-editor="1"]){padding:0!important;align-items:flex-start!important;background:#fff!important}
        #modalBox[data-sf80-article-editor="1"]{width:100%!important;max-width:100%!important;max-height:var(--sf73-viewport-height,100dvh)!important;height:var(--sf73-viewport-height,100dvh)!important;margin:0!important;border-radius:0!important;box-shadow:none!important}
        .sf80-article-editor{min-height:100%}
        .sf80-article-editor-head{position:sticky;z-index:4;top:0;padding:max(14px,env(safe-area-inset-top)) 14px 12px;background:rgba(255,255,255,.98);backdrop-filter:blur(10px)}
        .sf80-article-editor-head h2{font-size:21px}
        .sf80-article-editor-body{padding:12px 12px 18px;gap:10px}
        .sf80-article-block{padding:12px;border-radius:12px}
        .sf80-article-fields{grid-template-columns:1fr;gap:10px}
        .sf80-article-editor .input{min-height:50px!important}
        .sf80-unit-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
        .sf80-unit-chip{min-width:0;padding:6px 5px;white-space:normal;line-height:1.15}
        .sf80-article-editor-actions{grid-template-columns:1fr 1.5fr;padding:10px 12px calc(10px + env(safe-area-inset-bottom))}
        #modalBox[data-sf80-article-editor="1"] .sf80-category-row{grid-template-columns:1fr!important}
        #modalBox[data-sf80-article-editor="1"] .sf80-category-add{width:100%;min-height:44px}
      }
    `;
    document.head.appendChild(style);
  }

  function selectedSupplier(){return String(document.getElementById('articleSupplier')?.value||'').trim()}

  function existingArticle(id){
    try{return id?db.articles.find(item=>Number(item.id)===Number(id))||null:null}catch{return null}
  }

  function nextSort(supplier){
    try{return Math.max(0,...db.articles.filter(item=>item.supplier===supplier).map(item=>Number(item.sortOrder||0)))+1}catch{return 1}
  }

  function unitListMarkup(){
    if(typeof stopFlowUnitListMarkup==='function')return stopFlowUnitListMarkup('stopflowArticleUnits');
    return `<datalist id="stopflowArticleUnits">${['pièce','bouteille','casier','caisse','carton','pack','sac','kg','litre','fût 20 L'].map(unit=>`<option value="${esc(unit)}"></option>`).join('')}</datalist>`;
  }

  function priceValue(value){
    if(typeof stopFlowPriceValue==='function')return stopFlowPriceValue(value);
    if(value===null||value===undefined||value==='')return '';
    const number=Number(value);return Number.isFinite(number)?number.toFixed(2):'';
  }

  function priceNumber(value){
    if(typeof stopFlowPriceNumber==='function')return stopFlowPriceNumber(value);
    const text=String(value??'').trim().replace(',','.');
    if(text==='')return null;
    const number=Number(text);if(!Number.isFinite(number)||number<0)throw new Error('Le prix doit être positif ou rester vide.');
    return Math.round(number*100)/100;
  }

  function syncUnitChips(box){
    const input=box.querySelector('#mUnit');if(!input)return;
    const current=String(input.value||'').trim().toLocaleLowerCase('fr');
    box.querySelectorAll('.sf80-unit-chip').forEach(button=>button.classList.toggle('active',String(button.dataset.unit||'').toLocaleLowerCase('fr')===current));
  }

  function bindUnitChips(box){
    const input=box.querySelector('#mUnit');if(!input)return;
    box.querySelectorAll('.sf80-unit-chip').forEach(button=>button.addEventListener('click',()=>{input.value=button.dataset.unit||'';syncUnitChips(box);input.dispatchEvent(new Event('input',{bubbles:true}))}));
    input.addEventListener('input',()=>syncUnitChips(box));
    syncUnitChips(box);
  }

  function closeArticleEditor(){
    const modal=document.getElementById('modal'),box=document.getElementById('modalBox');
    modal?.classList.add('hidden');if(box)box.removeAttribute('data-sf80-article-editor');
  }

  function openEditor(id){
    const supplier=selectedSupplier();
    const existing=existingArticle(id);
    const article=existing?{...existing}:{id:null,name:'',supplier,category:'',unit:'',target:0,purchasePrice:null,active:true,sortOrder:nextSort(supplier)};
    const modal=document.getElementById('modal'),box=document.getElementById('modalBox');
    if(!modal||!box)return;
    box.dataset.sf80ArticleEditor='1';
    box.innerHTML=`<div class="sf80-article-editor"><div class="sf80-article-editor-head"><div><h2>${id?'Modifier l’article':'Nouvel article'}</h2><p>${id?'Modifiez uniquement les informations nécessaires.':'Encodez l’essentiel, puis enregistrez.'}</p></div><button type="button" class="btn ghost" id="closeModal">Fermer</button></div><div class="sf80-article-editor-body"><section class="sf80-article-block"><div class="sf80-article-block-title">Article</div><div class="sf80-article-fields one"><div class="field"><label for="mName">Nom de l’article *</label><input id="mName" class="input" autocomplete="off" enterkeyhint="next" placeholder="Ex. Gin Bombay" value="${esc(article.name)}"></div><div class="field"><label for="mCat">Catégorie *</label><input id="mCat" class="input" value="${esc(article.category)}"></div></div></section><section class="sf80-article-block"><div class="sf80-article-block-title">Fournisseur & conditionnement</div><div class="sf80-article-fields"><div class="field"><label for="mSupplier">Fournisseur</label><select id="mSupplier" class="input"></select></div><div class="field"><label for="mUnit">Conditionnement</label><input id="mUnit" class="input" list="stopflowArticleUnits" autocomplete="off" enterkeyhint="next" placeholder="Ex. bouteille" value="${esc(article.unit)}"><div class="sf80-unit-chips">${QUICK_UNITS.map(unit=>`<button type="button" class="sf80-unit-chip" data-unit="${esc(unit)}">${esc(unit)}</button>`).join('')}</div></div></div></section><section class="sf80-article-block"><div class="sf80-article-block-title">Inventaire & achat</div><div class="sf80-article-fields"><div class="field"><label for="mTarget">Stock cible</label><input id="mTarget" class="input" type="number" inputmode="numeric" min="0" enterkeyhint="next" value="${Math.max(0,Number(article.target||0))}"><div class="sf80-article-helper">Quantité souhaitée après réassort.</div></div><div class="field"><label for="mPrice">Prix d’achat HTVA (€)</label><input id="mPrice" class="input" type="text" inputmode="decimal" enterkeyhint="done" placeholder="Facultatif" value="${esc(priceValue(article.purchasePrice))}"><div class="sf80-article-helper">Prix du conditionnement sélectionné.</div></div></div></section>${unitListMarkup()}</div><div class="sf80-article-editor-actions"><button type="button" class="btn ghost" id="sf80ArticleCancel">Annuler</button><button type="button" class="btn primary" id="saveArticle">Enregistrer l’article</button></div></div>`;
    modal.classList.remove('hidden');
    if(typeof fillSupplierSelect==='function')fillSupplierSelect(box.querySelector('#mSupplier'),article.supplier||supplier);
    box.querySelector('#closeModal')?.addEventListener('click',closeArticleEditor);
    box.querySelector('#sf80ArticleCancel')?.addEventListener('click',closeArticleEditor);
    bindUnitChips(box);
    window.stopflow080ArticleCategories?.refresh?.();

    const saveButton=box.querySelector('#saveArticle');
    saveButton?.addEventListener('click',async()=>{
      const name=String(box.querySelector('#mName')?.value||'').trim();
      const category=String(box.querySelector('#mCat')?.value||'').trim();
      const supplierName=String(box.querySelector('#mSupplier')?.value||'').trim();
      const unit=String(box.querySelector('#mUnit')?.value||'').trim();
      const target=Math.max(0,Number(box.querySelector('#mTarget')?.value||0));
      let purchasePrice=null;
      try{purchasePrice=priceNumber(box.querySelector('#mPrice')?.value)}catch(error){return alert(error?.message||'Vérifiez le prix d’achat.')}
      if(!name)return alert('Indiquez le nom de l’article.');
      if(!category)return alert('Choisissez une catégorie.');
      if(!supplierName)return alert('Choisissez un fournisseur.');
      const next={...article,name,supplier:supplierName,category,unit,target,purchasePrice};
      saveButton.disabled=true;saveButton.textContent='Enregistrement…';
      try{
        const saved=await saveSharedArticle(next);
        closeArticleEditor();
        const select=document.getElementById('articleSupplier');if(select)select.value=saved.supplier;
        if(typeof renderArticles==='function')renderArticles();
      }catch(error){
        alert(typeof catalogErrorMessage==='function'?catalogErrorMessage(error):String(error?.message||'Enregistrement impossible.'));
        saveButton.disabled=false;saveButton.textContent='Enregistrer l’article';
      }
    });

    if(!id)setTimeout(()=>{const name=box.querySelector('#mName');try{name?.focus({preventScroll:true})}catch{name?.focus()}},80);
  }

  function install(){
    injectStyles();
    if(typeof articleModal!=='function'||typeof saveSharedArticle!=='function')return false;
    if(!installed){installed=true;window.stopflow080ArticleEditorUx.original=articleModal;}
    articleModal=openEditor;
    try{window.articleModal=openEditor}catch{}
    return true;
  }

  window.stopflow080ArticleEditorUx={active:true,version:'0.8.0',original:null,open:openEditor,refresh:install};
  let attempts=0;
  const timer=setInterval(()=>{if(install()||++attempts>80)clearInterval(timer)},50);
  [300,800,1600,3000].forEach(delay=>setTimeout(install,delay));
})();
