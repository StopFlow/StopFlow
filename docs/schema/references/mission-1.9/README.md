# StopFlow — Mission 1.9 : fonctions profile et sécurité (références)

Collecte le 17/10/2026 sur **StopFlow Production** (`gjwvquhoecfikjorapud`),
**lecture seule** depuis `pg_catalog`. Ne contient aucune ligne utilisateur,
aucune donnée client, aucun secret d'authentification ni les vraies adresses
protégées. Projet **L'Union Connect non consulté**.

## Ce qui est nouveau et documenté

Les trois fonctions **effectivement associées** aux triggers de `public.profiles` :

- `private.stopflow_060_audit_profile_delete()` : audit après suppression,
  dépend de `public.deleted_user_identities` et `public.user_admin_events`.
- `private.stopflow_060_sync_primary_assignment()` : synchronisation des
  départements, dépend de `public.profile_departments`, des contraintes
  `ON CONFLICT(profile_id,department)` et de
  `private.is_operational_department(text)`.
- `private.protect_core_accounts()` : garde les identités principales ; les
  adresses ont été **remplacées** par des adresses fictives **distinctes**.

Une 4e fonction privée ancienne, `private.protect_main_admin()`, a également été
récupérée pour revue. Son caractère historique est à confirmer dans la baseline.
Deux fonctions RPC d'administration :
`public.admin_set_user_access(...)` et
`public.admin_set_user_profile_permissions_070(...)` : définitions source
retranscrites avec anonymisation cohérente des deux identités protégées.

## Correspondance des identités fictives pour tests locaux

- Administrateur principal : `admin-test@example.invalid`.
- Responsable principal : `responsable-test@example.invalid`.

La correspondance est conservée entre les 4 fonctions qui référencent des
identités protégées. Il ne s'agit ni de comptes réels ni d'une autorisation à
changer les protections en Production. **Les deux adresses sont des exemples
pour un environnement de test isolé et nécessitent une approbation explicite
avant intégration définitive.**

## ACL observées en production (pour vérification par Codex)

- `private.protect_core_accounts`: owner `postgres`, `SECURITY DEFINER`,
  ACL explicite `{postgres=X/postgres}`.
- `private.protect_main_admin`: owner `postgres`, `SECURITY DEFINER`,
  ACL `NULL` (ne signifie PAS aucun accès ; contrôler les droits par défaut).
- `private.stopflow_060_audit_profile_delete` : owner `postgres`,
  `SECURITY DEFINER`, ACL `NULL`.
- `private.stopflow_060_sync_primary_assignment` : owner `postgres`,
  `SECURITY DEFINER`, ACL `NULL`.
- `public.admin_set_user_access` et
  `public.admin_set_user_profile_permissions_070` : owner `postgres`,
  `SECURITY DEFINER`, ACL explicitement accordées à `postgres`, `authenticated`
  et `service_role`. Ne pas réutiliser automatiquement ces droits sans revue.

## Contrat / précautions

Les fichiers `.sql` ne sont **pas des migrations** et ne doivent être exécutés
ni dans Supabase Production, ni dans la branche cloud échouée.
Ils documentent le **corps actuel** des fonctions, avec des littéraux
personnels intentionnellement différents. En dehors de cette substitution,
ils sont retranscrits depuis `pg_get_functiondef` ; ils ne constituent pas
un export machine validé bit à bit. Faire comparer par Codex la syntaxe,
les dépendances et les effets de bord dans sa suite de tests.

**Ce qui reste bloquant** : snapshot final de l'ensemble des objets métier
(24 tables, contraintes, index, 63 politiques RLS, 56 fonctions, triggers,
ACL, enums, séquences, extensions) ; environnement Supabase local avec Auth
réel, GoTrue et PostgREST ; validation complète de la baseline et des
propriétaires / droits d'exécution. Pas de GRANT générique ni de politique
`USING (true)` improvisés.

La branche cloud `stopflow-reservations-test` est toujours
`MIGRATIONS_FAILED` ; conserver, corriger ou supprimer cette branche requiert
une autorisation séparée du propriétaire.
