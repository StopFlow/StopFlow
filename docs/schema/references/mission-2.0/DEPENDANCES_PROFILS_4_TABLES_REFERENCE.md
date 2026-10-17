# STOPFLOW — MISSION 2.0 — Catalogue réel de 4 tables dépendantes

**Source :** PostgreSQL de StopFlow Production, `gjwvquhoecfikjorapud`, requêtes `SELECT` de métadonnées `pg_catalog`, `pg_indexes`, `pg_policies` réalisées le 17/10/2026. **Aucune ligne métier consultée.**

**STATUT : RÉFÉRENCE PARTIELLE, NON UNE MIGRATION ; NON SUFFISANT POUR REJOUER LE SCHÉMA.** L'ordre des créations et les rôles de l'environnement Supabase doivent être revérifiés par Codex. Ne rien exécuter directement en Production ni en branche distante.

## Point bloquant levé : `ON CONFLICT(profile_id,department)`

Table `public.profile_departments` :

```sql
CONSTRAINT profile_departments_pkey PRIMARY KEY (profile_id, department)
```

Cette contrainte **non partielle** rend le `ON CONFLICT (profile_id, department)` de `private.stopflow_060_sync_primary_assignment()` possible.

Il existe **en plus** un index unique partiel qui impose au plus un département principal par profil :

```sql
CREATE UNIQUE INDEX profile_departments_one_primary_idx
  ON public.profile_departments USING btree (profile_id)
  WHERE (is_primary = true);
```

Tester les transitions d'affectation pour éviter toute violation temporaire de cet index.

## Colonnes, types, défauts et contraintes

### `public.profile_departments`

| Colonne | Type | NOT NULL | Défaut |
|---|---|---:|---|
| `profile_id` | uuid | oui | — |
| `department` | text | oui | — |
| `is_primary` | boolean | oui | false |
| `created_at` | timestamptz | oui | now() |
| `updated_at` | timestamptz | oui | now() |

Contraintes actuelles :

```sql
CONSTRAINT profile_departments_pkey PRIMARY KEY (profile_id, department);
CONSTRAINT profile_departments_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
CONSTRAINT profile_departments_operational_check
  CHECK (department = ANY (ARRAY['salle'::text, 'cuisine'::text, 'nettoyage'::text]));
```

Index supplémentaires :

```sql
CREATE INDEX profile_departments_department_idx ON public.profile_departments USING btree (department, profile_id);
CREATE UNIQUE INDEX profile_departments_one_primary_idx ON public.profile_departments USING btree (profile_id) WHERE (is_primary = true);
```

### `public.profile_permissions`

| Colonne | Type | NOT NULL | Défaut |
|---|---|---:|---|
| `profile_id` | uuid | oui | — |
| `permission_key` | text | oui | — |
| `scope` | text | oui | — |
| `created_at` | timestamptz | oui | now() |
| `created_by` | uuid | non | — |

Contraintes actuelles :

```sql
CONSTRAINT profile_permissions_pkey PRIMARY KEY (profile_id,permission_key,scope);
CONSTRAINT profile_permissions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
CONSTRAINT profile_permissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
CONSTRAINT profile_permissions_scope_check CHECK (scope = ANY (ARRAY['global'::text,'cuisine'::text,'salle'::text,'nettoyage'::text]));
CONSTRAINT profile_permissions_key_scope_check CHECK (
  (permission_key = ANY (ARRAY['ideas.share'::text,'banners.manage'::text,'settings.manage'::text]) AND scope = 'global'::text)
  OR (permission_key = ANY (ARRAY['temperatures.use'::text,'temperatures.readings.use'::text,'temperatures.equipment.manage'::text,'lunchs.view'::text,'lunchs.manage'::text,'monthly_suggestions.view'::text,'monthly_suggestions.manage'::text]) AND scope = 'cuisine'::text)
  OR (permission_key = ANY (ARRAY['inventory.use'::text,'history.view'::text,'checklists.run'::text,'orders.manage'::text,'checklists.review'::text,'checklists.templates.manage'::text,'alerts.view'::text,'suppliers.manage'::text,'articles.manage'::text]) AND scope = ANY (ARRAY['cuisine'::text,'salle'::text,'nettoyage'::text]))
);
```

Index supplémentaires :

```sql
CREATE INDEX profile_permissions_key_scope_idx ON public.profile_permissions USING btree (permission_key, scope, profile_id);
```

### `public.deleted_user_identities`

| Colonne | Type | NOT NULL | Défaut |
|---|---|---:|---|
| `id` | uuid | oui | gen_random_uuid() |
| `former_user_id` | uuid | non | — |
| `email` | text | oui | — |
| `prenom` | text | non | — |
| `nom` | text | non | — |
| `role` | text | non | — |
| `deleted_by` | uuid | non | — |
| `deleted_at` | timestamptz | oui | now() |

