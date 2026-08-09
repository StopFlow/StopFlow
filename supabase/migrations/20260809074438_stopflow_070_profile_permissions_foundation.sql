create table if not exists public.profile_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null,
  scope text not null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  constraint profile_permissions_pkey primary key (profile_id, permission_key, scope),
  constraint profile_permissions_scope_check check (scope in ('global','cuisine','salle','nettoyage')),
  constraint profile_permissions_key_scope_check check (
    (permission_key in ('ideas.share','banners.manage','settings.manage') and scope='global')
    or
    (permission_key in ('temperatures.use','lunchs.view','lunchs.manage','monthly_suggestions.view','monthly_suggestions.manage') and scope='cuisine')
    or
    (permission_key in ('inventory.use','history.view','checklists.run','orders.manage','checklists.review','checklists.templates.manage','alerts.view','suppliers.manage','articles.manage') and scope in ('cuisine','salle','nettoyage'))
  )
);

create index if not exists profile_permissions_key_scope_idx
  on public.profile_permissions(permission_key, scope, profile_id);

alter table public.profile_permissions enable row level security;

drop policy if exists profile_permissions_read on public.profile_permissions;
create policy profile_permissions_read on public.profile_permissions
for select to authenticated
using (profile_id=auth.uid() or private.is_admin());

drop policy if exists profile_permissions_manage on public.profile_permissions;
create policy profile_permissions_manage on public.profile_permissions
for all to authenticated
using (private.is_admin())
with check (private.is_admin());

