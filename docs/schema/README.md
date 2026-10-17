# Mission 1.6 — schéma et installation isolée

**Dernier état, mission 2.0 :** [quatre tables et cinq helpers recoupés/testés](MISSION-2.0.md),
[statut actualisé](baseline/MISSION20-STATUS.json). La PK réelle remplace le
prérequis fictif dans le nouveau mode de test. Le snapshot global reste partiel.

**Dernier état, mission 1.9 :** [tests des six fonctions profils reçues et limites](MISSION-1.9.md),
[statut actualisé](baseline/MISSION19-STATUS.json). Les fonctions des trois triggers
sont disponibles ; le snapshot final et les tests Auth réels restent nécessaires.

**Dernier état, mission 1.8 :** [preuves et tests sur les sources authentiques](MISSION-1.8.md),
[statut actualisé](baseline/MISSION18-STATUS.json). PK/FK de profiles et provisioning
documentés ; baseline complète et reset Supabase réel toujours non validés.

**Mission 1.7 :** [échec réel de bootstrap et correction conditionnelle](MISSION-1.7.md).
La branche Test a été signalée MIGRATIONS_FAILED par le pilote ; aucune écriture
distante effectuée par Codex. Baseline toujours bloquée avant collecte des DDL finaux.

Préparation de la future branche Supabase Pro :
[stopflow-reservations-test](SUPABASE-TEST-BRANCH.md), avec diagnostic et matrice
de validation après création. Aucune branche distante créée par ce travail.

**Dernier état :** [analyse du dossier complet reçu](DOSSIER-REPORT.md) et
[préparation de baseline bloquée](baseline/README.md). `current_role()` et les
colonnes des 19 tables sont désormais documentées ; la baseline reste incomplète.

Suite après réception du rapprochement Production : voir
[RECONCILIATION.md](RECONCILIATION.md) pour les huit références, les dépendances
restantes et les requêtes exactes de prochaine extraction. La baseline reste partielle.

Travail local depuis `8de30a16667977231d7029446b80184c1a985508`, branche
`feat/reservations-foundations`. Aucun accès distant pendant cette mission.

## A. Audit reproductible

`INVENTORY.json` indexe les 20 migrations actives, les 3 scripts SQL
complémentaires historiques et le nouveau contrôle de métadonnées : SHA256,
ordre lexical, lignes des instructions,
colonnes/contraintes des créations, ALTER, FK, index, triggers, RLS, grants,
en-têtes de fonctions, références candidates et mutations de données.
Les corps de fonctions restent consultables dans les sources aux lignes indiquées.
Régénération hors ligne :

```sh
node scripts/audit-migrations.cjs
```

La sortie est un index lexical, pas un résolveur PostgreSQL : identifiants cités,
SQL dynamique, boucles DO et dépendances implicites demandent une revue humaine.
L'ordre lexical est déterministe pour les tests, mais les formats de versions
historiques diffèrent : seule la comparaison à l'historique déployé peut confirmer
la chronologie réellement appliquée. Aucun historique distant n'a été consulté.

## B. Baseline PARTIELLE ; installation complète BLOQUÉE

**A — Définitions présentes :** fournisseurs, permissions des profils,
préférences des cartes, équipements et sessions de température ; les sept tables
Réservations et leurs huit fonctions. Ces définitions sont disponibles avec leurs
dépendances, pas autonomes. Réservations est transactionnelle, sans seed restaurant.

**B — CREATE TABLE manquants**, union des références SQL et frontend :

```text
activity_events, app_settings, article_categories, articles,
checklist_run_items, checklist_runs, checklist_suggestions,
checklist_template_items, checklist_templates, deleted_user_identities,
department_content, order_lines, orders, profile_departments, profiles,
proposal_notifications, team_banners, temperature_readings, user_admin_events
```

Helpers référencés sans définition statique : `private.is_active_user`,
`private.is_admin`, `private.is_responsible_or_admin`,
`private.set_catalog_audit`, `private.user_has_department` ; RPC publiques
`log_stopflow_event`, `submit_order`, `validate_order`.
Les noms candidats ne prouvent pas les signatures/overloads déployés : récupérer
l'ensemble des fonctions public/private plutôt que recréer un contrat supposé.
Le schéma `private` initial et les contrats initiaux des tables sont absents.
`auth.uid()` et `auth.users` appartiennent à la plateforme Supabase.

**C — Inspection nécessaire :** types/domaines/enums, defaults, séquences,
vues, signatures et corps des fonctions, triggers de provisioning Auth,
permissions de schémas/colonnes/séquences, privilèges par défaut, rôles des
politiques et expressions RLS, extensions et dépendances externes. Les migrations
de durcissement changent des ACL/search_path sans fournir tous les objets initiaux.
Voir `EXTRACTION.md` pour la récupération autorisée future.