Contraintes actuelles :

```sql
CONSTRAINT deleted_user_identities_pkey PRIMARY KEY (id);
CONSTRAINT deleted_user_identities_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
CONSTRAINT deleted_user_identities_role_check CHECK (role IS NULL OR role = ANY (ARRAY['admin'::text, 'responsable'::text, 'employe'::text]));
```

Index supplémentaires :

```sql
CREATE INDEX deleted_user_identities_deleted_by_idx ON public.deleted_user_identities USING btree (deleted_by);
CREATE INDEX deleted_user_identities_email_idx ON public.deleted_user_identities USING btree (lower(email));
CREATE UNIQUE INDEX deleted_user_identities_former_user_id_idx ON public.deleted_user_identities USING btree (former_user_id) WHERE (former_user_id IS NOT NULL);
```

### `public.user_admin_events`

| Colonne | Type | NOT NULL | Défaut |
|---|---|---:|---|
| `id` | bigint | oui | `GENERATED ALWAYS AS IDENTITY` |
| `actor_user_id` | uuid | non | — |
| `target_user_id` | uuid | non | — |
| `target_email` | text | non | — |
| `action` | text | oui | — |
| `details` | jsonb | oui | `'{}'::jsonb` |
| `created_at` | timestamptz | oui | now() |

Contraintes actuelles :

```sql
CONSTRAINT user_admin_events_pkey PRIMARY KEY (id);
CONSTRAINT user_admin_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CONSTRAINT user_admin_events_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CONSTRAINT user_admin_events_action_check CHECK (action = ANY (ARRAY['create'::text,'update'::text,'activate'::text,'deactivate'::text,'delete'::text,'reset_password'::text,'invite'::text]));
```

Index supplémentaires :

```sql
CREATE INDEX user_admin_events_actor_idx ON public.user_admin_events USING btree (actor_user_id);
CREATE INDEX user_admin_events_actor_user_id_idx ON public.user_admin_events USING btree (actor_user_id);
CREATE INDEX user_admin_events_created_at_idx ON public.user_admin_events USING btree (created_at DESC);
CREATE INDEX user_admin_events_target_user_id_idx ON public.user_admin_events USING btree (target_user_id);
```

**Attention :** les index `actor_idx` et `actor_user_id_idx` coexistent dans le schéma réel, même s'ils semblent redondants. Ne pas les supprimer ou « corriger » sans validation séparée.

## RLS et ACL finales observées

Les **quatre tables** ont `RLS ENABLED`, `FORCE RLS = false`, propriétaire `postgres`. Les permissions PostgreSQL observées sont les ACL suivantes (formes littérales de `relacl`) :

```
deleted_user_identities : {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
profile_departments    : {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
profile_permissions    : {postgres=arwdDxtm/postgres,authenticated=rDxtm/postgres,service_role=arwdDxtm/postgres}
user_admin_events      : {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
```

**Rappel :** ACL = privilèges de table, RLS = filtrage des lignes ; des privilèges étendus avec RLS ne signifient pas un droit réel de lecture/écriture sans policy. Ne pas simplifier les ACL dans la baseline sans analyse.

Policies observées :

| Table | Policy | Commande | Rôle | USING | WITH CHECK |
|---|---|---|---|---|---|
| deleted_user_identities | deleted_user_identities_admin_select | SELECT | authenticated | `private.is_admin()` | — |
| deleted_user_identities | deleted_user_identities_no_client_insert | INSERT | authenticated | — | `false` |
| profile_departments | profile_departments_manage | ALL | authenticated | `private.is_admin()` | `private.is_admin()` |
| profile_departments | profile_departments_read | SELECT | authenticated | `(profile_id = auth.uid()) OR private.is_admin()` | — |
| profile_permissions | profile_permissions_manage | ALL | authenticated | `private.is_admin()` | `private.is_admin()` |
| profile_permissions | profile_permissions_read | SELECT | authenticated | `(profile_id = auth.uid()) OR private.is_admin()` | — |
| user_admin_events | user_admin_events_select_admin | SELECT | authenticated | `(SELECT private.is_admin())` | — |

Toutes les policies sont **PERMISSIVE**. Aucun trigger applicatif non-interne observé directement sur ces quatre tables lors de cette lecture (mais cela ne couvre pas d'autres tables).

## Comptage global constaté (schéma Production actuel)

- 24 tables `public` ordinaires
- 56 fonctions `public` + `private`
- 63 policies sur `public`
- 16 triggers non-internes sur `public`
- 5 séquences `public`

Ces nombres permettent un contrôle de couverture, **pas une preuve que toute la structure est reconstruite**. D'autres objets (types, extensions, grants de fonction, déclencheur `auth.users`, propriétés de séquences, vues) doivent être exportés avec leur définition.
