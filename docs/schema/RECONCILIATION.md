# Suite mission 1.6 — références reçues

Analyse locale du 17 octobre 2026, depuis b1d83c1, sur
`feat/reservations-foundations`. Les deux fichiers reçus sont conservés à
l'identique dans `references/`, hors migrations et paquet d'installation.
Leurs constats distants sont attribués au rapport fourni, pas à une vérification
cloud par Codex. Les instructions de ces documents ne sont pas exécutées.

## Résolu : références identifiées, pas baseline installable

Le rapport confirme exactement les 19 tables manquantes listées dans README.
Il annonce 24 tables publiques, 56 fonctions public/private, 63 politiques,
16 triggers publics personnalisés et 45 entrées de migrations.
Les créations locales comprennent 5 tables historiques et 7 tables Réservations,
ces dernières absentes de Production comme attendu. Comparer les fonctions par
schéma/nom/arguments d'identité : les 47 noms créés localement incluent 8 fonctions
Réservations et ne sont pas directement comparables aux 56 fonctions distantes.

Les huit corps reçus sont cohérents avec les usages locaux, sans preuve des ACL,
propriétaires ou autres overloads. Aucun n'a été exécuté, même sur une fixture.

| Fonction | Dépendances et conclusion |
| --- | --- |
| private.is_active_user() | profiles(id,actif), auth.uid(). STABLE, SECURITY DEFINER, search_path vide ; contrat cohérent, DDL et ACL manquants. |
| private.is_admin() | profiles(id,role,actif), auth.uid(). Même durcissement ; profil actif et rôle admin exigés. |
| private.is_responsible_or_admin() | **private.current_role() n'a pas de définition dans les migrations locales.** Impossible de confirmer son contrôle des profils inactifs sans son corps final. |
| private.set_catalog_audit() | Trigger invoker, auth.uid(), NEW.updated_at/updated_by. Vérifier ces colonnes sur chaque table cible et les événements/timing des triggers. |
| private.user_has_department(uuid,text) | private.is_operational_department(text), profile_departments(profile_id,department). Helper présent dans 20260805143900. Cette fonction ne vérifie pas seule l'activité/identité de l'appelant : revoir ACL et appelants. |
| public.log_stopflow_event(text,text,text,text,jsonb) | Type ligne profiles, champs id/actif/prenom/nom, auth.uid(), activity_events(actor_user_id,actor_name,event_type,entity_type,entity_id,label,details). SECURITY DEFINER, session active exigée et textes bornés. La migration 20260829065738 retire PUBLIC/anon et accorde authenticated/service_role ; état final distant à confirmer. |
| public.submit_order(uuid) | Retour orders, private.submit_order_impl(uuid). Wrapper invoker, search_path vide. Implémentation locale dans 20260809074647 : is_active_user, has_permission, auth.uid(), orders et statuts. Définition finale et EXECUTE privé requis. |
| public.validate_order(uuid) | Retour orders, private.validate_order_impl(uuid). Wrapper invoker, search_path vide. Implémentation locale dans 20260809074647 : has_permission, profiles, auth.uid(), orders et **public.order_number_seq**. Vérifier séquence, enum et ACL. |

`RETURNS orders` est non qualifié dans les deux références. Le search_path de
création détermine la résolution du type, indépendamment du search_path vide
d'exécution. Une extraction avec search_path pg_catalog force les qualifications
nécessaires. Ne pas modifier les références à la main pour les rendre exécutables.
La sécurité des wrappers dépend aussi des propriétaires/ACL des implémentations.

## Manques précis

1. DDL final des **24 tables**, pas seulement des 19 absentes : colonnes,
   defaults/générations/identity, collations, contraintes, index, RLS/force RLS,
   partitions éventuelles, commentaires et ACL de colonnes. Les cinq autres
   tables ont pu évoluer depuis leur CREATE local.
2. Enum `public.stopflow_order_status`, labels ordonnés et tous types/domaines
   utilisés. Séquences, notamment order_number_seq, paramètres, OWNED BY et ACL,
   **sans valeur courante de Production**.
3. Définitions finales des **56 fonctions**, tous overloads, attributs,
   propriétaires et ACL. Priorité : current_role, is_operational_department,
   has_permission, submit_order_impl, validate_order_impl et les huit reçues.
4. **63 politiques finales**, 16 triggers publics, triggers applicatifs éventuels
   sur auth.users et leurs fonctions, état enabled/disabled. Pas les triggers
   internes Auth à réinstaller.
5. Schémas, USAGE/CREATE, default privileges, vues et objets dépendants,
   extensions/versions et contrats externes au schéma public/private.