Les migrations fournisseurs/checklists contiennent des seeds ; permissions et
températures font des reprises depuis des données existantes. Certains corps SQL
contiennent des identités email historiques. Ne pas les transformer en fixtures.
Une exportation schema-only n'est donc pas automatiquement anonyme.
`future-online/supabase/schema-propose.sql` est un brouillon incompatible avec
les profils actuels, exclu de l'installation. `gen_random_uuid()` est disponible
dans PostgreSQL 16 ; les extensions réellement requises restent à comparer aux
métadonnées du projet. Ne pas installer pgcrypto ou une extension par supposition.

Aucune fausse baseline complète n'est produite. Les deux contrôles SQL existants
vérifient des contrats, sans prouver la complétude de tout StopFlow.

## C. Reconstruction locale et preuves

`node tests/schema-reconstruction.cjs` démarre PostgreSQL 16 épinglé par digest,
sans réseau, port publié ou volume. Trois bases indépendantes rejouent les
migrations dans l'ordre lexical et s'arrêtent à la première erreur :

| Base | Première migration | Résultat attendu et observé |
| --- | --- | --- |
| Vide | 202608022228_step_033_shared_suppliers.sql | 3F000 : schéma auth absent |
| Adaptateur Auth minimal | même fichier | 3F000 : schéma private absent |
| Adaptateur Auth + private vide | même fichier | 42883 : private.is_active_user absent |

Le module seul sans profils échoue avec 42P01 et ne laisse aucune table
Réservations (rollback). Avec un contrat profils minimal **explicitement simulé**,
la vraie migration crée ses sept tables, sans établissement initial. Même un
profil admin fictif ne reçoit aucune appartenance implicite. Sans identité, la
RPC refuse l'accès. Un FK de profils vers les UUID Auth est testé dans ce contrat.
L'extraction métadonnées est exécutée localement ; les corps SQL ne sont pas
exportés et PostgreSQL refuse une écriture dans une transaction READ ONLY.

Ce sont des tests PostgreSQL avec adaptateur `auth.uid()` et comptes fictifs,
pas GoTrue, PostgREST, Auth email ou Supabase Cloud. Ils ne valident pas une
reconstruction complète. Les bases/conteneurs créés par les tests sont supprimés.

## D. Réservations

`node tests/reservations-postgres.cjs` couvre la migration réelle : CRUD persistant,
permissions granulaires, RLS sur sept relations, FK inter-établissements,
archivage, audit, versions et deux écrivains concurrents (62 contrôles).
`node tests/reservations-browser.cjs` couvre desktop/clavier et mobile/toucher,
rechargement via PostgreSQL local, modification concurrente, échec réseau, XSS,
lecture seule, refus inter-établissements et retour accueil.
Le pont navigateur simule Auth/transport : aucun succès Supabase distant déduit.
Les tests de configuration comptent 78 contrôles et 8 scénarios navigateur avec
SDK réel/backend intercepté, dont refus Production depuis développement.

Exécution effective locale le 17 octobre 2026 :

| Commande | Résultat |
| --- | --- |
| node tests/schema-reconstruction.cjs | PASS : blocages attendus, rollback, contrat minimal et extraction READ ONLY |
| node tests/reservations-postgres.cjs | PASS : 62 contrôles |
| node tests/reservations-browser.cjs | PASS : desktop/clavier et mobile/toucher |
| node tests/environment-isolation.cjs | PASS : 78 contrôles |
| node tests/environment-browser.cjs | PASS : 8 scénarios, trafic Supabase intercepté |
| node --check sur les 3 nouveaux fichiers CJS | PASS |
| git diff --check (y compris fichiers ajoutés) | PASS |

Node 24, PostgreSQL 16 en Docker sans réseau, Chromium /usr/bin/chromium,
Playwright et SDK Supabase 2.57.4 de test hors dépôt. Aucun test GoTrue ni
PostgREST réel, aucune connexion cloud et aucun test iPhone physique dans cette
mission. Les tests historiques sans rapport avec ces outils ne sont pas rejoués ;
aucun code applicatif n'est modifié.

## E. Futur Supabase distinct — procédure après autorisation

1. Faire récupérer/revoir le schéma manquant selon `EXTRACTION.md`. Versionner la
   baseline revue, son origine/version et SHA256 ; la rejouer sur base locale
   vierge avant toute application distante. Ne pas compléter les manques à l'intuition.
2. Faire autoriser coût/région/création d'un **nouveau** projet. Noter sa référence
   propre ; refuser `gjwvquhoecfikjorapud` et le projet LUnion Connect. Aucun
   identifiant déclaré dans un manifeste ne prouve la destination d'une connexion.
