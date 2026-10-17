# StopFlow — Rapprochement du schéma Supabase avec INVENTORY.json

Date : 17 octobre 2026. **Contrôles exclusivement en lecture seule sur Supabase StopFlow Production.**

## Sources et portée

- Dépôt local Codex : inventaire fourni par l'utilisateur, `INVENTORY.json` (fichier JSON de 2 961 lignes).
- Métadonnées Supabase inspectées : projet StopFlow's Project (et non LUnion Connect), catalogues PostgreSQL, liste des tables, fonctions, politiques RLS, triggers et migrations.
- Aucun accès au contenu des lignes métier, à des identifiants utilisateur ni à des secrets.
- L'inventaire source est **lexical**, et son graphe de dépendances est indicatif : les corps de fonctions et les blocs SQL dynamiques nécessitent vérification.

## Comparatif confirmé

| Objet | Base StopFlow actuelle | Créations présentes dans l'inventaire local | Écart |
|---|---:|---:|---|
| Tables `public` | 24 | 5 créations correspondant à des tables actuelles | **19 définitions initiales manquantes** |
| Fonctions `public` + `private` | 56 (18 + 38) | 47 noms créés dans les scripts, incluant les nouvelles fonctions Réservations pas encore installées | Des fonctions historiques initiales manquent |
| Politiques RLS | 63 | L'inventaire mentionne plusieurs migrations, mais ne reconstruit pas l'état historique complet | DDL RLS final à vérifier |
| Triggers personnalisés `public` | 16 | Créations réparties dans scripts et migrations | DDL final et ordre à vérifier |
| Historique des migrations | 45 entrées sur Supabase Production | 20 fichiers sous `migrationOrder` | **Historiques non équivalents** |

À noter : le dépôt contient 7 tables `reservation_*` nouvelles qui **n'existent pas encore dans la base Production** ; c'est normal, elles doivent rester sur l'environnement de développement.

## Les 19 tables sans création initiale exploitable dans la liste des migrations actives

1. `public.activity_events`
2. `public.app_settings`
3. `public.article_categories`
4. `public.articles`
5. `public.checklist_run_items`
6. `public.checklist_runs`
7. `public.checklist_suggestions`
8. `public.checklist_template_items`
9. `public.checklist_templates`
10. `public.deleted_user_identities`
11. `public.department_content`
12. `public.order_lines`
13. `public.orders`
14. `public.profile_departments`
15. `public.profiles`
16. `public.proposal_notifications`
17. `public.team_banners`
18. `public.temperature_readings`
19. `public.user_admin_events`

Treize sont explicitement signalées dans `relationsWithoutCreate`. Six autres ont été retrouvées en comparant les 24 tables de production aux cinq créations historiques disponibles : `app_settings`, `article_categories`, `checklist_suggestions`, `department_content`, `proposal_notifications`, `team_banners`.

## Les fonctions retrouvées (corps SQL en lecture seule)

Huit fonctions historiques marquées absentes ont été retrouvées et leurs définitions lues via `pg_get_functiondef` :

- `private.is_active_user()`
- `private.is_admin()`
- `private.is_responsible_or_admin()`
- `private.set_catalog_audit()`
- `private.user_has_department(uuid,text)`
- `public.log_stopflow_event(text,text,text,text,jsonb)`
- `public.submit_order(uuid)`
- `public.validate_order(uuid)`

Référence fournie séparément : `stopflow_fonctions_manquantes_reference.sql`. **Ce fichier est destiné à la revue Codex et non à une exécution directe**, car il ne comprend ni l'ordre complet des dépendances, ni les privilèges de création et d'exécution, ni les tables manquantes.

`auth.uid()` est une fonction fournie par le schéma Auth de Supabase ; son absence d'une migration applicative ne signifie pas qu'il faut en inventer une copie.

## Deux avertissements critiques

1. Le script `future-online/supabase/schema-propose.sql`, indexé dans `supplemental`, dessine une architecture prospective distincte (notamment une table `establishments` et des colonnes de profils différentes de la base réelle). **Ne pas l'utiliser comme baseline officielle** et ne pas confondre `establishments` avec les futures `reservation_establishments`.
2. Rejouer les 20 migrations locales après une copie du schéma final de production pourrait créer des conflits et des modifications redondantes. Il faut choisir et tester une stratégie explicite : une **baseline figée correspondant au schéma final actuel**, suivie de la migration Réservations, ou un parcours historique intégral réellement réconcilié. Ne pas mélanger sans analyse.

## À extraire ensuite pour rendre la baseline complète

- DDL des 19 tables : colonnes, valeurs par défaut, types, PK/FK, checks, index, commentaires, propriétés identity.
- DDL du type enum `public.stopflow_order_status` et de tous les types custom utilisés.
- DDL des 63 politiques RLS dans leur état final, attributs RLS/force RLS des tables.
- DDL des 16 triggers et des fonctions associées (et triggers éventuels dans d'autres schémas pertinents).
- Définitions finales des fonctions nécessaires et leurs attributs (SECURITY DEFINER, search_path, volatility, propriétaire, ACL/GRANT) après filtrage des constantes privées.
- Configuration nécessaire de Supabase Auth, extensions et dépendances de plateforme ; ne pas reconstruire naïvement `auth` sur un PostgreSQL générique.
- Vérification des migrations absentes du dépôt dans l'historique distant ; ne pas déduire leur contenu du nom.

## Proposition de séquence de travail sécurisée

1. Codex rapproche ce rapport des scripts et marque les écarts vérifiés.
2. Extraire le reste du DDL en lecture seule via une source administrateur autorisée, filtrer secrets/constantes privées ; éviter tout export de données.
3. Reconstituer une baseline versionnée et auditable avec ordre de dépendances.
4. Valider sur un **Supabase local** vierge (Auth/GoTrue + PostgREST réels) puis sur un **projet Supabase Cloud isolé** avec des comptes fictifs, après accord explicite et validation du coût.
5. Installer Réservations ensuite et tester l'isolation RLS, la persistance et la navigation.
6. Aucune modification des projets Production ou LUnion Connect, aucun push ni déploiement sans validation.

**Conclusion :** les 19 tables et les huit fonctions ne sont pas « perdues ». Elles existent dans la base Production mais leurs définitions doivent être intégrées proprement à la baseline de développement. Le schéma complet n'est PAS encore reconstitué, aucun test distant n'a été exécuté.
