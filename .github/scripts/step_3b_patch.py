from pathlib import Path
import re

path = Path("index.html")
text = path.read_text(encoding="utf-8")
original = text

replacements = [
    ("<title>StopFlow — Colruyt & Leloup v0.3.0</title>", "<title>StopFlow — Colruyt & Leloup v0.3.1</title>"),
    ("Version 0.3.0 — Documents partagés", "Version 0.3.1 — Catalogue partagé"),
    ('<script src="supabase-orders.js"></script>\n<script>', '<script src="supabase-orders.js"></script>\n<script src="supabase-catalog.js"></script>\n<script>'),
    (' await loadSharedOrders();\n showApp();', ' await Promise.all([loadSharedOrders(),loadSharedCatalog()]);\n showApp();'),
    ('a.download="StopFlow_v0.3.0_donnees.json"', 'a.download="StopFlow_v0.3.1_donnees.json"'),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"Motif introuvable: {old[:80]}")
    text = text.replace(old, new, 1)

page_anchor = ''' if(isCloudMode()&&(id==="dashboard"||id==="history")){
   loadSharedOrders().then(()=>{
     if(id==="dashboard")renderDashboard();
     if(id==="history")renderHistory();
   }).catch(error=>console.warn(cloudErrorMessage(error)));
 }
'''
page_replacement = page_anchor + ''' if(isCloudMode()&&(id==="articles"||id==="settings")){
   loadSharedCatalog().then(()=>{
     if(id==="articles")renderArticles();
     if(id==="settings")loadSettings();
   }).catch(error=>alert(catalogErrorMessage(error)));
 }
'''
if page_anchor not in text:
    raise SystemExit("Bloc page() introuvable")
text = text.replace(page_anchor, page_replacement, 1)

catalog_block = r'''function renderArticles\(\)\{.*?
\}

function renderSuggestions\(\)\{'''
new_catalog_block = '''function renderArticles(){
 const supplier=$("#articleSupplier").value;
 const articles=db.articles.filter(a=>a.supplier===supplier);
 $("#articleRows").innerHTML=articles.length?articles.map(a=>`<tr><td><b>${a.name}</b></td><td>${a.supplier}</td><td>${a.category}</td><td>${a.unit}</td><td><input class="input" style="width:90px" type="number" min="0" value="${a.target}" data-target="${a.id}"></td><td><input type="checkbox" data-active="${a.id}" ${a.active?"checked":""}></td><td><button class="btn small ghost" data-edit="${a.id}">Modifier</button></td></tr>`).join(""):`<tr><td colspan="7" class="muted">Aucun article pour ce fournisseur.</td></tr>`;
 $$("[data-target]").forEach(input=>input.onchange=async event=>{
   const id=Number(event.target.dataset.target),article=db.articles.find(a=>Number(a.id)===id),previous=article?.target;
   event.target.disabled=true;
   try{await updateSharedArticle(id,{target:Math.max(0,Number(event.target.value||0))});renderArticles()}
   catch(error){if(article)article.target=previous;alert(catalogErrorMessage(error));renderArticles()}
 });
 $$("[data-active]").forEach(input=>input.onchange=async event=>{
   const id=Number(event.target.dataset.active),article=db.articles.find(a=>Number(a.id)===id),previous=article?.active;
   event.target.disabled=true;
   try{await updateSharedArticle(id,{active:event.target.checked});renderArticles()}
   catch(error){if(article)article.active=previous;alert(catalogErrorMessage(error));renderArticles()}
 });
 $$("[data-edit]").forEach(button=>button.onclick=()=>articleModal(Number(button.dataset.edit)));
}
function articleModal(id){
 const selected=$("#articleSupplier").value;
 const existing=id?db.articles.find(x=>Number(x.id)===Number(id)):null;
 const nextSort=Math.max(0,...db.articles.filter(x=>x.supplier===selected).map(x=>Number(x.sortOrder||0)))+1;
 const a=existing?{...existing}:{id:null,name:"",supplier:selected,category:selected==="Leloup"?"Vins maison":"Apéritifs",unit:selected==="Leloup"?"fût 20 L":"bouteille",target:4,active:true,sortOrder:nextSort};
 $("#modalBox").innerHTML=`<div class="flex between"><h2>${id?"Modifier":"Ajouter"} un article</h2><button class="btn ghost" id="closeModal">Fermer</button></div>
 <div class="field"><label>Nom</label><input id="mName" class="input" value="${a.name}"></div>
 <div class="filters" style="grid-template-columns:1fr 1fr;margin-top:12px"><div class="field"><label>Fournisseur</label><select id="mSupplier" class="input"><option ${a.supplier==="Colruyt"?"selected":""}>Colruyt</option><option ${a.supplier==="Leloup"?"selected":""}>Leloup</option></select></div><div class="field"><label>Catégorie</label><input id="mCat" class="input" value="${a.category}"></div></div>
 <div class="filters" style="grid-template-columns:1fr 1fr"><div class="field"><label>Unité</label><input id="mUnit" class="input" value="${a.unit}"></div><div class="field"><label>Stock cible</label><input id="mTarget" class="input" type="number" min="0" value="${a.target}"></div></div>
 <button class="btn primary" id="saveArticle">Enregistrer</button>`;
 $("#modal").classList.remove("hidden");$("#closeModal").onclick=()=>$("#modal").classList.add("hidden");
 $("#saveArticle").onclick=async()=>{
   const button=$("#saveArticle");
   const article={...a,name:$("#mName").value.trim(),supplier:$("#mSupplier").value,category:$("#mCat").value.trim(),unit:$("#mUnit").value.trim(),target:Math.max(0,Number($("#mTarget").value||0))};
   if(!article.name)return alert("Nom obligatoire");
   button.disabled=true;button.textContent="Enregistrement…";
   try{
     const saved=await saveSharedArticle(article);
     $("#modal").classList.add("hidden");$("#articleSupplier").value=saved.supplier;renderArticles();
   }catch(error){alert(catalogErrorMessage(error));button.disabled=false;button.textContent="Enregistrer"}
 };
}

function renderSuggestions(){'''
text, count = re.subn(catalog_block, new_catalog_block, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f"Bloc catalogue remplacé {count} fois")