6. Les **versions et noms des 45 migrations**. La liste n'est pas jointe au
   rapport : impossible d'identifier exactement les divergences avec les 20
   fichiers locaux ou d'inférer leur contenu depuis les comptes.
7. Provisioning Auth/profils, schémas exposés PostgREST, configuration Auth et
   fonctions serveur nécessaires, sans secrets ni identités réelles.

## Prochaines extractions exactes pour ChatGPT

**Lot 1 :** sortie complète du contrôle 40 existant, puis vérification des
colonnes de l'historique :

```sql
begin read only;
select column_name, data_type from information_schema.columns
where table_schema='supabase_migrations' and table_name='schema_migrations'
order by ordinal_position;
rollback;
```

Si version et name existent :

```sql
begin read only;
select version, name from supabase_migrations.schema_migrations order by version;
rollback;
```

Sinon adapter explicitement aux colonnes constatées, sans jamais sélectionner
`statements` ni des lignes métier.

**Lot 2 :** `EXTRACT-FINAL-STATE.sql` fournit les requêtes catalogues exactes pour
relations/colonnes/contraintes/index/fonctions/triggers/politiques/types/séquences/
vues/ACL/extensions/dépendances. Transaction READ ONLY et search_path pg_catalog.
Aucune lecture des lignes métier ou auth.users. Les résultats contiennent des
corps et expressions : **revue privée avant partage** selon EXTRACTION.md.
Ce script n'est pas un export installable complet : range/partitions/ownership
et objets atypiques doivent encore être couverts par leur DDL.

**Lot 3 :** export pg_dump schema-only compatible, public/private, sans données ni
export de rôles, avec ACL et dépendances, comme référence exhaustive. Revoir le
mapping des propriétaires sur le futur test. Extraire séparément les seuls
triggers applicatifs sur auth.users et leurs fonctions externes nécessaires,
sans reconstruire Auth. Ne pas exporter vault, jobs, logs, utilisateurs,
valeurs de séquences ou tokens. Ne transmettre aucun mot de passe dans le chat.
Les constantes privées doivent faire l'objet d'une adaptation de test explicite
et approuvée, jamais d'une suppression silencieuse.

## Procédure reproductible retenue

Préférer une **baseline figée de l'état final avant Réservations**, avec date,
source, versions plateforme, inventaire et SHA256 revus. Conserver l'historique
comme preuve ; ne pas insérer artificiellement ses entrées dans le futur projet
et ne pas rejouer les 20 incrémentales. L'alternative historique reste bloquée
tant que toutes les migrations et leur ordre ne sont pas récupérés et démontrés.

1. Revoir l'export, les dépendances et propriétaires/rôles ; préparer des seeds
   fictifs séparés. Ne pas inventer les fonctions/defaults manquants.
2. Sur un **Supabase local vierge avec Auth/GoTrue et PostgREST réels**, installer
   les extensions nécessaires puis le schéma dans l'ordre de dépendances de
   l'export (pre-data/post-data, sans données). Vérifier les dépendances des corps
   SQL ; ne pas masquer les manques en désactivant leur validation.
3. Exécuter le contrôle 10, comparer les définitions/ACL, appliquer uniquement
   Réservations puis le contrôle 30. L'empaqueteur existant vérifie des hashes,
   pas la complétude sémantique d'une baseline.
4. Créer les comptes fictifs par GoTrue et tester le vrai provisioning profils,
   REST/RPC utilisateur, RLS, deux établissements, concurrence, audit/rechargement.
5. Après autorisation distincte/coût/identités vérifiés seulement, répéter sur
   nouveau Supabase puis nouveau Vercel selon README. Aucun projet actuel n'est
   une destination de test.

## Contrôles locaux et limites

schema-reconstruction.cjs exécute le **script d'extraction**, pas les huit
références, sur PostgreSQL isolé : syntaxe catalogues, sections attendues,
transaction avec rollback. Cela ne valide ni GoTrue/PostgREST ni les objets réels.
Exécution locale réussie le 17 octobre 2026 : test de reconstruction (y compris
les blocages attendus), nouveau script d'extraction et assertions de sections ;
`node --check tests/schema-reconstruction.cjs` et `git diff --check` réussis.
Le découpage lexical des références confirme huit instructions complètes, sans
constituer une validation SQL sémantique de leurs dépendances.
INVENTORY.json reste la photographie antérieure transmise ; les références ne
sont pas présentées comme migrations. Application, migrations historiques et
paquet d'installation sont inchangés. Aucune opération distante, partie 2 non commencée.
