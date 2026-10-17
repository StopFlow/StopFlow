-- STOPFLOW — MISSION 2.0 — RÉFÉRENCE UNIQUEMENT, NON UNE MIGRATION
-- Fonctions récupérées via SELECT pg_get_functiondef() de StopFlow Production.
-- Ne pas exécuter sur la base distante, ne pas déclarer la baseline complète.
-- Empreinte md5(pg_get_functiondef) indiquée avant chaque fonction.

-- MD5: de47cd2c051dc0dc049f033914fbe9b4
-- OWNER postgres ; SECURITY DEFINER true ; ACL {=X/postgres,postgres=X/postgres,authenticated=X/postgres}
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
$function$;

-- MD5: 920264cf9a4b7d71ba3fc222ffcaacb2
-- OWNER postgres ; SECURITY DEFINER true ; ACL {postgres=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and actif = true
  );
$function$;

-- MD5: 456db42d1c0070a6a898506575daeb4d
-- OWNER postgres ; SECURITY DEFINER false ; ACL {postgres=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION private.is_operational_department(p_department text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(p_department in ('salle','cuisine','nettoyage'), false);
$function$;

-- MD5: c53ea6e4229b38c0dde34f1cfb030623
-- OWNER postgres ; SECURITY DEFINER true ; ACL NULL (privilèges par défaut du propriétaire et PUBLIC selon configuration)
CREATE OR REPLACE FUNCTION private.sync_legacy_profile_permissions(p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id=p_profile_id;
  if v_profile.id is null then return; end if;
  delete from public.profile_permissions where profile_id=p_profile_id;
  if not v_profile.actif or v_profile.role='admin' then return; end if;
  insert into public.profile_permissions(profile_id,permission_key,scope)
  values(p_profile_id,'ideas.share','global') on conflict do nothing;
  if v_profile.role='responsable' then
    insert into public.profile_permissions(profile_id,permission_key,scope)
    select p_profile_id,k.permission_key,d.scope
    from (values ('cuisine'),('salle'),('nettoyage')) d(scope)
    cross join (values ('inventory.use'),('history.view'),('checklists.run'),('orders.manage'),('checklists.review'),('checklists.templates.manage'),('alerts.view'),('articles.manage')) k(permission_key)
    on conflict do nothing;
    insert into public.profile_permissions(profile_id,permission_key,scope)
    select p_profile_id,k.permission_key,'cuisine' from (values ('temperatures.use'),('lunchs.view'),('lunchs.manage'),('monthly_suggestions.view'),('monthly_suggestions.manage')) k(permission_key)
    on conflict do nothing;
    insert into public.profile_permissions(profile_id,permission_key,scope)
    values(p_profile_id,'banners.manage','global'),(p_profile_id,'settings.manage','global') on conflict do nothing;
  elsif v_profile.role='employe' then
    insert into public.profile_permissions(profile_id,permission_key,scope)
    select p_profile_id,k.permission_key,pd.department from public.profile_departments pd
    cross join (values ('inventory.use'),('history.view'),('checklists.run')) k(permission_key)
    where pd.profile_id=p_profile_id and private.is_operational_department(pd.department)
    on conflict do nothing;
    if exists(select 1 from public.profile_departments where profile_id=p_profile_id and department='cuisine') then
      insert into public.profile_permissions(profile_id,permission_key,scope)
      values(p_profile_id,'temperatures.use','cuisine'),(p_profile_id,'lunchs.view','cuisine'),(p_profile_id,'monthly_suggestions.view','cuisine')
      on conflict do nothing;
    end if;
  end if;
end;
$function$;

-- MD5: 013b4a915868b99e94b7790ec8e4f938
-- OWNER postgres ; SECURITY DEFINER true ; ACL {postgres=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION private.user_has_department(p_user_id uuid, p_department text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_operational_department(p_department) and exists (
    select 1 from public.profile_departments pd
    where pd.profile_id = p_user_id and pd.department = p_department
  );
$function$;
