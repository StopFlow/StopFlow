-- STOPFLOW — EXTRACTION STRUCTURE SEULEMENT / LECTURE SEULE
-- Cible documentée : projet Supabase StopFlow's Project, ref gjwvquhoecfikjorapud.
-- Aucun SELECT * sur les tables de données. Aucun COPY/pg_read_file/programme OS.
-- Ne pas exécuter sur LUnion Connect. Ne pas partager les sorties brutes avant revue.
-- Ces requêtes ne sont PAS des migrations. Elles doivent être exécutées séparément.
-- Les définitions finales peuvent contenir des constantes / adresses protégées.
-- Note : pour une reproduction complète Auth/GoTrue/PostgREST, utiliser un environnement Supabase local, pas seulement un PostgreSQL vierge.

-- [01] Colonnes des tables métier, avec attributs, types, défauts et identity.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       a.attnum AS column_order, a.attname AS column_name,
       pg_catalog.format_type(a.atttypid,a.atttypmod) AS sql_type,
       a.attnotnull AS not_null, a.attidentity AS identity_mode,
       a.attgenerated AS generated_mode,
       pg_get_expr(d.adbin,d.adrelid) AS default_or_generation,
       coll.collname AS collation
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
LEFT JOIN pg_collation coll ON coll.oid=a.attcollation AND a.attcollation<>(SELECT oid FROM pg_collation WHERE collname='default' LIMIT 1)
WHERE n.nspname='public' AND c.relkind IN ('r','p')
ORDER BY n.nspname,c.relname,a.attnum;

-- [02] Contraintes finales (PK, FK, UNIQUE, CHECK, exclusions).
SELECT n.nspname AS schema_name,c.relname AS table_name,
       x.conname,x.contype,pg_get_constraintdef(x.oid,true) AS definition,
       x.convalidated,x.condeferrable,x.condeferred
FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
ORDER BY c.relname,x.contype,x.conname;

-- [03] Index exacts (inclut les index supportant certaines contraintes).
SELECT n.nspname AS schema_name,c.relname AS table_name,
       i.relname AS index_name,
       pg_get_indexdef(i.oid) AS definition,
       x.indisprimary,x.indisunique,x.indisexclusion,x.indisvalid
FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_class i ON i.oid=x.indexrelid
WHERE n.nspname='public'
ORDER BY c.relname,i.relname;

-- [04] Politiques RLS finales et état RLS des relations.
SELECT n.nspname AS schema_name,c.relname AS table_name,
       c.relrowsecurity,c.relforcerowsecurity,
       p.policyname,p.permissive,p.roles,p.cmd,p.qual,p.with_check
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname=n.nspname AND p.tablename=c.relname
WHERE n.nspname='public' AND c.relkind IN ('r','p')
ORDER BY c.relname,p.policyname;

-- [05] Triggers personnalisés métier et Auth (ne pas exporter les tables Auth).
SELECT n.nspname AS schema_name,c.relname AS table_name,
       t.tgname AS trigger_name,t.tgenabled,
       pg_get_triggerdef(t.oid,true) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal
   OR (n.nspname='auth' AND c.relname='users' AND NOT t.tgisinternal
       AND t.tgfoid IN (SELECT p.oid FROM pg_proc p JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE pn.nspname='public'))
ORDER BY n.nspname,c.relname,t.tgname;

-- [06] Fonctions + propriétés + définitions.
-- Les 4 fonctions de protection de comptes ont leurs e-mails remplacés.
-- Les textes redigés NE SONT PAS des migrations exécutables sans revue.
SELECT n.nspname AS schema_name,p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS result_type,
       l.lanname AS language,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,p.provolatile AS volatility,
       p.proconfig,p.proacl,
       CASE WHEN (n.nspname,p.proname) IN
            (('private','protect_core_accounts'),
             ('private','protect_main_admin'),
             ('public','admin_set_user_access'),
             ('public','admin_set_user_profile_permissions_070'))
          THEN regexp_replace(pg_get_functiondef(p.oid),
               '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
               'REDACTED_EMAIL_FOR_TEST_REPLACE','gi')
          ELSE pg_get_functiondef(p.oid)
       END AS reviewed_definition,
       (n.nspname,p.proname) IN
            (('private','protect_core_accounts'),
             ('private','protect_main_admin'),
             ('public','admin_set_user_access'),
             ('public','admin_set_user_profile_permissions_070')) AS needs_manual_protected_identity_review,
       md5(pg_get_functiondef(p.oid)) AS original_ddl_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_language l ON l.oid=p.prolang
WHERE n.nspname IN ('public','private')
ORDER BY n.nspname,p.proname,arguments;

-- [07] Séquences et leurs paramètres SANS récupérer la valeur courante.
SELECT n.nspname AS schema_name,c.relname AS sequence_name,
       format_type(s.seqtypid,NULL) AS sequence_type,
       s.seqstart,s.seqincrement,s.seqmin,s.seqmax,s.seqcache,s.seqcycle,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
ORDER BY c.relname;

-- [08] Dépendances de séquence / ownership (sans lire de valeur courante).
SELECT sn.nspname AS schema_name,s.relname AS sequence_name,
       tn.nspname AS owning_schema,t.relname AS owning_table,
       a.attname AS owning_column,d.deptype AS dependency_type
FROM pg_class s JOIN pg_namespace sn ON sn.oid=s.relnamespace
JOIN pg_depend d ON d.objid=s.oid AND d.classid='pg_class'::regclass
JOIN pg_class t ON t.oid=d.refobjid
JOIN pg_namespace tn ON tn.oid=t.relnamespace
JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
WHERE s.relkind='S' AND sn.nspname='public'
ORDER BY s.relname;

-- [09] Types énumérés métier.
SELECT n.nspname AS schema_name,t.typname AS enum_name,
       e.enumsortorder,e.enumlabel
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
JOIN pg_enum e ON e.enumtypid=t.oid
WHERE n.nspname IN ('public','private')
ORDER BY n.nspname,t.typname,e.enumsortorder;

-- [10] Propriétaires, ACL des tables/séquences, schémas et fonctions.
-- Conserver les GRANT/REVOKE finaux ; ne pas supposer que RLS seule suffit.
SELECT n.nspname,c.relname,c.relkind,
       pg_get_userbyid(c.relowner) AS owner,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','S','v','m')
ORDER BY n.nspname,c.relname;
SELECT n.nspname,pg_get_userbyid(n.nspowner) AS owner,n.nspacl
FROM pg_namespace n WHERE n.nspname IN ('public','private');

-- [11] Extensions nécessaires. Les composants Supabase de plateforme sont
-- à provisionner normalement par Supabase, et non recréés dans les migrations métier.
SELECT e.extname,e.extversion,n.nspname AS installed_schema
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
ORDER BY e.extname;

-- [12] Métadonnées de l'historique de migration sans contenu ni données privées.
-- Si la table n'existe pas sur une instance locale, cette dernière requête échouera
-- sans modifier l'environnement ; préférer également l'outil Supabase list_migrations.
SELECT version,name
FROM supabase_migrations.schema_migrations
ORDER BY version;
