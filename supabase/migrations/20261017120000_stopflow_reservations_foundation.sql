-- Reservations foundation. Review and apply only to an isolated development DB.
-- No seed, no change to existing profile permissions, no production provisioning.
begin;

create table public.reservation_establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table public.reservation_memberships (
  establishment_id uuid not null references public.reservation_establishments(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  can_view boolean not null default false,
  can_manage_rooms boolean not null default false,
  can_manage_tables boolean not null default false,
  can_manage_layouts boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (establishment_id, profile_id),
  check (can_view or not (can_manage_rooms or can_manage_tables or can_manage_layouts))
);
create index reservation_memberships_profile_idx on public.reservation_memberships(profile_id, establishment_id);

-- Even a global StopFlow admin needs explicit membership. Reuse Auth/profiles;
-- department permissions cannot safely represent a tenant-specific entitlement.
create function private.reservations_can(p_establishment_id uuid, p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reservation_memberships m
    join public.reservation_establishments e on e.id=m.establishment_id and e.active
    join public.profiles p on p.id=m.profile_id and p.actif
    where m.establishment_id=p_establishment_id and m.profile_id=auth.uid() and m.active
      and case p_action
        when 'view' then m.can_view
        when 'rooms.manage' then m.can_manage_rooms
        when 'tables.manage' then m.can_manage_tables
        when 'layouts.manage' then m.can_manage_layouts
        else false end
  );
$$;
revoke all on function private.reservations_can(uuid,text) from public, anon;
grant execute on function private.reservations_can(uuid,text) to authenticated, service_role;

create table public.reservation_rooms (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.reservation_establishments(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description)<=2000),
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  active boolean not null default true,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (establishment_id,id)
);
create unique index reservation_rooms_name_idx on public.reservation_rooms(establishment_id,lower(btrim(name))) where active;

create table public.reservation_tables (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null,
  room_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 40),
  capacity integer not null check (capacity between 1 and 1000),
  shape text not null check (shape in ('round','square','rectangle')),
  active boolean not null default true,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  foreign key (establishment_id,room_id) references public.reservation_rooms(establishment_id,id) on delete restrict,
  unique (establishment_id,room_id,id)
);
create unique index reservation_tables_label_idx on public.reservation_tables(establishment_id,room_id,lower(btrim(label))) where active;

create table public.reservation_layouts (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null,
  room_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  width integer not null default 1000 check (width between 100 and 10000),
  height integer not null default 700 check (height between 100 and 10000),
  status text not null default 'active' check (status in ('active','draft','archived')),
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  foreign key (establishment_id,room_id) references public.reservation_rooms(establishment_id,id) on delete restrict,
  unique (establishment_id,room_id,id)
);
create unique index reservation_layouts_active_idx on public.reservation_layouts(establishment_id,room_id) where status='active';

create function private.reservation_properties_valid(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p)='object'
    and not exists (select 1 from jsonb_object_keys(case when jsonb_typeof(p)='object' then p else '{}'::jsonb end) k where k not in ('fill','stroke','label'))
    and (not (p?'fill') or (jsonb_typeof(p->'fill')='string' and p->>'fill' ~ '^#[0-9A-Fa-f]{6}$'))
    and (not (p?'stroke') or (jsonb_typeof(p->'stroke')='string' and p->>'stroke' ~ '^#[0-9A-Fa-f]{6}$'))
    and (not (p?'label') or (jsonb_typeof(p->'label')='string' and length(p->>'label')<=120)), false);
$$;

create table public.reservation_layout_elements (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null,
  room_id uuid not null,
  layout_id uuid not null,
  table_id uuid,
  kind text not null check (kind in ('table','wall','door','window','bar','stairs','plant','label')),
  x numeric, y numeric,
  width numeric not null default 80 check (width>0 and width<=10000),
  height numeric not null default 80 check (height>0 and height<=10000),
  rotation numeric not null default 0 check (rotation>=0 and rotation<360),
  z_index integer not null default 0 check (z_index between -10000 and 10000),
  properties jsonb not null default '{}'::jsonb check (private.reservation_properties_valid(properties)),
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  check ((kind='table')=(table_id is not null)),
  check ((x is null and y is null) or (x is not null and y is not null and x between 0 and 100000 and y between 0 and 100000)),
  foreign key (establishment_id,room_id,layout_id) references public.reservation_layouts(establishment_id,room_id,id) on delete restrict,
  foreign key (establishment_id,room_id,table_id) references public.reservation_tables(establishment_id,room_id,id) on delete restrict
);
create unique index reservation_elements_table_idx on public.reservation_layout_elements(layout_id,table_id) where table_id is not null;
create index reservation_elements_tenant_idx on public.reservation_layout_elements(establishment_id,room_id,layout_id);

