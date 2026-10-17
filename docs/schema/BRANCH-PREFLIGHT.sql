-- Read-only diagnostic, NOT an installer or remote identity proof.
-- Run only on the independently verified future TEST branch.
begin read only;
set local search_path=pg_catalog;
select expected.name as expected_table,c.relkind,c.relrowsecurity,c.relforcerowsecurity
from unnest(array[
 'activity_events','app_settings','article_categories','articles','checklist_run_items',
 'checklist_runs','checklist_suggestions','checklist_template_items','checklist_templates',
 'deleted_user_identities','department_content','order_lines','orders',
 'profile_card_preferences','profile_departments','profile_permissions','profiles',
 'proposal_notifications','suppliers','team_banners','temperature_equipment',
 'temperature_readings','temperature_rounds','user_admin_events']) expected(name)
left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=expected.name
order by expected.name;

select to_regnamespace('private') is not null as private_schema_present,
 to_regprocedure('auth.uid()') is not null as auth_uid_present,
 (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')) as platform_roles_present;

select a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull
from pg_attribute a where a.attrelid=to_regclass('public.profiles')
 and a.attname in ('id','actif','role') and a.attnum>0 and not a.attisdropped
order by a.attname;
select k.conname,pg_get_constraintdef(k.oid) as definition
from pg_constraint k where k.conrelid=to_regclass('public.profiles') and k.contype in ('p','u','f')
order by k.conname;

select t.tgname,t.tgenabled,t.tgfoid::regprocedure::text as function
from pg_trigger t where t.tgrelid=to_regclass('auth.users') and not t.tgisinternal order by t.tgname;

select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p') and c.relname like 'reservation\_%' escape '\'
order by c.relname;
rollback;
