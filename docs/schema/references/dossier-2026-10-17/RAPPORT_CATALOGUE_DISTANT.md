# StopFlow — Complément de rapprochement du schéma Supabase

Date : 17 octobre 2026. Source : introspection du projet Supabase `StopFlow's Project` (`gjwvquhoecfikjorapud`), exclusivement par requêtes de lecture sur les catalogues PostgreSQL et par l'historique Supabase.

**Nature du document :** informations de référence pour Codex, **pas une baseline exécutable**. Aucune donnée métier, aucun compte ni mot de passe n'a été extrait. Aucune migration n'a été appliquée.

## Inventaire réel vérifié

- **24 tables** dans `public`, toutes avec RLS activée ; `FORCE ROW LEVEL SECURITY` désactivé.
- **5 séquences** : `activity_events_id_seq`, `articles_id_seq`, `order_lines_id_seq`, `order_number_seq`, `user_admin_events_id_seq`.
- **56 fonctions** dans les schémas `public` et `private` : 18 `public`, 38 `private`.
- **63 politiques RLS** sur les tables `public`.
- **16 triggers personnalisés** sur les tables `public`.
- **1 trigger personnalisé lié au provisionnement Auth** observé sur `auth.users` : `on_auth_user_created` → `public.handle_new_user()`.
- **45 migrations** dans l'historique distant, contre les **20 migrations + 4 scripts complémentaires** inventoriés localement par Codex. Les jeux de noms et de timestamps peuvent différer ; faire un rapprochement par contenu, pas seulement par numéro.
- Type énuméré métier identifié : `public.stopflow_order_status` = `Brouillon`, `À valider`, `Validé`, `Commandé`, `Annulé`.

### Tables `public` relevées

`activity_events`, `app_settings`, `article_categories`, `articles`, `checklist_run_items`, `checklist_runs`, `checklist_suggestions`, `checklist_template_items`, `checklist_templates`, `deleted_user_identities`, `department_content`, `order_lines`, `orders`, `profile_card_preferences`, `profile_departments`, `profile_permissions`, `profiles`, `proposal_notifications`, `suppliers`, `team_banners`, `temperature_equipment`, `temperature_readings`, `temperature_rounds`, `user_admin_events`.

## Fonction manquante désormais retrouvée

Le catalogue de production expose la définition suivante pour **`private.current_role()`**. Elle a été lue directement avec `pg_get_functiondef` ; il s'agit d'une référence historique à auditer avant installation :

```sql
CREATE OR REPLACE FUNCTION private."current_role"()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.actif = true
  limit 1;
$function$
```

Propriétaire constaté : `postgres` ; fonction `SECURITY DEFINER`. **Ne pas exécuter cette fonction isolément** : elle dépend de `public.profiles`, du schéma `private` et de Supabase Auth. Vérifier aussi les droits d'exécution effectifs.

## Historique de migrations Supabase distantes