create table public.reservation_audit (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.reservation_establishments(id) on delete restrict,
  resource_type text not null,
  resource_id uuid not null,
  action text not null check (action in ('INSERT','UPDATE')),
  before_value jsonb, after_value jsonb not null,
  actor_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index reservation_audit_tenant_idx on public.reservation_audit(establishment_id,occurred_at);

create function private.reservation_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.establishment_id<>old.establishment_id then
      raise exception 'Identité et établissement immuables.' using errcode='22023';
    end if;
    new.created_at:=old.created_at;
    -- created_by is never RPC-writable. Allow FK ON DELETE SET NULL cleanup.
    new.version:=old.version+1;
  else
    new.version:=1; new.created_by:=auth.uid();
  end if;
  new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid();
  return new;
end;
$$;

create function private.reservation_audit_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reservation_audit(establishment_id,resource_type,resource_id,action,before_value,after_value,actor_id)
  values(new.establishment_id,tg_table_name,new.id,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid());
  return new;
end;
$$;
revoke all on function private.reservation_stamp(), private.reservation_audit_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['reservation_rooms','reservation_tables','reservation_layouts','reservation_layout_elements'] loop
    execute format('create trigger reservation_stamp before insert or update on public.%I for each row execute function private.reservation_stamp()',t);
    execute format('create trigger reservation_audit after insert or update on public.%I for each row execute function private.reservation_audit_change()',t);
  end loop;
  foreach t in array array['reservation_establishments','reservation_memberships','reservation_rooms','reservation_tables','reservation_layouts','reservation_layout_elements','reservation_audit'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end;
$$;

create policy reservation_establishments_read on public.reservation_establishments for select to authenticated using (private.reservations_can(id,'view'));
create policy reservation_memberships_read on public.reservation_memberships for select to authenticated using (profile_id=auth.uid() and private.reservations_can(establishment_id,'view'));
create policy reservation_rooms_read on public.reservation_rooms for select to authenticated using (private.reservations_can(establishment_id,'view'));
create policy reservation_tables_read on public.reservation_tables for select to authenticated using (private.reservations_can(establishment_id,'view'));
create policy reservation_layouts_read on public.reservation_layouts for select to authenticated using (private.reservations_can(establishment_id,'view'));
create policy reservation_elements_read on public.reservation_layout_elements for select to authenticated using (private.reservations_can(establishment_id,'view'));
create policy reservation_audit_read on public.reservation_audit for select to authenticated using (private.reservations_can(establishment_id,'rooms.manage') or private.reservations_can(establishment_id,'tables.manage') or private.reservations_can(establishment_id,'layouts.manage'));

create function public.reservations_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and actif) then
    raise exception 'Authentification StopFlow active requise.' using errcode='42501';
  end if;
  return jsonb_build_object('establishments',coalesce((
    select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'can_view',m.can_view,'can_manage_rooms',m.can_manage_rooms,'can_manage_tables',m.can_manage_tables,'can_manage_layouts',m.can_manage_layouts) order by e.name,e.id)
    from public.reservation_establishments e join public.reservation_memberships m on m.establishment_id=e.id
    where m.profile_id=auth.uid() and m.active and m.can_view and e.active
  ),'[]'::jsonb));
end;
$$;

create function public.reservations_read(p_establishment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.reservations_can(p_establishment_id,'view') then
    raise exception 'Accès établissement refusé.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'rooms',coalesce((select jsonb_agg(r order by r.sort_order,r.name,r.id) from public.reservation_rooms r where r.establishment_id=p_establishment_id),'[]'::jsonb),
    'tables',coalesce((select jsonb_agg(t order by t.label,t.id) from public.reservation_tables t where t.establishment_id=p_establishment_id),'[]'::jsonb),
    'layouts',coalesce((select jsonb_agg(l order by l.id) from public.reservation_layouts l where l.establishment_id=p_establishment_id),'[]'::jsonb),
    'elements',coalesce((select jsonb_agg(e order by e.z_index,e.id) from public.reservation_layout_elements e where e.establishment_id=p_establishment_id),'[]'::jsonb)
  );
end;
$$;

