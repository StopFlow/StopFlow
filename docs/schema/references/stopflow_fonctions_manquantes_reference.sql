-- SOURCE DE REFERENCE, PAS UNE MIGRATION EXECUTABLE TELLE QUELLE.
-- Huit definitions relues depuis les catalogues de la production StopFlow le 2026-10-17
-- Lecture seule effectuee via pg_get_functiondef ; aucune modification distante.
-- Certaines dependent de tables, types et fonctions manquant encore a la baseline.
-- Ne PAS appliquer ce fichier directement en production ou sur une base vierge.
-- Ne PAS publier ce fichier sans revue de securite et de compatibilite.

CREATE OR REPLACE FUNCTION private.is_active_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.actif = true
  );
$function$;

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

CREATE OR REPLACE FUNCTION private.is_responsible_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(private.current_role() in ('admin', 'responsable'), false);
$function$;

CREATE OR REPLACE FUNCTION private.set_catalog_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.log_stopflow_event(p_event_type text, p_entity_type text, p_entity_id text, p_label text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.profiles;
begin
 select * into p from public.profiles where id=auth.uid() and actif=true;
 if p.id is null then raise exception 'Session invalide.' using errcode='42501'; end if;
 insert into public.activity_events(actor_user_id,actor_name,event_type,entity_type,entity_id,label,details) values(auth.uid(),concat_ws(' ',p.prenom,p.nom),left(coalesce(p_event_type,'event'),60),left(coalesce(p_entity_type,'app'),40),left(coalesce(p_entity_id,''),160),left(coalesce(p_label,'Action StopFlow'),240),coalesce(p_details,'{}'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.submit_order(p_order_id uuid)
 RETURNS orders
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.submit_order_impl(p_order_id);
$function$;

CREATE OR REPLACE FUNCTION public.validate_order(p_order_id uuid)
 RETURNS orders
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.validate_order_impl(p_order_id);
$function$;
