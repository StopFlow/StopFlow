-- PROPOSAL ONLY. Not in migrations; never run remotely in mission 2.1.
-- Preconditions: complete snapshot, reviewed creator/global defaults and role
-- memberships, functional tests, explicit approval. Fails closed on global ACLs
-- rather than silently changing defaults for unrelated schemas.
begin;
do $$
declare r record; helper regprocedure;
begin
  helper:=to_regprocedure('private.sync_legacy_profile_permissions(uuid)');
  if helper is null then raise exception 'HELPER_MISSING'; end if;
  if exists(
    select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
    where d.defaclobjtype='r' and d.defaclnamespace=0
      and case when a.grantee=0 then true else
        pg_has_role((select oid from pg_roles where rolname='anon'),a.grantee,'USAGE')
        or pg_has_role((select oid from pg_roles where rolname='authenticated'),a.grantee,'USAGE') end
  ) then raise exception 'GLOBAL_TABLE_DEFAULTS_REQUIRE_EXPLICIT_REVIEW'; end if;
  if exists(
    select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
    where d.defaclobjtype='r' and d.defaclnamespace=to_regnamespace('public')
      and a.grantee not in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'))
      and (pg_has_role((select oid from pg_roles where rolname='anon'),a.grantee,'USAGE')
        or pg_has_role((select oid from pg_roles where rolname='authenticated'),a.grantee,'USAGE'))
  ) then raise exception 'INHERITED_PUBLIC_DEFAULTS_REQUIRE_EXPLICIT_REVIEW'; end if;

  for r in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    execute format('revoke truncate on table %I.%I from public,anon,authenticated',r.nspname,r.relname);
  end loop;

  -- Existing DML/SELECT and all service_role/owner grants remain unchanged.
  -- New public tables require explicit per-table client grants. Include owners
  -- of existing tables and all creators with explicit public table defaults.
  for r in
    select distinct pg_get_userbyid(creator) as name from (
      select c.relowner as creator from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')
      union select d.defaclrole from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public' and d.defaclobjtype='r'
    ) owners
  loop
    execute format('alter default privileges for role %I in schema public revoke all on tables from public,anon,authenticated',r.name);
  end loop;

  -- Do not revoke schema USAGE or read helpers needed by RLS/CHECKs.
  revoke execute on function private.sync_legacy_profile_permissions(uuid) from public,anon,authenticated;
  grant execute on function private.sync_legacy_profile_permissions(uuid) to service_role;

  if has_function_privilege('authenticated',helper,'EXECUTE') or has_function_privilege('anon',helper,'EXECUTE') then
    raise exception 'HELPER_EFFECTIVE_EXECUTE_REMAINS_CHECK_ROLE_INHERITANCE';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
      and (has_table_privilege('authenticated',c.oid,'TRUNCATE') or has_table_privilege('anon',c.oid,'TRUNCATE')))
  then raise exception 'TRUNCATE_EFFECTIVE_GRANT_REMAINS_CHECK_ROLE_INHERITANCE'; end if;
end $$;
commit;
