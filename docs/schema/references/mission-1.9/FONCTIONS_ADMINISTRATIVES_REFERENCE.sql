-- STOPFLOW — EXTRACTION EN LECTURE SEULE, EXEMPLE SANITISÉ POUR ENVIRONNEMENT DE TEST.
-- Les deux fonctions proviennent de pg_get_functiondef sur Supabase Production.
-- Les deux identités réelles ont été remplacées par admin-test@example.invalid et
-- responsable-test@example.invalid. Ne jamais substituer les mêmes identités.
-- NON DESTINÉ À LA PRODUCTION. Propriétaire d'origine : postgres.
-- Privilèges effectifs observés : postgres, authenticated, service_role (EXECUTE).
-- Ne pas exécuter avant revue du modèle de sécurité et des dépendances complètes.

CREATE OR REPLACE FUNCTION public.admin_set_user_access(p_profile_id uuid, p_prenom text, p_nom text, p_role text, p_actif boolean, p_primary_department text, p_departments text[])
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile public.profiles;v_before public.profiles;v_email text;v_role text:=lower(btrim(coalesce(p_role,'')));v_primary text:=lower(btrim(coalesce(p_primary_department,'')));v_departments text[];v_invited boolean:=false;v_audit_action text:='update';
begin
  if not private.is_admin() then raise exception 'Cette action est réservée à l’Administrateur.' using errcode='42501'; end if;
  select * into v_profile from public.profiles where id=p_profile_id for update;
  if v_profile.id is null then raise exception 'Utilisateur introuvable.' using errcode='P0002'; end if;
  v_before:=v_profile;v_email:=lower(v_profile.email);
  select (u.invited_at is not null) into v_invited from auth.users u where u.id=p_profile_id;
  if v_role not in ('admin','responsable','employe') then raise exception 'Rôle invalide.' using errcode='22023'; end if;
  if v_email='admin-test@example.invalid' then v_role:='admin';p_actif:=true;v_primary:='bureau';
  elsif v_email='responsable-test@example.invalid' then v_role:='responsable';p_actif:=true;v_primary:='bureau'; end if;
  if v_role='employe' then
    if not private.is_operational_department(v_primary) then raise exception 'Le département principal de l’employé est invalide.' using errcode='22023'; end if;
    if exists(select 1 from unnest(coalesce(p_departments,array[]::text[])) d where not private.is_operational_department(lower(btrim(d)))) then raise exception 'Un département sélectionné est invalide.' using errcode='22023'; end if;
    select coalesce(array_agg(d order by d),array[]::text[]) into v_departments from (select distinct lower(btrim(value)) d from unnest(coalesce(p_departments,array[]::text[])) value where private.is_operational_department(lower(btrim(value)))) normalized;
    if cardinality(v_departments)=0 then raise exception 'Sélectionnez au moins un département.' using errcode='22023'; end if;
    if not (v_primary=any(v_departments)) then raise exception 'Le département principal doit être coché.' using errcode='22023'; end if;
  else v_primary:='bureau';v_departments:=array[]::text[]; end if;
  update public.profiles set prenom=nullif(btrim(coalesce(p_prenom,'')),''),nom=nullif(btrim(coalesce(p_nom,'')),''),role=v_role,actif=coalesce(p_actif,false),departement=v_primary,updated_at=now() where id=p_profile_id returning * into v_profile;
  delete from public.profile_departments where profile_id=p_profile_id;
  if v_role='employe' then insert into public.profile_departments(profile_id,department,is_primary) select p_profile_id,d,d=v_primary from unnest(v_departments) d; end if;
  perform private.sync_legacy_profile_permissions(p_profile_id);
  if v_before.departement is null and not coalesce(v_invited,false) then v_audit_action:='create';
  elsif v_before.actif=true and v_profile.actif=false then v_audit_action:='deactivate';
  elsif v_before.actif=false and v_profile.actif=true then v_audit_action:='activate'; else v_audit_action:='update'; end if;
  if not (v_before.departement is null and coalesce(v_invited,false)) then
    insert into public.user_admin_events(actor_user_id,target_user_id,target_email,action,details)
    values(auth.uid(),p_profile_id,v_email,v_audit_action,jsonb_build_object('role',v_profile.role,'actif',v_profile.actif,'departement',v_profile.departement,'departments',v_departments,'permissions_synced','legacy_0.6'));
  end if;
  return v_profile;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_profile_permissions_070(p_profile_id uuid, p_prenom text, p_nom text, p_role text, p_actif boolean, p_permissions jsonb, p_audit_action text DEFAULT 'update'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before public.profiles;
  v_after public.profiles;
  v_role text:=lower(btrim(coalesce(p_role,'')));
  v_email text;
  v_permissions jsonb:=coalesce(p_permissions,'[]'::jsonb);
  v_scopes text[]:=array[]::text[];
  v_legacy_primary text;
  v_count integer:=0;
  v_action text:=lower(btrim(coalesce(p_audit_action,'update')));
begin
  if not private.is_admin() then
    raise exception 'Cette action est réservée à l’Administrateur.' using errcode='42501';
  end if;

  select * into v_before from public.profiles where id=p_profile_id for update;
  if v_before.id is null then raise exception 'Utilisateur introuvable.' using errcode='P0002'; end if;

  v_email:=lower(v_before.email);
  if v_role not in ('admin','responsable','employe') then
    raise exception 'Rôle invalide.' using errcode='22023';
  end if;
  if jsonb_typeof(v_permissions)<>'array' then
    raise exception 'La liste des permissions est invalide.' using errcode='22023';
  end if;
  if v_action not in ('create','invite','update') then v_action:='update'; end if;

  if v_email='admin-test@example.invalid' then
    v_role:='admin';
    p_actif:=true;
  elsif v_email='responsable-test@example.invalid' then
    v_role:='responsable';
    p_actif:=true;
  end if;

  if v_role='admin' then
    delete from public.profile_permissions where profile_id=p_profile_id;
    delete from public.profile_departments where profile_id=p_profile_id;
    v_legacy_primary:='bureau';
  else
    delete from public.profile_permissions where profile_id=p_profile_id;

    insert into public.profile_permissions(profile_id,permission_key,scope,created_by)
    select distinct
      p_profile_id,
      btrim(item->>'permission_key'),
      lower(btrim(item->>'scope')),
      auth.uid()
    from jsonb_array_elements(v_permissions) item
    where coalesce(btrim(item->>'permission_key'),'')<>''
      and coalesce(btrim(item->>'scope'),'')<>'';

    insert into public.profile_permissions(profile_id,permission_key,scope,created_by)
    select p_profile_id,'lunchs.view','cuisine',auth.uid()
    where exists(
      select 1 from public.profile_permissions
      where profile_id=p_profile_id and permission_key='lunchs.manage' and scope='cuisine'
    )
    on conflict do nothing;

    insert into public.profile_permissions(profile_id,permission_key,scope,created_by)
    select p_profile_id,'monthly_suggestions.view','cuisine',auth.uid()
    where exists(
      select 1 from public.profile_permissions
      where profile_id=p_profile_id and permission_key='monthly_suggestions.manage' and scope='cuisine'
    )
    on conflict do nothing;

    select coalesce(array_agg(scope order by case scope when 'cuisine' then 1 when 'salle' then 2 else 3 end),array[]::text[])
    into v_scopes
    from (
      select distinct scope
      from public.profile_permissions
      where profile_id=p_profile_id and scope in ('cuisine','salle','nettoyage')
    ) s;

    delete from public.profile_departments where profile_id=p_profile_id;
    if cardinality(v_scopes)>0 then
      v_legacy_primary:=case
        when v_before.departement=any(v_scopes) then v_before.departement
        else v_scopes[1]
      end;
      insert into public.profile_departments(profile_id,department,is_primary)
      select p_profile_id,scope,scope=v_legacy_primary from unnest(v_scopes) scope;
    else
      v_legacy_primary:=case when v_role='responsable' then 'bureau' else null end;
    end if;
  end if;

  update public.profiles
  set prenom=nullif(btrim(coalesce(p_prenom,'')),''),
      nom=nullif(btrim(coalesce(p_nom,'')),''),
      role=v_role,
      actif=coalesce(p_actif,false),
      departement=v_legacy_primary,
      updated_at=now()
  where id=p_profile_id
  returning * into v_after;

  select count(*) into v_count from public.profile_permissions where profile_id=p_profile_id;

  if v_action='update' then
    if v_before.actif=true and v_after.actif=false then v_action:='deactivate';
    elsif v_before.actif=false and v_after.actif=true then v_action:='activate';
    end if;
  end if;

  insert into public.user_admin_events(actor_user_id,target_user_id,target_email,action,details)
  values(
    auth.uid(),p_profile_id,v_email,v_action,
    jsonb_build_object(
      'role',v_after.role,
      'actif',v_after.actif,
      'permission_count',v_count,
      'permissions_updated',true,
      'legacy_department',v_after.departement,
      'legacy_departments',v_scopes
    )
  );

  return jsonb_build_object(
    'id',v_after.id,
    'email',v_after.email,
    'prenom',v_after.prenom,
    'nom',v_after.nom,
    'role',v_after.role,
    'actif',v_after.actif,
    'departement',v_after.departement,
    'departments',v_scopes,
    'permission_count',v_count,
    'full_access',v_after.role='admin'
  );
end;
$function$;
