# STOPFLOW — Mission 1.8 / extraction ciblée authentique

Extraction réalisée en **lecture seule** sur la base Supabase Production StopFlow
(ref `gjwvquhoecfikjorapud`), après le retour Codex de la mission 1.7.
Aucune commande `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER` ni réparation n'a
été **exécutée** dans Supabase ; le SQL des fichiers est une documentation.

## Fichiers et degré de confiance

1. `20260801214108_create_shared_orders_workflow_REFERENCE.sql` : SQL **intégral**
   de la première migration distante ; 11 033 caractères ; empreinte MD5
   **39e0dab3f768e2fb6a9f3a68261710e5**, identique à l'original dans
   `supabase_migrations.schema_migrations.statements[1]`.
   Aucun littéral ressemblant à une adresse e-mail ni à un UUID n'y figurait,
   et il n'y avait aucune instruction `INSERT INTO` / `DELETE FROM`.
   **Ne pas la rejouer telle quelle sur une baseline finale ni sur Production.**
2. `PROFILES_ACTUAL_REFERENCE.sql` : *reconstruction documentaire* de l'état
   **actuel** de `public.profiles`, à partir des 9 colonnes, 6 contraintes,
   2 index, 2 politiques RLS, 3 triggers et ACL réellement lus.
   Le SQL est réordonné pour la lisibilité ; **il n'est pas une migration historique
   fidèle** et dépend d'autres fonctions qui ne sont pas incluses dans ce ZIP.
3. `HANDLE_NEW_USER_AND_AUTH_TRIGGER_REFERENCE.sql` : définition de
   `public.handle_new_user()`, propriétaire et ACL, ainsi que le DDL réel du
   trigger `auth.users.on_auth_user_created`.
4. `INSTRUCTIONS_CODEX.md` : suite de la mission, conditions et livrables.

## Ce que cette collecte démontre

La première migration datée `20260801214108` tente d'emblée
`CREATE TABLE public.orders`, avec des clés étrangères vers
`public.profiles(id)`. La création de `public.profiles` ne précède pas cette
migration : c'est la cause exacte confirmée par le log `42P01`.

L'état final de `public.profiles` a **bien** une clé primaire sur `id`, une
contrainte `UNIQUE(email)` et une FK vers `auth.users(id)`. Des fonctions de
sécurité et un trigger Auth existent, mais leur ordre et leurs dépendances
restent à résoudre dans la nouvelle baseline.

## Limitations / procédure

- La totalité du schéma final (24 tables, 56 fonctions, 63 RLS, autres index,
  triggers, séquences, ACL et extensions) **reste incomplète** dans le dépôt.
- Les 4 fonctions de protection des comptes ayant des e-mails administratifs
  codés en dur ne sont **pas** incluses. Leur traitement doit préserver des
  identités *distinctes*, avec une proposition explicitement approuvée.
- Pour récupérer la totalité de l'historique Supabase dans l'atelier de Codex,
  étudier **uniquement après `supabase migration fetch --help`** la récupération
  read-only avec une connexion autorisée. Pas de mot de passe / jeton en chat.
  Toute synchronisation ou réparation de l'historique *distant* est interdite.
- Une baseline d'état **final** doit être testée avec `supabase db reset` sur une
  instance **locale isolée** incluant Auth/GoTrue/PostgREST ; ne pas rejouer les
  45 migrations historiques après la baseline.
- La branche distante `stopflow-reservations-test` (`ojqbzyrwuyjggbyphdqi`)
  existe avec statut `MIGRATIONS_FAILED`. La conserver, réinitialiser, supprimer
  ou lui appliquer du SQL nécessite une décision distincte de l'utilisateur.
  Tant qu'elle existe, elle peut générer des frais de calcul.

## Isolation

`Production`: `gjwvquhoecfikjorapud`. `LUnion Connect`: `mywiuegzzldjlsgfiwks`.
Ne modifier ni l'une ni l'autre. Aucun push, aucun déploiement.
