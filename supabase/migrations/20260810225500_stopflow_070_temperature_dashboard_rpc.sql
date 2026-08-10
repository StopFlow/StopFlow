-- StopFlow 0.7.0 — chargement atomique et sécurisé du module Températures.
create or replace function public.load_temperature_dashboard_070()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_can_read boolean := private.has_permission('temperatures.readings.use', 'cuisine');
  v_can_manage boolean := private.has_permission('temperatures.equipment.manage', 'cuisine');
  v_equipment jsonb := '[]'::jsonb;
  v_rounds jsonb := '[]'::jsonb;
  v_readings jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  if not v_can_read and not v_can_manage then
    raise exception 'Aucun droit Températures' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.active desc, e.name), '[]'::jsonb)
  into v_equipment
  from public.temperature_equipment e
  where e.department = 'cuisine'
    and (v_can_manage or (v_can_read and e.active = true));

  if v_can_read then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.completed_at desc), '[]'::jsonb)
    into v_rounds
    from (
      select *
      from public.temperature_rounds
      where department = 'cuisine'
      order by completed_at desc
      limit 20
    ) r;

    select coalesce(jsonb_agg(to_jsonb(t) order by t.recorded_at desc), '[]'::jsonb)
    into v_readings
    from (
      select *
      from public.temperature_readings
      where department = 'cuisine'
      order by recorded_at desc
      limit 160
    ) t;
  end if;

  return jsonb_build_object(
    'equipment', v_equipment,
    'rounds', v_rounds,
    'readings', v_readings,
    'can_read', v_can_read,
    'can_manage', v_can_manage
  );
end;
$$;

revoke all on function public.load_temperature_dashboard_070() from public;
grant execute on function public.load_temperature_dashboard_070() to authenticated;
