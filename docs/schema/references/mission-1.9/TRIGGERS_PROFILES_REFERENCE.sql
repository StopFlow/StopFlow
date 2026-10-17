-- STOPFLOW / MISSION 1.9 — RÉFÉRENCE UNIQUEMENT, NON EXÉCUTABLE EN PRODUCTION.
-- Fonctions retrouvées par SELECT pg_get_functiondef sur Supabase StopFlow Production.
-- 2 définitions recopiées sans changement ; la 3e masque deux comptes avec des
-- adresses fictives distinctes et COHÉRENTES avec les autres fonctions de référence.
-- Les identités fictives doivent être validées pour un environnement local isolé.
-- Ne pas exécuter ce fichier isolément : plusieurs tables/fonctions sont des dépendances.

CREATE OR REPLACE FUNCTION private.stopflow_060_audit_profile_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.stopflow_060_sync_primary_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.role = 'employe' and new.actif = true and private.is_operational_department(new.departement) then
    update public.profile_departments set is_primary=false, updated_at=now()
    where profile_id=new.id and department<>new.departement and is_primary=true;
    insert into public.profile_departments(profile_id,department,is_primary)
    values(new.id,new.departement,true)
    on conflict(profile_id,department) do update set is_primary=true,updated_at=now();
  elsif new.role in ('admin','responsable') then
    update public.profile_departments set is_primary=false,updated_at=now()
    where profile_id=new.id and is_primary=true;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.protect_core_accounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.email = 'admin-test@example.invalid' then
    if new.email is distinct from old.email
       or new.role is distinct from 'admin'
       or new.actif is distinct from true then
      raise exception 'Le compte administrateur principal ne peut pas être désactivé, rétrogradé ou renommé.';
    end if;
  end if;

  if old.email = 'responsable-test@example.invalid' then
    if new.email is distinct from old.email
       or new.role is distinct from 'responsable'
       or new.actif is distinct from true then
      raise exception 'Le compte Responsable principal ne peut pas être désactivé, changer de rôle ou être renommé.';
    end if;
  end if;

  return new;
end;
$function$;

-- Une ancienne fonction privée distincte existe également sur la production ;
-- elle n'est pas liée au trigger actuel `protect_core_accounts_update`.
CREATE OR REPLACE FUNCTION private.protect_main_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.email = 'admin-test@example.invalid' then
    if new.email is distinct from old.email
       or new.role is distinct from 'admin'
       or new.actif is distinct from true then
      raise exception
        'Le compte administrateur principal ne peut pas être désactivé, rétrogradé ou renommé.';
    end if;
  end if;

  return new;
end;
$function$;
