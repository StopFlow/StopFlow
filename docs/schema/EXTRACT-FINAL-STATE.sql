-- REFERENCE EXTRACTION ONLY, NOT A MIGRATION. No execution in this mission.
-- Future authorized reader: inspect output privately BEFORE sharing.
-- Bodies/defaults/comments/expressions MAY contain private constants.
-- No business rows, auth.users rows, credentials, sequence values or migration statements.
begin read only;
set local search_path = pg_catalog;

select 'schemas' as section, nspname, pg_get_userbyid(nspowner) as owner, nspacl
from pg_namespace where nspname in ('public','private') order by nspname;

select 'relations' as section, n.nspname, c.relname, c.relkind,
 pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity,
 c.relacl, obj_description(c.oid,'pg_class') as comment
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S','f')
order by n.nspname,c.relname;

select 'columns' as section,n.nspname,c.relname,a.attnum,a.attname,
 format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,a.attidentity,a.attgenerated,
 pg_get_expr(d.adbin,d.adrelid) as default_or_generation,a.attacl,
 a.attcollation::regcollation::text as collation,col_description(c.oid,a.attnum) as comment
from pg_attribute a join pg_class c on c.oid=a.attrelid
join pg_namespace n on n.oid=c.relnamespace
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','f')
 and a.attnum>0 and not a.attisdropped order by n.nspname,c.relname,a.attnum;

select 'constraints' as section,n.nspname,c.relname,k.conname,k.contype,
 k.convalidated,k.condeferrable,k.condeferred,pg_get_constraintdef(k.oid,true) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
order by n.nspname,c.relname,k.conname;

select 'indexes' as section,n.nspname,c.relname,x.relname as index_name,
 i.indisvalid,pg_get_indexdef(i.indexrelid) as definition
from pg_index i join pg_class c on c.oid=i.indrelid
join pg_class x on x.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') order by n.nspname,c.relname,x.relname;

select 'functions' as section,n.nspname,p.proname,
 pg_get_function_identity_arguments(p.oid) as identity_arguments,
 pg_get_userbyid(p.proowner) as owner,p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.prokind in ('f','p')
order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);

select 'triggers' as section,n.nspname,c.relname,t.tgname,t.tgenabled,
 t.tgfoid::regprocedure::text as function,pg_get_triggerdef(t.oid,true) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and (n.nspname in ('public','private') or (n.nspname='auth' and c.relname='users'))
order by n.nspname,c.relname,t.tgname;

select 'policies' as section,schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','private') order by schemaname,tablename,policyname;

select 'types' as section,n.nspname,t.typname,t.typtype,t.typbasetype::regtype::text,
 t.typnotnull,t.typdefault,t.typacl,pg_get_userbyid(t.typowner) as owner,
 (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid) as labels,
 (select jsonb_agg(pg_get_constraintdef(k.oid,true) order by k.conname) from pg_constraint k where k.contypid=t.oid) as domain_constraints
from pg_type t join pg_namespace n on n.oid=t.typnamespace
where n.nspname in ('public','private') and t.typtype in ('e','d','c','r','m')
order by n.nspname,t.typname;

select 'sequences' as section,n.nspname,c.relname,
 s.seqtypid::regtype::text,s.seqstart,s.seqincrement,s.seqmin,s.seqmax,s.seqcache,s.seqcycle
from pg_sequence s join pg_class c on c.oid=s.seqrelid
join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
order by n.nspname,c.relname;

select 'views' as section,n.nspname,c.relname,c.reloptions,pg_get_viewdef(c.oid,true) as definition
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relkind in ('v','m') order by n.nspname,c.relname;

select 'default_acl' as section,pg_get_userbyid(a.defaclrole) as owner,n.nspname,a.defaclobjtype,a.defaclacl
from pg_default_acl a left join pg_namespace n on n.oid=a.defaclnamespace
where n.nspname in ('public','private') or a.defaclnamespace=0 order by owner,n.nspname,a.defaclobjtype;

select 'extensions' as section,e.extname,e.extversion,n.nspname as schema
from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by e.extname;

-- Catalog dependencies supplement, but do not resolve dynamic SQL/body dependencies.
select 'dependencies' as section,pg_describe_object(d.classid,d.objid,d.objsubid) as object,
 pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) as dependency,d.deptype
from pg_depend d
where exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where d.classid='pg_class'::regclass and d.objid=c.oid and n.nspname in ('public','private'))
or exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where d.classid='pg_proc'::regclass and d.objid=p.oid and n.nspname in ('public','private'))
order by object,dependency;
rollback;
