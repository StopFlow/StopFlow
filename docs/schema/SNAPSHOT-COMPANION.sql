-- Run only by the authorized reader, in the SAME read-only repeatable-read
-- transaction exporting the snapshot used by pg_dump. Save privately, review
-- constants before sharing. No business rows, users, sequence values or secrets.
select current_setting('server_version') as server_version;
select nspname,nspacl,pg_get_userbyid(nspowner) as owner from pg_namespace where nspname in ('public','private');
select pg_get_userbyid(d.defaclrole) as creator,n.nspname,d.defaclobjtype,d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
where d.defaclnamespace=0 or n.nspname in ('public','private') order by creator,n.nspname,d.defaclobjtype;
select r.rolname,r.rolsuper,r.rolinherit,r.rolbypassrls from pg_roles r order by r.rolname;
select pg_get_userbyid(m.roleid) as granted_role,pg_get_userbyid(m.member) as member,m.admin_option from pg_auth_members m order by granted_role,member;
select e.extname,e.extversion,n.nspname,e.extrelocatable from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by e.extname;
select t.tgname,t.tgenabled,t.tgfoid::regprocedure::text as function,pg_get_triggerdef(t.oid,true) as definition
from pg_trigger t where t.tgrelid=to_regclass('auth.users') and not t.tgisinternal order by t.tgname;
select e.evtname,e.evtenabled,e.evtfoid::regprocedure::text as function from pg_event_trigger e order by e.evtname;
select pg_describe_object(d.classid,d.objid,d.objsubid) as object,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) as dependency,d.deptype
from pg_depend d where exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where d.classid='pg_class'::regclass and d.objid=c.oid and n.nspname in ('public','private'))
or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where d.classid='pg_proc'::regclass and d.objid=p.oid and n.nspname in ('public','private')) order by object,dependency;
