-- Read-only contract check AFTER installing an independently reviewed baseline.
-- This is not a baseline, an identity check of a remote project, or a migration.
begin read only;
do $$
declare item text; missing text[] := '{}';
begin
  if to_regnamespace('private') is null then missing:=array_append(missing,'schema private'); end if;
  if to_regprocedure('auth.uid()') is null then missing:=array_append(missing,'auth.uid()'); end if;
  foreach item in array array['anon','authenticated','service_role'] loop
    if not exists(select 1 from pg_roles where rolname=item) then missing:=array_append(missing,'role '||item); end if;
  end loop;
  foreach item in array array['id','email','prenom','nom','role','actif','departement','created_at','updated_at'] loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name=item) then missing:=array_append(missing,'profiles.'||item); end if;
  end loop;
  foreach item in array array[
    'profiles','suppliers','articles','article_categories','orders','order_lines','app_settings',
    'checklist_templates','checklist_template_items','checklist_runs','checklist_run_items','checklist_suggestions',
    'department_content','team_banners','temperature_equipment','temperature_rounds','temperature_readings',
    'profile_departments','profile_permissions','profile_card_preferences','proposal_notifications',
    'user_admin_events','deleted_user_identities'
  ] loop
    if to_regclass('public.'||item) is null then missing:=array_append(missing,'relation public.'||item);
    elsif exists(select 1 from pg_class where oid=to_regclass('public.'||item) and relkind in ('r','p') and not relrowsecurity) then
      missing:=array_append(missing,'RLS public.'||item);
    end if;
  end loop;
  foreach item in array array['save_order_draft_atomic','submit_order','validate_order','mark_ordered','cancel_order',
    'resolve_checklist_anomaly','admin_set_user_access','admin_set_user_profile_permissions_070',
    'load_temperature_dashboard_070','save_temperature_round_070'] loop
    if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=item) then missing:=array_append(missing,'RPC '||item); end if;
  end loop;
  if cardinality(missing)>0 then raise exception 'BASELINE_INCOMPLETE: %',array_to_string(missing,', '); end if;
end $$;
commit;
