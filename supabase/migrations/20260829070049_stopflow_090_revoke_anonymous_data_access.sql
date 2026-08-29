-- StopFlow 0.9 — aucune donnée métier n'est publique.
-- L'application exige une session Supabase authentifiée.

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- Deux fonctions de trigger historiques étaient encore exécutables via PUBLIC/anon.
revoke execute on function public.stopflow_prepare_checklist_anomaly() from public, anon;
revoke execute on function public.stopflow_temperature_equipment_touch() from public, anon;

-- Le trigger checklist utilise uniquement des références qualifiées.
alter function public.stopflow_prepare_checklist_anomaly() set search_path = '';

-- Empêcher les futures migrations créées par postgres de réexposer automatiquement des objets à anon.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;
