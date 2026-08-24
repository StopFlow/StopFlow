/* StopFlow 0.8.0 — catégories réutilisables pour l'encodage des articles. */
(function(){
  if(window.stopflow080ArticleCategories?.active)return;

  const DEFAULTS=['Apéritif','Digestif','Alcool','Sirop'];
  const state={categories:DEFAULTS.map((name,index)=>({name,sort_order:(index+1)*10,active:true})),observer:null,loading:false};
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":"&#39;"}[char]));
  const cloud=()=>typeof isCloudMode==='function'&&isCloudMode()&&window.supabaseClient;
  const canManage=()=>typeof isResponsible==='function'&&isResponsible()||typeof isAdmin==='function'&&isAdmin();

  function bindButton(button,handler){
    if(!button||button.dataset.sf80CategoryBound==='1')return;
    button.dataset.sf80CategoryBound='1';
    if(typeof window.stopflow073MobileTap?.bind==='function')window.stopflow073MobileTap.bind(button,handler);
    else button.addEventListener('click',handler);
    if(!button.dataset.sf80CategoryDesktop){
      button.dataset.sf80CategoryDesktop='1';
      button.addEventListener('click',event=>{
        if(window.matchMedia?.('(max-width:950px)').matches)return;
        handler(event);
      });
    }
  }

  function injectStyles(){
    if(document.getElementById('stopflow080ArticleCategoriesStyles'))return;
    const style=document.createElement('style');
    style.id='stopflow080ArticleCategoriesStyles';
    style.textContent=`
      .sf80-category-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}
      .sf80-category-add{min-height:42px;white-space:nowrap}
      #sf80ArticleCategoryModal{z-index:13050}
      #sf80ArticleCategoryModal .modalbox{width:min(520px,100%)}
      #sf80ArticleCategoryName{font-size:16px!important}
      #sf80ArticleCategoryModal .sf80-category-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
      @media(max-width:620px){
        .sf80-category-row{grid-template-columns:1fr}
        .sf80-category-add{width:100%}
        #sf80ArticleCategoryModal{padding:12px!important;align-items:flex-start!important;padding-top:max(18px,env(safe-area-inset-top))!important}
        #sf80ArticleCategoryModal .modalbox{margin:0!important;border-radius:16px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function sorted(){
    const map=new Map();
    [...state.categories,...DEFAULTS.map((name,index)=>({name,sort_order:(index+1)*10,active:true}))].forEach(item=>{
      const name=String(item?.name||'').trim();
      if(!name)return;
      const key=name.toLocaleLowerCase('fr');
      if(!map.has(key))map.set(key,{...item,name});
    });
    return [...map.values()].filter(item=>item.active!==false).sort((a,b)=>(Number(a.sort_order||0)-Number(b.sort_order||0))||a.name.localeCompare(b.name,'fr'));
  }

  async function load(){
    if(state.loading)return;
    state.loading=true;
    try{
      const fromArticles=Array.isArray(window.db?.articles)?window.db.articles.map(item=>String(item.category||'').trim()).filter(Boolean):[];
      if(cloud()){
        const {data,error}=await supabaseClient.from('article_categories').select('id,name,active,sort_order,created_by,created_at').order('sort_order').order('name');
        if(error)throw error;
        state.categories=[...(data||[]),...fromArticles.map((name,index)=>({name,active:true,sort_order:500+index}))];
      }else{
        state.categories=[...state.categories,...fromArticles.map((name,index)=>({name,active:true,sort_order:500+index}))];
      }
    }catch(error){
      console.warn('StopFlow 0.8.0 — catégories articles',error);
    }finally{
      state.loading=false;
      enhance();
    }
  }

  function options(selected=''){
    const names=sorted();
    const hasSelected=selected&&names.some(item=>item.name.toLocaleLowerCase('fr')===selected.toLocaleLowerCase('fr'));
    return `${selected&&!hasSelected?`<option value="${esc(selected)}" selected>${esc(selected)}</option>`:''}${names.map(item=>`<option value="${esc(item.name)}" ${item.name===selected?'selected':''}>${esc(item.name)}</option>`).join('')}`;
  }

  function replaceCategoryInput(input){
    if(!input||input.tagName==='SELECT'||input.dataset.sf80CategorySelect==='1')return input;
    const selected=String(input.value||'').trim();
    const select=document.createElement('select');
    [...input.attributes].forEach(attr=>select.setAttribute(attr.name,attr.value));
    select.id=input.id;
    select.className=input.className;
    select.innerHTML=options(selected);
    select.dataset.sf80CategorySelect='1';
    input.replaceWith(select);
    return select;
  }

  function enhanceSingle(){
    const input=document.getElementById('mCat');
    if(!input)return;
    const select=replaceCategoryInput(input);
    if(!select)return;
    const field=select.closest('.field');
    if(!field||field.dataset.sf80CategoryEnhanced==='1')return;
    field.dataset.sf80CategoryEnhanced='1';
    const row=document.createElement('div');
    row.className='sf80-category-row';
    select.insertAdjacentElement('beforebegin',row);
    row.appendChild(select);
    if(canManage()){
      const add=document.createElement('button');
      add.type='button';
      add.className='btn secondary sf80-category-add';
      add.textContent='+ Ajouter une catégorie';
      row.appendChild(add);
      bindButton(add,()=>openCategoryModal(select));
    }
  }

  function enhanceBulk(){
    document.querySelectorAll('[data-bulk-category]').forEach(input=>replaceCategoryInput(input));
  }

  function ensureModal(){
    let modal=document.getElementById('sf80ArticleCategoryModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='sf80ArticleCategoryModal';
    modal.className='modal hidden';
    modal.innerHTML=`<div class="modalbox"><h2>Ajouter une catégorie</h2><p class="muted">Elle sera ensuite proposée à tous lors de l'encodage d'un article.</p><div class="field"><label for="sf80ArticleCategoryName">Nom de la catégorie</label><input id="sf80ArticleCategoryName" class="input" autocomplete="off" placeholder="Ex. Bière, Vin, Soft…"></div><div class="sf80-category-actions"><button type="button" class="btn ghost" id="sf80ArticleCategoryCancel">Annuler</button><button type="button" class="btn primary" id="sf80ArticleCategorySave">Ajouter</button></div></div>`;
    document.body.appendChild(modal);
    bindButton(modal.querySelector('#sf80ArticleCategoryCancel'),()=>modal.classList.add('hidden'));
    return modal;
  }

  function openCategoryModal(target){
    const modal=ensureModal();
    const input=modal.querySelector('#sf80ArticleCategoryName');
    const save=modal.querySelector('#sf80ArticleCategorySave');
    input.value='';
    modal.classList.remove('hidden');
    save.dataset.targetId=target?.id||'';
    save.onclick=null;
    bindButton(save,async()=>{
      const name=String(input.value||'').trim();
      if(!name)return alert('Indiquez le nom de la catégorie.');
      save.disabled=true;save.textContent='Ajout…';
      try{
        let category={name,active:true,sort_order:Math.max(50,...sorted().map(item=>Number(item.sort_order||0)))+10};
        if(cloud()){
          const {data,error}=await supabaseClient.from('article_categories').insert({name,active:true,sort_order:category.sort_order,created_by:window.session?.id||null}).select('id,name,active,sort_order').single();
          if(error){
            if(String(error.message||'').toLowerCase().includes('duplicate')){
              const existing=sorted().find(item=>item.name.toLocaleLowerCase('fr')===name.toLocaleLowerCase('fr'));
              if(existing)category=existing; else throw error;
            }else throw error;
          }else category=data;
        }
        state.categories.push(category);
        modal.classList.add('hidden');
        const current=document.getElementById(save.dataset.targetId||'mCat');
        if(current){current.innerHTML=options(category.name);current.value=category.name;}
        enhance();
      }catch(error){
        console.warn('StopFlow 0.8.0 — ajout catégorie',error);
        alert(error?.message||'Impossible d’ajouter cette catégorie.');
      }finally{
        save.disabled=false;save.textContent='Ajouter';
      }
    });
    try{input.focus({preventScroll:true})}catch{}
  }

  function enhance(){
    injectStyles();
    enhanceSingle();
    enhanceBulk();
  }

  function installObserver(){
    const box=document.getElementById('modalBox')||document.body;
    if(state.observer)return;
    state.observer=new MutationObserver(()=>requestAnimationFrame(enhance));
    state.observer.observe(box,{childList:true,subtree:true});
  }

  window.stopflow080ArticleCategories={active:true,version:'0.8.0',refresh:enhance,reload:load};
  injectStyles();
  installObserver();
  load();
  [100,400,1000].forEach(delay=>setTimeout(enhance,delay));
})();
