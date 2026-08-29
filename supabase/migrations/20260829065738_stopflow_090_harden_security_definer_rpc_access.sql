-- StopFlow 0.9 — durcissement ciblé des RPC SECURITY DEFINER.
-- Les clients non authentifiés ne doivent appeler aucun de ces RPC.
-- Les utilisateurs connectés conservent l'accès ; les contrôles métier restent dans chaque fonction.

revoke execute on function public.admin_set_profile_permissions(uuid,jsonb) from public, anon;
revoke execute on function public.admin_set_user_access(uuid,text,text,text,boolean,text,text[]) from public, anon;
revoke execute on function public.admin_set_user_profile_permissions_070(uuid,text,text,text,boolean,jsonb,text) from public, anon;
revoke execute on function public.load_temperature_dashboard_070() from public, anon;
revoke execute on function public.log_stopflow_event(text,text,text,text,jsonb) from public, anon;
revoke execute on function public.mark_order_delivered(uuid,text) from public, anon;
revoke execute on function public.mark_order_sent(uuid,text,numeric) from public, anon;
revoke execute on function public.resolve_checklist_anomaly(uuid,text) from public, anon;
revoke execute on function public.save_order_draft_atomic(uuid,text,text,text,jsonb,jsonb,timestamp with time zone,timestamp with time zone,bigint,jsonb) from public, anon;
revoke execute on function public.save_order_draft_atomic_v054(uuid,text,text,text,text,jsonb,jsonb,timestamp with time zone,timestamp with time zone,bigint,jsonb) from public, anon;
revoke execute on function public.save_temperature_round_070(jsonb) from public, anon;

grant execute on function public.admin_set_profile_permissions(uuid,jsonb) to authenticated, service_role;
grant execute on function public.admin_set_user_access(uuid,text,text,text,boolean,text,text[]) to authenticated, service_role;
grant execute on function public.admin_set_user_profile_permissions_070(uuid,text,text,text,boolean,jsonb,text) to authenticated, service_role;
grant execute on function public.load_temperature_dashboard_070() to authenticated, service_role;
grant execute on function public.log_stopflow_event(text,text,text,text,jsonb) to authenticated, service_role;
grant execute on function public.mark_order_delivered(uuid,text) to authenticated, service_role;
grant execute on function public.mark_order_sent(uuid,text,numeric) to authenticated, service_role;
grant execute on function public.resolve_checklist_anomaly(uuid,text) to authenticated, service_role;
grant execute on function public.save_order_draft_atomic(uuid,text,text,text,jsonb,jsonb,timestamp with time zone,timestamp with time zone,bigint,jsonb) to authenticated, service_role;
grant execute on function public.save_order_draft_atomic_v054(uuid,text,text,text,text,jsonb,jsonb,timestamp with time zone,timestamp with time zone,bigint,jsonb) to authenticated, service_role;
grant execute on function public.save_temperature_round_070(jsonb) to authenticated, service_role;

alter function public.load_temperature_dashboard_070() set search_path = '';
alter function public.resolve_checklist_anomaly(uuid,text) set search_path = '';
