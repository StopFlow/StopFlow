from pathlib import Path

path = Path("index.html")
text = path.read_text(encoding="utf-8")
original = text

replacements = [
    ("<title>StopFlow — Colruyt & Leloup v0.3.1</title>", "<title>StopFlow — v0.3.2</title>"),
    ("Version 0.3.1 — Catalogue partagé", "Version 0.3.2 — Gestion des utilisateurs"),
    ('    <button data-page="settings">⚙ Paramètres</button>', '    <button data-page="settings">⚙ Paramètres</button>\n    <button data-page="users">♙ Utilisateurs</button>'),
    ('<script src="supabase-catalog.js"></script>\n<script>', '<script src="supabase-catalog.js"></script>\n<script src="supabase-users.js"></script>\n<script>'),
    ('a.download="StopFlow_v0.3.1_donnees.json"', 'a.download="StopFlow_v0.3.2_donnees.json"'),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"Motif introuvable: {old[:100]}")
    text = text.replace(old, new, 1)

settings_end = '''  </section>
 </main>
 <nav class="mobilebar"><button data-page="dashboard" class="active">⌂<br>Accueil</button><button data-page="inventory">▣<br>Inventaire</button><button data-page="history">◷<br>Historique</button><button data-page="suggestions">◌<br>Idées</button></nav>
'''
users_section = '''  </section>

  <section id="users" class="page hidden">
   <div class="card">
    <div class="flex between wrap">
      <div><h2>Utilisateurs StopFlow</h2><p class="muted">Créer les comptes, attribuer les rôles et désactiver les accès sans supprimer l’historique.</p></div>
      <button class="btn primary" id="addUser">Ajouter un utilisateur</button>
    </div>
    <div class="kpis">
      <div class="kpi"><span class="muted">Comptes actifs</span><strong id="userStatActive">0</strong></div>
      <div class="kpi"><span class="muted">Employés</span><strong id="userStatEmployees">0</strong></div>
      <div class="kpi"><span class="muted">Responsables</span><strong id="userStatResponsibles">0</strong></div>
      <div class="kpi"><span class="muted">Administrateurs</span><strong id="userStatAdmins">0</strong></div>
    </div>
    <div class="field" style="margin-bottom:14px"><label>Rechercher</label><input id="userSearch" class="input" placeholder="Nom, e-mail ou rôle…"></div>
    <div class="tablewrap"><table><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Statut</th><th>E-mail</th><th>Dernière connexion</th><th></th></tr></thead><tbody id="userRows"><tr><td colspan="6" class="muted">Chargement…</td></tr></tbody></table></div>
    <div class="notice" style="margin-top:16px"><b>Comptes protégés :</b> contact@srlreunion.com reste Administrateur actif et quentin@lunion.be reste Responsable actif.</div>
   </div>
  </section>
 </main>
 <nav class="mobilebar"><button data-page="dashboard" class="active">⌂<br>Accueil</button><button data-page="inventory">▣<br>Inventaire</button><button data-page="history">◷<br>Historique</button><button data-page="suggestions">◌<br>Idées</button><button data-page="users">♙<br>Utilisateurs</button></nav>
'''
if settings_end not in text:
    raise SystemExit("Fin de la section Paramètres introuvable")
text = text.replace(settings_end, users_section, 1)

apply_role = ''' $$('[data-page="articles"]').forEach(el=>el.classList.toggle("hidden",!canManageArticles()));
 $$('[data-page="settings"]').forEach(el=>el.classList.toggle("hidden",!canManageSettings()));
'''
apply_role_new = apply_role + ''' $$('[data-page="users"]').forEach(el=>el.classList.toggle("hidden",!canManageUsers()));
'''
if apply_role not in text:
    raise SystemExit("Bloc applyRole introuvable")
text = text.replace(apply_role, apply_role_new, 1)

catalog_load = ''' if(isCloudMode()&&(id==="articles"||id==="settings")){
   loadSharedCatalog().then(()=>{
     if(id==="articles")renderArticles();
     if(id==="settings")loadSettings();
   }).catch(error=>alert(catalogErrorMessage(error)));
 }
'''
users_load = catalog_load + ''' if(isCloudMode()&&id==="users"){
   loadSharedUsers().then(()=>renderUsers()).catch(error=>alert(userAdminErrorMessage(error)));
 }
'''
if catalog_load not in text:
    raise SystemExit("Bloc de chargement catalogue introuvable")
text = text.replace(catalog_load, users_load, 1)

old_guard = ' if((id==="articles"&&!canManageArticles())||(id==="settings"&&!canManageSettings())) id="dashboard";'
new_guard = ' if((id==="articles"&&!canManageArticles())||(id==="settings"&&!canManageSettings())||(id==="users"&&!canManageUsers())) id="dashboard";'
if old_guard not in text:
    raise SystemExit("Garde des pages introuvable")
text = text.replace(old_guard, new_guard, 1)

old_titles = ' const titles={dashboard:"Tableau de bord",inventory:"Inventaire "+(current.supplier||""),summary:"Résumé",history:"Historique",articles:"Articles",suggestions:"Suggestions",settings:"Paramètres"};'
new_titles = ' const titles={dashboard:"Tableau de bord",inventory:"Inventaire "+(current.supplier||""),summary:"Résumé",history:"Historique",articles:"Articles",suggestions:"Suggestions",settings:"Paramètres",users:"Utilisateurs"};'
if old_titles not in text:
    raise SystemExit("Titres des pages introuvables")
text = text.replace(old_titles, new_titles, 1)

old_render = ' if(id==="settings")loadSettings();\n}'
new_render = ' if(id==="settings")loadSettings();\n if(id==="users")renderUsers();\n}'
if old_render not in text:
    raise SystemExit("Fin de page() introuvable")
text = text.replace(old_render, new_render, 1)

old_handlers = '$$("[data-page]").forEach(b=>b.onclick=()=>page(b.dataset.page));$$("[data-go]").forEach(a=>a.onclick=e=>{e.preventDefault();page(a.dataset.go)});'
new_handlers = old_handlers + '\n$("#userSearch").oninput=renderUsers;'
if old_handlers not in text:
    raise SystemExit("Gestionnaires de navigation introuvables")
text = text.replace(old_handlers, new_handlers, 1)

if text == original:
    raise SystemExit("Aucune modification appliquée")

path.write_text(text, encoding="utf-8")
print("index.html mis à jour pour StopFlow v0.3.2")
