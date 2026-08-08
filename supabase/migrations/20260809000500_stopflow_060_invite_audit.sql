alter table public.user_admin_events
  drop constraint if exists user_admin_events_action_check;

alter table public.user_admin_events
  add constraint user_admin_events_action_check
  check (
    action = any (
      array[
        'create'::text,
        'update'::text,
        'activate'::text,
        'deactivate'::text,
        'delete'::text,
        'reset_password'::text,
        'invite'::text
      ]
    )
  );
