-- StopFlow 0.7.0 — refonte températures : équipements + relevés complets.

alter table public.profile_permissions drop constraint if exists profile_permissions_key_scope_check;
alter table public.profile_permissions add constraint profile_permissions_key_scope_check check (
  (permission_key in ('ideas.share','banners.manage','settings.manage') and scope='global')
  or
  (permission_key in ('temperatures.use','temperatures.readings.use','temperatures.equipment.manage','lunchs.view','lunchs.manage','monthly_suggestions.view','monthly_suggestions.manage') and scope='cuisine')
  or
  (permission_key in ('inventory.use','history.view','checklists.run','orders.manage','checklists.review','checklists.templates.manage','alerts.view','suppliers.manage','articles.manage') and scope in ('cuisine','salle','nettoyage'))
);

create or replace function private.is_known_permission_key(p_permission_key text)
returns boolean language sql immutable set search_path=''
as $$
  select coalesce(p_permission_key in (
    'inventory.use','history.view','checklists.run','temperatures.use','temperatures.readings.use','temperatures.equipment.manage',
    'lunchs.view','lunchs.manage','monthly_suggestions.view','monthly_suggestions.manage','ideas.share','orders.manage',
    'checklists.review','checklists.templates.manage','alerts.view','banners.manage','suppliers.manage','articles.manage','settings.manage'
  ),false);
$$;

create or replace function private.is_valid_permission_scope(p_permission_key text,p_scope text)
returns boolean language sql immutable set search_path=''
as $$
  select case
    when p_permission_key in ('ideas.share','banners.manage','settings.manage') then p_scope='global'
    when p_permission_key in ('temperatures.use','temperatures.readings.use','temperatures.equipment.manage','lunchs.view','lunchs.manage','monthly_suggestions.view','monthly_suggestions.manage') then p_scope='cuisine'
    when p_permission_key in ('inventory.use','history.view','checklists.run','orders.manage','checklists.review','checklists.templates.manage','alerts.view','suppliers.manage','articles.manage') then private.is_operational_department(p_scope)
    else false
  end;
$$;

insert into public.profile_permissions(profile_id,permission_key,scope,created_by)
select profile_id,'temperatures.readings.use','cuisine',created_by
from public.profile_permissions where permission_key='temperatures.use' and scope='cuisine'
on conflict do nothing;

insert into public.profile_permissions(profile_id,permission_key,scope,created_by)
select pp.profile_id,'temperatures.equipment.manage','cuisine',pp.created_by
from public.profile_permissions pp
join public.profiles p on p.id=pp.profile_id
where pp.permission_key='temperatures.use' and pp.scope='cuisine' and p.role='responsable'
on conflict do nothing;