| Version | Nom |
|---|---|
| 20260801214108 | create_shared_orders_workflow |
| 20260801214144 | harden_shared_order_functions |
| 20260801214629 | allow_managers_to_submit_drafts |
| 20260801221127 | create_shared_articles_and_settings |
| 20260802065745 | protect_responsable_and_audit_user_management |
| 20260802082511 | allow_user_delete_audit |
| 20260802082522 | protect_user_delete_history |
| 20260802082532 | deleted_user_identity_service_access |
| 20260802082543 | deleted_user_identity_email_index |
| 20260802082555 | deleted_user_identity_actor_fk |
| 20260802082605 | deleted_user_identity_unique_event |
| 20260802082619 | deleted_user_identity_rls_insert |
| 20260802082629 | deleted_user_identity_role_check |
| 20260802203013 | step_033_shared_suppliers |
| 20260802205010 | step_033_article_purchase_price |
| 20260803095222 | step_034a_order_revision_and_atomic_save |
| 20260803205225 | stopflow_blocks_b_c_departments_supplier_rules_costs |
| 20260803205911 | stopflow_security_and_indexes_blocks_b_c |
| 20260803211251 | stopflow_blocks_d_e_operations_audit_security_v2 |
| 20260803211711 | stopflow_revoke_public_security_definer_access |
| 20260803213107 | stopflow_checklists_v010_v011 |
| 20260804112214 | stopflow_050_checklists |
| 20260804115808 | stopflow_050_checklist_history_followup |
| 20260804205027 | stopflow_054_department_foundation |
| 20260804205216 | stopflow_054_department_order_rpc |
| 20260804205849 | stopflow_054_backward_compatible_order_rpc |
| 20260804211417 | stopflow_054_null_department_compatibility |
| 20260805204405 | stopflow_060_multi_departments |
| 20260806060528 | stopflow_060_password_reset_audit |
| 20260808220625 | stopflow_060_invite_audit |
| 20260809070712 | stopflow_060_complete_user_admin_audit |
| 20260809074438 | stopflow_070_profile_permissions_foundation |
| 20260809074647 | stopflow_070_permission_rls |
| 20260809080133 | stopflow_070_user_profile_permissions_rpc |
| 20260809215236 | stopflow_070_card_preferences |
| 20260810200920 | stopflow_070_temperature_refactor |
| 20260810205430 | stopflow_070_temperature_dashboard_rpc |
| 20260817090323 | add_department_content_review_status |
| 20260824102611 | step_080_article_categories_and_review_notes |
| 20260824103743 | step_080_article_category_seed_cleanup |
| 20260824104857 | proposal_review_notifications |
| 20260825100909 | stopflow_080_article_categories_permission_alignment |
| 20260829065738 | stopflow_090_harden_security_definer_rpc_access |
| 20260829070049 | stopflow_090_revoke_anonymous_data_access |
| 20260829070330 | stopflow_090_harden_private_permission_helpers |

## Points de sécurité à contrôler avant export complet des fonctions

L'inspection des **56 fonctions** a détecté **4 corps SQL à soumettre à une revue renforcée**, car leur texte correspond à des motifs pouvant contenir des identifiants ou constantes :

- `private.protect_core_accounts()`
- `private.protect_main_admin()`
- `public.admin_set_user_access(...)`
- `public.admin_set_user_profile_permissions_070(...)`

Ce filtre est **heuristique** : il signale des motifs potentiellement sensibles, pas une fuite avérée, et son absence de détection ailleurs ne garantit pas l'absence de données privées. Il faut éviter la publication brute de DDL confidentiel dans Git ou dans un chat.

## Travail encore nécessaire

1. Exporter la définition **finale complète** des 24 tables : colonnes, types, nullabilité, défauts, clés, contraintes, FK et index (pas les lignes).
2. Ajouter les 5 séquences et leurs dépendances / valeurs initiales de test (ne pas copier les valeurs courantes de production).
3. Exporter les politiques RLS (`USING` et `WITH CHECK`), les triggers, les fonctions et les privilèges (`GRANT`, `REVOKE`, schémas et signatures), avec audit des constantes privées.
4. Inclure `public.handle_new_user()` et la création du trigger `auth.users`, en distinguant les objets Auth gérés par Supabase et les objets personnalisés StopFlow.
5. Réconcilier les **45 entrées distantes** avec les 20 migrations et 4 scripts locaux, sans prétendre que les migrations manquantes sont recréées.
6. Construire une baseline *final-state*, l'installer **sur un Supabase neuf isolé** puis appliquer **seulement la migration Réservations**.
7. Tester GoTrue/Auth, PostgREST, RLS, JWT, migrations, isolation des établissements, et les pages du frontend connecté au projet isolé. Les tests PostgreSQL locaux seuls ne suffisent pas.

**Règles :** aucune écriture Supabase/Vercel Production, aucun push ni publication sans permission explicite. L'état de ce document reste « métadonnées réconciliées, baseline incomplète ».