create function public.reservations_save_room(p_establishment_id uuid,p_id uuid,p_expected_version bigint,p_name text,p_description text,p_sort_order integer,p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.reservation_rooms;
begin
  if not private.reservations_can(p_establishment_id,'rooms.manage') then
    raise exception 'Gestion des salles non autorisée.' using errcode='42501';
  end if;
  if p_id is null then
    if p_expected_version is not null then raise exception 'Version de création invalide.' using errcode='22023'; end if;
    insert into public.reservation_rooms(establishment_id,name,description,sort_order,active)
    values(p_establishment_id,btrim(p_name),coalesce(p_description,''),p_sort_order,p_active) returning * into r;
    insert into public.reservation_layouts(establishment_id,room_id,name) values(p_establishment_id,r.id,'Configuration initiale');
  else
    select * into r from public.reservation_rooms where id=p_id and establishment_id=p_establishment_id for update;
    if not found then raise exception 'Salle inaccessible.' using errcode='42501'; end if;
    if p_expected_version is distinct from r.version then raise exception 'CONFLIT_VERSION : rechargez la salle avant de modifier.' using errcode='40001'; end if;
    update public.reservation_rooms set name=btrim(p_name),description=coalesce(p_description,''),sort_order=p_sort_order,active=p_active where id=r.id returning * into r;
  end if;
  return to_jsonb(r);
end;
$$;

create function public.reservations_save_table(p_establishment_id uuid,p_room_id uuid,p_id uuid,p_expected_version bigint,p_label text,p_capacity integer,p_shape text,p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.reservation_tables; l uuid;
begin
  if not private.reservations_can(p_establishment_id,'tables.manage') then
    raise exception 'Gestion des tables non autorisée.' using errcode='42501';
  end if;
  perform 1 from public.reservation_rooms where id=p_room_id and establishment_id=p_establishment_id and active for update;
  if not found then raise exception 'Salle inaccessible ou archivée.' using errcode='42501'; end if;
  select id into l from public.reservation_layouts where room_id=p_room_id and establishment_id=p_establishment_id and status='active';
  if l is null then raise exception 'Configuration active introuvable.' using errcode='22023'; end if;
  if p_id is null then
    if p_expected_version is not null then raise exception 'Version de création invalide.' using errcode='22023'; end if;
    insert into public.reservation_tables(establishment_id,room_id,label,capacity,shape,active)
    values(p_establishment_id,p_room_id,btrim(p_label),p_capacity,p_shape,p_active) returning * into t;
    insert into public.reservation_layout_elements(establishment_id,room_id,layout_id,table_id,kind,width,height)
    values(p_establishment_id,p_room_id,l,t.id,'table',case when p_shape='rectangle' then 120 else 80 end,80);
  else
    select * into t from public.reservation_tables where id=p_id and room_id=p_room_id and establishment_id=p_establishment_id for update;
    if not found then raise exception 'Table inaccessible.' using errcode='42501'; end if;
    if p_expected_version is distinct from t.version then raise exception 'CONFLIT_VERSION : rechargez la table avant de modifier.' using errcode='40001'; end if;
    update public.reservation_tables set label=btrim(p_label),capacity=p_capacity,shape=p_shape,active=p_active where id=t.id returning * into t;
  end if;
  -- A physical-resource change invalidates the associated future editor version.
  update public.reservation_layouts set updated_at=now() where id=l;
  return to_jsonb(t);
end;
$$;

revoke all on function public.reservations_context(), public.reservations_read(uuid), public.reservations_save_room(uuid,uuid,bigint,text,text,integer,boolean), public.reservations_save_table(uuid,uuid,uuid,bigint,text,integer,text,boolean) from public, anon;
grant execute on function public.reservations_context(), public.reservations_read(uuid), public.reservations_save_room(uuid,uuid,bigint,text,text,integer,boolean), public.reservations_save_table(uuid,uuid,uuid,bigint,text,integer,text,boolean) to authenticated, service_role;
comment on column public.reservation_layout_elements.x is 'NULL with y: unpositioned; automatic UI grid is provisional, never a saved restaurant plan.';
comment on table public.reservation_tables is 'Immutable physical identity. No occupancy or availability is inferred.';
comment on table public.reservation_layouts is 'Configuration identity independent from physical tables. Part 2 must use version checks and immutable full-layout snapshots.';
revoke all on function private.reservation_properties_valid(jsonb) from public, anon, authenticated;
grant execute on function private.reservation_properties_valid(jsonb) to service_role;
commit;