3. Utiliser les paramètres du nouveau projet seulement, vérifier son identité
   Dashboard/connexion par deux contrôles indépendants. Ne copier ni Auth users,
   données, secrets, webhooks, jobs ni intégrations de Production.
4. Suivre `../environments/README.md` : `prepare-development-sql.cjs` prépare
   hors ligne baseline revue + contrôle 10 + migration Réservations + contrôle 30,
   avec manifeste d'empreintes. Ce script ne connecte et n'applique rien.
   Ne pas rejouer les incrémentales sur une baseline qui les inclut déjà.
5. Appliquer uniquement après nouvelle autorisation sur le nouveau projet
   vérifié ; arrêter à toute erreur. Tester alors réellement Auth et PostgREST.
6. Créer par GoTrue/Admin Auth **du projet test**, jamais par INSERT direct dans
   auth.users, six comptes fictifs : gestionnaire A, lecteur A, gestionnaire B,
   utilisateur A+B, profil inactif, utilisateur sans appartenance. Utiliser des
   adresses contrôlées de test, pas de vraies identités. `.invalid` convient aux
   fixtures locales, pas à la validation de livraison d'emails. Laisser Auth
   générer les UUID ; contrôler le trigger profils de la baseline, puis provisionner
   permissions et appartenances explicites conformément au schéma vérifié.
   Ne pas inventer un script de profils avant de connaître ce trigger.
7. Créer deux établissements fictifs et leurs salles/tables. Avec de vrais JWT
   utilisateur, vérifier refus anon/inactif/sans appartenance, lecture seule,
   CRUD A/B, refus accès croisé et écritures directes, conflit de version, audit,
   reconnexion/rechargement. Un test service_role ne prouve jamais la RLS.
8. Désactiver/enfermer emails et intégrations de test ; Site URL/redirections
   exclusivement test. Toute fonction serveur requise aura ses secrets dans le
   nouveau projet seulement, jamais dans le frontend.

## F. Futur Vercel distinct et vérification effective

Après autorisation séparée, créer un projet distinct de `stopflow-app`, sans
domaines de Production ni promotion automatique vers celle-ci. Régler framework
Other, build `node scripts/build-environment.cjs`, sortie `.stopflow-dist`.
Renseigner uniquement les paramètres publics de `.env.example` avec les valeurs
du nouveau Supabase. Activer les métadonnées système Vercel ; épingler le nouvel
ID via STOPFLOW_VERCEL_PROJECT_ID, égal à VERCEL_PROJECT_ID. Ne pas déduire
l'environnement de la branche ou de VERCEL_ENV : choisir explicitement development.

Avant envoi, construire dans un dossier neuf ; vérifier la configuration générée
et son hash de script dans index.html. Le dossier ne doit contenir ni SQL, .env,
fonctions serveur, tests ou documentation. Exécuter les tests d'isolation.
Après déploiement futur autorisé, télécharger depuis **l'URL exacte** index.html
et son script de configuration référencé, comparer leurs empreintes à l'artefact
du build (éventuelles transformations CDN à examiner), vérifier environment,
référence Supabase test, origines et absence de clé serveur. Vérifier no-store
sur la configuration et la compatibilité des routes d'icônes /api.

Dans DevTools, tester connexion et CRUD avec un compte fictif : toutes les
requêtes Auth/REST/RPC doivent viser la référence test, aucune Production.
Un test négatif local de configuration manquante/Production doit bloquer avant
la création du client ; ne jamais tester une écriture contre Production.
Comparer l'UUID créé au rechargement et dans le projet test. Puis tester iPhone
réel : connexion, navigation clavier/toucher, CRUD et persistance après fermeture.
Une Preview doit rester accessible aux testeurs avec la protection d'accès voulue.
Aucune URL Preview n'existe dans ce livrable, aucune validation cloud annoncée.

## G. Informations et autorisations restant nécessaires

Métadonnées puis DDL revus de tous les objets public/private et contrats Auth,
historique versions/noms, extensions, paramètres d'exposition PostgREST et Auth
sans secrets ; baseline vérifiée et fixtures/provisioning compatibles ; autorisation
de coût/création de deux projets distincts, puis d'application/déploiement.
Ne transmettre aucun mot de passe, token administratif ou service_role dans le chat.

## H–I. Git et sécurité

Un commit local dédié succède à 8de30a1. Sources applicatives, migrations
historiques, main et références distantes inchangées. Le SHA final est donné
dans le rapport de livraison, l'inclure ici créerait une référence circulaire.
Aucun push, fetch, appel cloud, déploiement, création de projet ou écriture
Supabase effectués pendant cette mission. Aucun début de partie 2.