create table if not exists public.temperature_equipment (
  id uuid primary key default gen_random_uuid(),
  department text not null default 'cuisine' check (department='cuisine'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  location text not null default '',
  equipment_type text not null default 'fridge' check (equipment_type in ('fridge','freezer','cold_room','display','other')),
  min_allowed numeric not null default 0,
  max_allowed numeric not null default 4,
  active boolean not null default true,
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint temperature_equipment_limits_check check (max_allowed >= min_allowed)
);

create unique index if not exists temperature_equipment_active_name_unique on public.temperature_equipment(department,lower(btrim(name))) where active=true;
create index if not exists temperature_equipment_active_idx on public.temperature_equipment(department,active,name);

create or replace function public.stopflow_temperature_equipment_touch()
returns trigger language plpgsql set search_path=''
as $$
begin
  new.updated_at:=now();
  if old.active=true and new.active=false then new.deactivated_at:=coalesce(new.deactivated_at,now());
  elsif old.active=false and new.active=true then new.activated_at:=now();new.deactivated_at:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists temperature_equipment_touch on public.temperature_equipment;
create trigger temperature_equipment_touch before update on public.temperature_equipment for each row execute function public.stopflow_temperature_equipment_touch();

alter table public.temperature_equipment enable row level security;
drop policy if exists temperature_equipment_read_permissions on public.temperature_equipment;
create policy temperature_equipment_read_permissions on public.temperature_equipment for select to authenticated using (
  department='cuisine' and (
    private.has_permission('temperatures.equipment.manage','cuisine')
    or private.has_permission('alerts.view','cuisine')
    or (active=true and private.has_permission('temperatures.readings.use','cuisine'))
  )
);
drop policy if exists temperature_equipment_insert_permissions on public.temperature_equipment;
create policy temperature_equipment_insert_permissions on public.temperature_equipment for insert to authenticated with check (
  department='cuisine' and private.has_permission('temperatures.equipment.manage','cuisine') and created_by=auth.uid()
);
drop policy if exists temperature_equipment_update_permissions on public.temperature_equipment;
create policy temperature_equipment_update_permissions on public.temperature_equipment for update to authenticated
using (department='cuisine' and private.has_permission('temperatures.equipment.manage','cuisine'))
with check (department='cuisine' and private.has_permission('temperatures.equipment.manage','cuisine'));
drop policy if exists temperature_equipment_delete_admin on public.temperature_equipment;
create policy temperature_equipment_delete_admin on public.temperature_equipment for delete to authenticated using (private.is_admin());
grant select,insert,update,delete on public.temperature_equipment to authenticated;

create table if not exists public.temperature_rounds (
  id uuid primary key default gen_random_uuid(),
  department text not null default 'cuisine' check (department='cuisine'),
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  performed_by uuid null references auth.users(id) on delete set null,
  performed_by_name text not null default '',
  equipment_count integer not null default 0 check (equipment_count >= 0),
  anomaly_count integer not null default 0 check (anomaly_count >= 0),
  created_at timestamptz not null default now()
);
create index if not exists temperature_rounds_completed_idx on public.temperature_rounds(department,completed_at desc);
alter table public.temperature_rounds enable row level security;
drop policy if exists temperature_rounds_read_permissions on public.temperature_rounds;
create policy temperature_rounds_read_permissions on public.temperature_rounds for select to authenticated
using (private.has_permission('temperatures.readings.use',department) or private.has_permission('alerts.view',department));
drop policy if exists temperature_rounds_insert_permissions on public.temperature_rounds;
create policy temperature_rounds_insert_permissions on public.temperature_rounds for insert to authenticated
with check (performed_by=auth.uid() and private.has_permission('temperatures.readings.use',department));
drop policy if exists temperature_rounds_update_admin on public.temperature_rounds;
create policy temperature_rounds_update_admin on public.temperature_rounds for update to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists temperature_rounds_delete_admin on public.temperature_rounds;
create policy temperature_rounds_delete_admin on public.temperature_rounds for delete to authenticated using (private.is_admin());
grant select,insert,update,delete on public.temperature_rounds to authenticated;

alter table public.temperature_readings
  add column if not exists round_id uuid null references public.temperature_rounds(id) on delete set null,
  add column if not exists equipment_id uuid null references public.temperature_equipment(id) on delete set null,
  add column if not exists equipment_location text not null default '',
  add column if not exists equipment_type text not null default '';
create index if not exists temperature_readings_round_idx on public.temperature_readings(round_id,recorded_at);
create index if not exists temperature_readings_equipment_idx on public.temperature_readings(equipment_id,recorded_at desc);

drop policy if exists temperature_readings_read_permissions on public.temperature_readings;
drop policy if exists temperature_readings_insert_permissions on public.temperature_readings;
create policy temperature_readings_read_permissions on public.temperature_readings for select to authenticated
using (private.has_permission('temperatures.readings.use',department) or private.has_permission('alerts.view',department));
create policy temperature_readings_insert_permissions on public.temperature_readings for insert to authenticated
with check (recorded_by=auth.uid() and private.has_permission('temperatures.readings.use',department));

create or replace function public.save_temperature_round_070(p_readings jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_round_id uuid;
  v_expected integer;
  v_received integer;
  v_anomalies integer;
  v_name text;
begin
  if not private.has_permission('temperatures.readings.use','cuisine') then raise exception 'Permission de relevé de température absente.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_readings,'[]'::jsonb))<>'array' then raise exception 'Le relevé doit être une liste.' using errcode='22023'; end if;
  select count(*) into v_expected from public.temperature_equipment e where e.department='cuisine' and e.active=true;
  if v_expected=0 then raise exception 'Aucun équipement frigorifique actif n’est configuré.' using errcode='22023'; end if;
  v_received:=jsonb_array_length(coalesce(p_readings,'[]'::jsonb));
  if v_received<>v_expected then raise exception 'Le relevé doit contenir tous les équipements actifs (% attendus, % reçus).',v_expected,v_received using errcode='22023'; end if;
  if exists(select 1 from (select nullif(item->>'equipment_id','')::uuid equipment_id,count(*) n from jsonb_array_elements(p_readings) item group by nullif(item->>'equipment_id','')::uuid) x where x.equipment_id is null or x.n<>1) then raise exception 'Chaque équipement doit apparaître exactement une fois.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_readings) item left join public.temperature_equipment e on e.id=nullif(item->>'equipment_id','')::uuid and e.department='cuisine' and e.active=true where e.id is null) then raise exception 'Le relevé contient un équipement inconnu ou inactif.' using errcode='22023'; end if;
  if exists(select 1 from public.temperature_equipment e where e.department='cuisine' and e.active=true and not exists(select 1 from jsonb_array_elements(p_readings) item where nullif(item->>'equipment_id','')::uuid=e.id)) then raise exception 'Un équipement actif manque dans le relevé.' using errcode='22023'; end if;
  select nullif(btrim(concat_ws(' ',p.prenom,p.nom)),'') into v_name from public.profiles p where p.id=auth.uid();
  v_name:=coalesce(v_name,'Utilisateur StopFlow');
  insert into public.temperature_rounds(department,started_at,completed_at,performed_by,performed_by_name,equipment_count,anomaly_count)
  values('cuisine',now(),now(),auth.uid(),v_name,v_expected,0) returning id into v_round_id;
  insert into public.temperature_readings(department,round_id,equipment_id,equipment,equipment_location,equipment_type,temperature,min_allowed,max_allowed,note,recorded_at,recorded_by,recorded_by_name)
  select 'cuisine',v_round_id,e.id,e.name,e.location,e.equipment_type,(item->>'temperature')::numeric,e.min_allowed,e.max_allowed,coalesce(item->>'note',''),now(),auth.uid(),v_name
  from jsonb_array_elements(p_readings) item join public.temperature_equipment e on e.id=nullif(item->>'equipment_id','')::uuid and e.department='cuisine' and e.active=true;
  select count(*) into v_anomalies from public.temperature_readings r where r.round_id=v_round_id and r.anomaly=true;
  update public.temperature_rounds set anomaly_count=v_anomalies where id=v_round_id;
  return jsonb_build_object('round_id',v_round_id,'equipment_count',v_expected,'anomaly_count',v_anomalies,'completed_at',now());
end;
$$;
revoke all on function public.save_temperature_round_070(jsonb) from public;
grant execute on function public.save_temperature_round_070(jsonb) to authenticated;

comment on table public.temperature_equipment is 'Registre actif/inactif des équipements frigorifiques utilisés pour les relevés StopFlow.';
comment on table public.temperature_rounds is 'Sessions de relevé regroupant l’ensemble des équipements actifs au moment du contrôle.';
comment on column public.temperature_readings.equipment is 'Snapshot du nom de l’équipement au moment du relevé.';
comment on column public.temperature_readings.min_allowed is 'Snapshot de la limite minimale au moment du relevé.';
comment on column public.temperature_readings.max_allowed is 'Snapshot de la limite maximale au moment du relevé.';
