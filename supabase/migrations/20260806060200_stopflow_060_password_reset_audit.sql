-- StopFlow 0.6.0 — journaliser les réinitialisations de mot de passe.
begin;

alter table public.user_admin_events
  drop constraint if exists user_admin_events_action_check;

alter table public.user_admin_events
  add constraint user_admin_events_action_check
  check (action in ('create','update','activate','deactivate','delete','reset_password'));

commit;