old_settings = '$("#saveSettings").onclick=()=>{db.settings={establishment:$("#establishment").value,manager:$("#manager").value,footer:$("#footerText").value};save();alert("Paramètres enregistrés.")};'
new_settings = '''$("#saveSettings").onclick=async()=>{
 const button=$("#saveSettings");
 const settings={establishment:$("#establishment").value,manager:$("#manager").value,footer:$("#footerText").value};
 button.disabled=true;button.textContent="Enregistrement…";
 try{await saveSharedSettings(settings);alert("Paramètres partagés enregistrés.")}
 catch(error){alert(catalogErrorMessage(error,"Enregistrement des paramètres impossible."))}
 finally{button.disabled=false;button.textContent="Enregistrer les paramètres"}
};'''
if old_settings not in text:
    raise SystemExit("Gestionnaire des paramètres introuvable")
text = text.replace(old_settings, new_settings, 1)

old_import = '$("#importData").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{db=migrate(r.result);save();alert("Import terminé.");page("dashboard")}catch{alert("Fichier invalide.")}};r.readAsText(f)};'
new_import = '$("#importData").onchange=e=>{if(isCloudMode()){e.target.value="";return alert("L’import global est désactivé en mode partagé afin de protéger les données Supabase.")}const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{db=migrate(r.result);save();alert("Import terminé.");page("dashboard")}catch{alert("Fichier invalide.")}};r.readAsText(f)};'
if old_import not in text:
    raise SystemExit("Import introuvable")
text = text.replace(old_import, new_import, 1)

old_reset = '$("#resetData").onclick=()=>{if(confirm("Effacer toutes les données locales et revenir à la démonstration initiale ?")){db=defaultData();save();location.reload()}};'
new_reset = '$("#resetData").onclick=()=>{if(isCloudMode())return alert("La réinitialisation est désactivée en mode partagé afin de protéger les données Supabase.");if(confirm("Effacer toutes les données locales et revenir à la démonstration initiale ?")){db=defaultData();save();location.reload()}};'
if old_reset not in text:
    raise SystemExit("Réinitialisation introuvable")
text = text.replace(old_reset, new_reset, 1)

if text == original:
    raise SystemExit("Aucune modification appliquée")

path.write_text(text, encoding="utf-8")
print("index.html mis à jour pour StopFlow v0.3.1")