create or replace function private.is_known_permission_key(p_permission_key text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select coalesce(p_permission_key in (
    'inventory.use','history.view','checklists.run','temperatures.use',
    'lunchs.view','lunchs.manage','monthly_suggestions.view','monthly_suggestions.manage',
    'ideas.share','orders.manage','checklists.review','checklists.templates.manage',
    'alerts.view','banners.manage','suppliers.manage','articles.manage','settings.manage'
  ),false);
$$;

create or replace function private.is_valid_permission_scope(p_permission_key text,p_scope text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select case
    when p_permission_key in ('ideas.share','banners.manage','settings.manage') then p_scope='global'
    when p_permission_key in ('temperatures.use','lunchs.view','lunchs.manage','monthly_suggestions.view','monthly_suggestions.manage') then p_scope='cuisine'
    when p_permission_key in ('inventory.use','history.view','checklists.run','orders.manage','checklists.review','checklists.templates.manage','alerts.view','suppliers.manage','articles.manage') then private.is_operational_department(p_scope)
    else false
  end;
$$;

create or replace function private.has_permission_for_user(p_user_id uuid,p_permission_key text,p_scope text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.is_known_permission_key(p_permission_key)
    and private.is_valid_permission_scope(p_permission_key,p_scope)
    and exists(select 1 from public.profiles p where p.id=p_user_id and p.actif=true)
    and (
      exists(select 1 from public.profiles p where p.id=p_user_id and p.actif=true and p.role='admin')
      or exists(
        select 1 from public.profile_permissions pp
        where pp.profile_id=p_user_id
          and pp.permission_key=p_permission_key
          and pp.scope=p_scope
      )
    );
$$;

create or replace function private.has_permission(p_permission_key text,p_scope text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.has_permission_for_user(auth.uid(),p_permission_key,p_scope);
$$;

create or replace function private.has_any_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.is_known_permission_key(p_permission_key)
    and private.is_active_user()
    and (
      private.is_admin()
      or exists(
        select 1 from public.profile_permissions pp
        where pp.profile_id=auth.uid() and pp.permission_key=p_permission_key
      )
    );
$$;

create or replace function private.has_any_scope_permission(p_scope text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.is_operational_department(p_scope)
    and private.is_active_user()
    and (
      private.is_admin()
      or exists(
        select 1 from public.profile_permissions pp
        where pp.profile_id=auth.uid() and pp.scope=p_scope
      )
    );
$$;

create or replace function private.can_access_department(p_department text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.is_active_user()
    and private.is_operational_department(p_department)
    and (
      private.is_admin()
      or exists(
        select 1 from public.profile_permissions pp
        where pp.profile_id=auth.uid() and pp.scope=p_department
      )
      or private.user_has_department(auth.uid(),p_department)
    );
$$;

create or replace function public.admin_set_profile_permissions(p_profile_id uuid,p_permissions jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_target public.profiles;
  v_count integer;
begin
  if not private.is_admin() then
    raise exception 'Cette action est réservée à l’Administrateur.' using errcode='42501';
  end if;
  select * into v_target from public.profiles where id=p_profile_id for update;
  if v_target.id is null then raise exception 'Utilisateur introuvable.' using errcode='P0002'; end if;
  if jsonb_typeof(coalesce(p_permissions,'[]'::jsonb))<>'array' then
    raise exception 'La liste des permissions est invalide.' using errcode='22023';
  end if;
  if v_target.role='admin' then
    return jsonb_build_object('profile_id',v_target.id,'full_access',true,'permissions',jsonb_build_array());
  end if;
  delete from public.profile_permissions where profile_id=p_profile_id;
  insert into public.profile_permissions(profile_id,permission_key,scope,created_by)
  select distinct p_profile_id,btrim(x->>'permission_key'),lower(btrim(x->>'scope')),auth.uid()
  from jsonb_array_elements(coalesce(p_permissions,'[]'::jsonb)) x
  where coalesce(btrim(x->>'permission_key'),'')<>'' and coalesce(btrim(x->>'scope'),'')<>'';
  select count(*) into v_count from public.profile_permissions where profile_id=p_profile_id;
  insert into public.user_admin_events(actor_user_id,target_user_id,target_email,action,details)
  values(auth.uid(),p_profile_id,v_target.email,'update',jsonb_build_object('permission_count',v_count,'permissions_updated',true));
  return jsonb_build_object('profile_id',p_profile_id,'full_access',false,'permission_count',v_count);
end;
$$;

revoke all on function public.admin_set_profile_permissions(uuid,jsonb) from public;
grant execute on function public.admin_set_profile_permissions(uuid,jsonb) to authenticated;

insert into public.profile_permissions(profile_id,permission_key,scope)
select p.id,'ideas.share','global'
from public.profiles p where p.actif=true and p.role<>'admin'
on conflict do nothing;

insert into public.profile_permissions(profile_id,permission_key,scope)
select p.id,k.permission_key,pd.department
from public.profiles p
join public.profile_departments pd on pd.profile_id=p.id
cross join lateral (values ('inventory.use'),('history.view'),('checklists.run')) k(permission_key)
where p.actif=true and p.role='employe' and private.is_operational_department(pd.department)
on conflict do nothing;

insert into public.profile_permissions(profile_id,permission_key,scope)
select distinct p.id,k.permission_key,'cuisine'
from public.profiles p
join public.profile_departments pd on pd.profile_id=p.id and pd.department='cuisine'
cross join lateral (values ('temperatures.use'),('lunchs.view'),('monthly_suggestions.view')) k(permission_key)
where p.actif=true and p.role='employe'
on conflict do nothing;

insert into public.profile_permissions(profile_id,permission_key,scope)
select p.id,k.permission_key,d.scope
from public.profiles p
cross join lateral (values ('cuisine'),('salle'),('nettoyage')) d(scope)
cross join lateral (values
  ('inventory.use'),('history.view'),('checklists.run'),('orders.manage'),
  ('checklists.review'),('checklists.templates.manage'),('alerts.view'),('articles.manage')
) k(permission_key)
where p.actif=true and p.role='responsable'
on conflict do nothing;

insert into public.profile_permissions(profile_id,permission_key,scope)
select p.id,k.permission_key,'cuisine'
from public.profiles p
cross join lateral (values
  ('temperatures.use'),('lunchs.view'),('lunchs.manage'),
  ('monthly_suggestions.view'),('monthly_suggestions.manage')
) k(permission_key)
where p.actif=true and p.role='responsable'
on conflict do nothing;

insert into public.profile_permissions(profile_id,permission_key,scope)
select p.id,k.permission_key,'global'
from public.profiles p
cross join lateral (values ('ideas.share'),('banners.manage'),('settings.manage')) k(permission_key)
where p.actif=true and p.role='responsable'
on conflict do nothing;