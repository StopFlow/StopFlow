-- StopFlow 0.5.0 — historique détaillé des checklists et suivi des anomalies.
-- Migration additive et réversible : aucune donnée existante n'est supprimée.

alter table public.checklist_run_items
  add column if not exists anomaly_status text,
  add column if not exists anomaly_reported_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists resolved_by_name text,
  add column if not exists resolution_note text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'checklist_run_items_anomaly_status_check'
      and conrelid = 'public.checklist_run_items'::regclass
  ) then
    alter table public.checklist_run_items
      add constraint checklist_run_items_anomaly_status_check
      check (anomaly_status is null or anomaly_status in ('a_traiter','resolue'));
  end if;
end $$;

update public.checklist_run_items item
set anomaly_status = coalesce(item.anomaly_status, 'a_traiter'),
    anomaly_reported_at = coalesce(item.anomaly_reported_at, run.completed_at, run.started_at)
from public.checklist_runs run
where run.id = item.run_id
  and item.anomaly = true;

update public.checklist_run_items
set anomaly_status = null,
    anomaly_reported_at = null,
    resolved_at = null,
    resolved_by = null,
    resolved_by_name = null,
    resolution_note = ''
where anomaly = false;

create index if not exists checklist_run_items_anomaly_status_idx
  on public.checklist_run_items(run_id, anomaly_status)
  where anomaly = true;

create or replace function public.stopflow_prepare_checklist_anomaly()
returns trigger
language plpgsql
security invoker
set search_path = public, private, auth
as $$
declare
  v_run_status text;
begin
  select status into v_run_status
  from public.checklist_runs
  where id = new.run_id;

  if tg_op = 'UPDATE'
     and v_run_status is distinct from 'en_cours'
     and not private.is_responsible_or_admin() then
    raise exception 'Cette checklist est clôturée et ne peut plus être modifiée par son exécutant.';
  end if;

  if new.anomaly = true and (tg_op = 'INSERT' or old.anomaly is distinct from true) then
    new.anomaly_status := 'a_traiter';
    new.anomaly_reported_at := coalesce(new.anomaly_reported_at, now());
    new.resolved_at := null;
    new.resolved_by := null;
    new.resolved_by_name := null;
    new.resolution_note := '';
  elsif new.anomaly = false then
    new.anomaly_status := null;
    new.anomaly_reported_at := null;
    new.resolved_at := null;
    new.resolved_by := null;
    new.resolved_by_name := null;
    new.resolution_note := '';
  end if;

  if tg_op = 'UPDATE'
     and new.anomaly_status = 'resolue'
     and old.anomaly_status is distinct from 'resolue'
     and not private.is_responsible_or_admin() then
    raise exception 'La résolution d’une anomalie est réservée aux Responsables et Administrateurs.';
  end if;

  return new;
end;
$$;

drop trigger if exists stopflow_prepare_checklist_anomaly_trigger on public.checklist_run_items;
create trigger stopflow_prepare_checklist_anomaly_trigger
before insert or update on public.checklist_run_items
for each row execute function public.stopflow_prepare_checklist_anomaly();

create or replace function public.resolve_checklist_anomaly(
  p_item_id uuid,
  p_resolution_note text default ''
)
returns table (
  run_id uuid,
  run_status text,
  remaining_anomalies bigint
)
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_run_id uuid;
  v_name text;
  v_remaining bigint;
begin
  if auth.uid() is null or not private.is_responsible_or_admin() then
    raise exception 'Cette action est réservée aux Responsables et Administrateurs.';
  end if;

  select item.run_id
  into v_run_id
  from public.checklist_run_items item
  where item.id = p_item_id
    and item.anomaly = true;

  if v_run_id is null then
    raise exception 'Anomalie introuvable.';
  end if;

  select coalesce(nullif(btrim(concat_ws(' ', profile.prenom, profile.nom)), ''), profile.email, 'Responsable')
  into v_name
  from public.profiles profile
  where profile.id = auth.uid();

  update public.checklist_run_items
  set anomaly_status = 'resolue',
      resolved_at = now(),
      resolved_by = auth.uid(),
      resolved_by_name = coalesce(v_name, 'Responsable'),
      resolution_note = btrim(coalesce(p_resolution_note, ''))
  where id = p_item_id;

  select count(*)
  into v_remaining
  from public.checklist_run_items item
  where item.run_id = v_run_id
    and item.anomaly = true
    and coalesce(item.anomaly_status, 'a_traiter') <> 'resolue';

  if v_remaining = 0 then
    update public.checklist_runs
    set status = 'validee',
        validated_by = auth.uid(),
        validated_by_name = coalesce(v_name, 'Responsable'),
        validated_at = now(),
        validator_note = case
          when btrim(coalesce(validator_note, '')) = '' then 'Toutes les anomalies ont été résolues.'
          else validator_note || E'\nSuivi clôturé : toutes les anomalies ont été résolues.'
        end,
        updated_at = now()
    where id = v_run_id
      and status = 'suivi_necessaire';
  end if;

  return query
  select run.id, run.status, v_remaining
  from public.checklist_runs run
  where run.id = v_run_id;
end;
$$;

revoke all on function public.resolve_checklist_anomaly(uuid, text) from public;
grant execute on function public.resolve_checklist_anomaly(uuid, text) to authenticated;

comment on column public.checklist_run_items.anomaly_status is 'État du suivi : a_traiter ou resolue.';
comment on column public.checklist_run_items.anomaly_reported_at is 'Moment où l’anomalie a été signalée.';
comment on column public.checklist_run_items.resolution_note is 'Action réalisée pour résoudre l’anomalie.';
comment on function public.resolve_checklist_anomaly(uuid, text) is 'Résout une anomalie et valide automatiquement la checklist lorsque tout le suivi est clôturé.';
