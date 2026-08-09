create or replace function public.admin_set_user_access(
  p_profile_id uuid,
  p_prenom text,
  p_nom text,
  p_role text,
  p_actif boolean,
  p_primary_department text,
  p_departments text[]
)
returns public.profiles
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_profile public.profiles;
  v_before public.profiles;
  v_email text;
  v_role text := lower(btrim(coalesce(p_role,'')));
  v_primary text := lower(btrim(coalesce(p_primary_department,'')));
  v_departments text[];
  v_invited boolean := false;
  v_audit_action text := 'update';
begin
  if not private.is_admin() then
    raise exception 'Cette action est réservée à l’Administrateur.' using errcode='42501';
  end if;

  select * into v_profile
  from public.profiles
  where id=p_profile_id
  for update;

  if v_profile.id is null then
    raise exception 'Utilisateur introuvable.' using errcode='P0002';
  end if;

  v_before:=v_profile;
  v_email:=lower(v_profile.email);

  select (u.invited_at is not null)
  into v_invited
  from auth.users u
  where u.id=p_profile_id;

  if v_role not in ('admin','responsable','employe') then
    raise exception 'Rôle invalide.' using errcode='22023';
  end if;

  if v_email='contact@srlreunion.com' then
    v_role:='admin';p_actif:=true;v_primary:='bureau';
  elsif v_email='quentin@lunion.be' then
    v_role:='responsable';p_actif:=true;v_primary:='bureau';
  end if;

  if v_role='employe' then
    if not private.is_operational_department(v_primary) then
      raise exception 'Le département principal de l’employé est invalide.' using errcode='22023';
    end if;
    if exists(
      select 1
      from unnest(coalesce(p_departments,array[]::text[])) d
      where not private.is_operational_department(lower(btrim(d)))
    ) then
      raise exception 'Un département sélectionné est invalide.' using errcode='22023';
    end if;
    select coalesce(array_agg(d order by d),array[]::text[])
    into v_departments
    from (
      select distinct lower(btrim(value)) d
      from unnest(coalesce(p_departments,array[]::text[])) value
      where private.is_operational_department(lower(btrim(value)))
    ) normalized;
    if cardinality(v_departments)=0 then
      raise exception 'Sélectionnez au moins un département.' using errcode='22023';
    end if;
    if not (v_primary=any(v_departments)) then
      raise exception 'Le département principal doit être coché.' using errcode='22023';
    end if;
  else
    v_primary:='bureau';
    v_departments:=array[]::text[];
  end if;

  update public.profiles
  set prenom=nullif(btrim(coalesce(p_prenom,'')),''),
      nom=nullif(btrim(coalesce(p_nom,'')),''),
      role=v_role,
      actif=coalesce(p_actif,false),
      departement=v_primary,
      updated_at=now()
  where id=p_profile_id
  returning * into v_profile;

  delete from public.profile_departments where profile_id=p_profile_id;
  if v_role='employe' then
    insert into public.profile_departments(profile_id,department,is_primary)
    select p_profile_id,d,d=v_primary from unnest(v_departments) d;
  end if;

  if v_before.departement is null and not coalesce(v_invited,false) then
    v_audit_action:='create';
  elsif v_before.actif=true and v_profile.actif=false then
    v_audit_action:='deactivate';
  elsif v_before.actif=false and v_profile.actif=true then
    v_audit_action:='activate';
  else
    v_audit_action:='update';
  end if;

  if not (v_before.departement is null and coalesce(v_invited,false)) then
    insert into public.user_admin_events(
      actor_user_id,target_user_id,target_email,action,details
    ) values (
      auth.uid(),
      p_profile_id,
      v_email,
      v_audit_action,
      jsonb_build_object(
        'role',v_profile.role,
        'actif',v_profile.actif,
        'departement',v_profile.departement,
        'departments',v_departments
      )
    );
  end if;

  return v_profile;
end;
$$;

create or replace function private.stopflow_060_audit_profile_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_deleted public.deleted_user_identities;
begin
  select * into v_deleted
  from public.deleted_user_identities
  where former_user_id=old.id
  order by deleted_at desc
  limit 1;

  if v_deleted.id is not null then
    insert into public.user_admin_events(
      actor_user_id,target_user_id,target_email,action,details
    ) values (
      v_deleted.deleted_by,
      null,
      old.email,
      'delete',
      jsonb_build_object(
        'prenom',old.prenom,
        'nom',old.nom,
        'role',old.role,
        'departement',old.departement,
        'deleted_identity_id',v_deleted.id
      )
    );
  end if;

  return old;
end;
$$;

drop trigger if exists stopflow_060_audit_profile_delete on public.profiles;
create trigger stopflow_060_audit_profile_delete
after delete on public.profiles
for each row execute function private.stopflow_060_audit_profile_delete();