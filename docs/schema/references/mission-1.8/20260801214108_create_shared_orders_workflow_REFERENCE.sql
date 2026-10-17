create schema if not exists private;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'stopflow_order_status'
  ) then
    create type public.stopflow_order_status as enum (
      'Brouillon',
      'À valider',
      'Validé',
      'Commandé',
      'Annulé'
    );
  end if;
end
$$;

create sequence if not exists public.order_number_seq start with 1 increment by 1;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  supplier text not null check (btrim(supplier) <> ''),
  status public.stopflow_order_status not null default 'Brouillon',
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  validator_id uuid references public.profiles(id) on delete set null,
  validator_name text,
  note text not null default '',
  stocks jsonb not null default '{}'::jsonb check (jsonb_typeof(stocks) = 'object'),
  adjustments jsonb not null default '{}'::jsonb check (jsonb_typeof(adjustments) = 'object'),
  inventory_at timestamptz not null default now(),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_number_format check (number is null or number ~ '^BC-[0-9]{6,}$'),
  constraint orders_validation_consistency check (
    (status in ('Brouillon', 'À valider') and validated_at is null)
    or
    (status in ('Validé', 'Commandé', 'Annulé'))
  )
);

create table if not exists public.order_lines (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  line_position integer not null check (line_position >= 0),
  article_id text,
  article_name text not null,
  category text not null default '',
  unit text not null default '',
  target numeric not null default 0 check (target >= 0),
  stock numeric not null default 0 check (stock >= 0),
  proposed numeric not null default 0 check (proposed >= 0),
  quantity numeric not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, line_position)
);

create index if not exists orders_status_inventory_at_idx
  on public.orders(status, inventory_at desc);
create index if not exists orders_author_id_idx
  on public.orders(author_id);
create index if not exists order_lines_order_id_idx
  on public.order_lines(order_id, line_position);

create or replace function private.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.actif = true
  limit 1;
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.actif = true
  );
$$;

create or replace function private.is_responsible_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_role() in ('admin', 'responsable'), false);
$$;

create or replace function private.can_edit_order_lines(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and (
        private.is_responsible_or_admin()
        or (
          o.author_id = (select auth.uid())
          and o.status = 'Brouillon'
          and private.is_active_user()
        )
      )
  );
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function private.set_updated_at();

drop trigger if exists order_lines_set_updated_at on public.order_lines;
create trigger order_lines_set_updated_at
before update on public.order_lines
for each row execute function private.set_updated_at();

alter table public.orders enable row level security;
alter table public.order_lines enable row level security;

drop policy if exists orders_select_active on public.orders;
create policy orders_select_active
on public.orders
for select
to authenticated
using (private.is_active_user());

drop policy if exists orders_insert_own_draft on public.orders;
create policy orders_insert_own_draft
on public.orders
for insert
to authenticated
with check (
  private.is_active_user()
  and author_id = (select auth.uid())
  and status = 'Brouillon'
  and number is null
  and validator_id is null
  and validator_name is null
  and validated_at is null
);

drop policy if exists orders_update_own_draft on public.orders;
create policy orders_update_own_draft
on public.orders
for update
to authenticated
using (
  private.is_active_user()
  and author_id = (select auth.uid())
  and status = 'Brouillon'
)
with check (
  author_id = (select auth.uid())
  and status = 'Brouillon'
  and number is null
  and validator_id is null
  and validator_name is null
  and validated_at is null
);

drop policy if exists orders_update_manager on public.orders;
create policy orders_update_manager
on public.orders
for update
to authenticated
using (private.is_responsible_or_admin())
with check (private.is_responsible_or_admin());

drop policy if exists order_lines_select_active on public.order_lines;
create policy order_lines_select_active
on public.order_lines
for select
to authenticated
using (private.is_active_user());

drop policy if exists order_lines_insert_editable_order on public.order_lines;
create policy order_lines_insert_editable_order
on public.order_lines
for insert
to authenticated
with check (private.can_edit_order_lines(order_id));

drop policy if exists order_lines_update_editable_order on public.order_lines;
create policy order_lines_update_editable_order
on public.order_lines
for update
to authenticated
using (private.can_edit_order_lines(order_id))
with check (private.can_edit_order_lines(order_id));

drop policy if exists order_lines_delete_editable_order on public.order_lines;
create policy order_lines_delete_editable_order
on public.order_lines
for delete
to authenticated
using (private.can_edit_order_lines(order_id));

create or replace function public.submit_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not private.is_active_user() then
    raise exception 'Compte StopFlow inactif.';
  end if;

  update public.orders o
  set status = 'À valider',
      inventory_at = now()
  where o.id = p_order_id
    and o.author_id = (select auth.uid())
    and o.status = 'Brouillon'
  returning o.* into v_order;

  if v_order.id is null then
    raise exception 'Brouillon introuvable ou déjà envoyé.';
  end if;

  return v_order;
end;
$$;

create or replace function public.validate_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_validator_name text;
  v_number text;
begin
  if not private.is_responsible_or_admin() then
    raise exception 'Action réservée au Responsable ou à l’Admin.';
  end if;

  select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '')
  into v_validator_name
  from public.profiles p
  where p.id = (select auth.uid());

  v_validator_name := coalesce(v_validator_name, 'Responsable StopFlow');
  v_number := 'BC-' || lpad(nextval('public.order_number_seq')::text, 6, '0');

  update public.orders o
  set status = 'Validé',
      number = v_number,
      validator_id = (select auth.uid()),
      validator_name = v_validator_name,
      validated_at = now()
  where o.id = p_order_id
    and o.status = 'À valider'
  returning o.* into v_order;

  if v_order.id is null then
    raise exception 'Document introuvable ou non disponible pour validation.';
  end if;

  return v_order;
end;
$$;

create or replace function public.mark_ordered(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not private.is_responsible_or_admin() then
    raise exception 'Action réservée au Responsable ou à l’Admin.';
  end if;

  update public.orders o
  set status = 'Commandé'
  where o.id = p_order_id
    and o.status = 'Validé'
  returning o.* into v_order;

  if v_order.id is null then
    raise exception 'Bon validé introuvable.';
  end if;

  return v_order;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not private.is_responsible_or_admin() then
    raise exception 'Action réservée au Responsable ou à l’Admin.';
  end if;

  update public.orders o
  set status = 'Annulé'
  where o.id = p_order_id
    and o.status <> 'Annulé'
  returning o.* into v_order;

  if v_order.id is null then
    raise exception 'Document introuvable ou déjà annulé.';
  end if;

  return v_order;
end;
$$;

revoke all on public.orders from anon;
revoke all on public.order_lines from anon;
revoke all on public.order_number_seq from anon, authenticated;

revoke all on public.orders from authenticated;
grant select, insert on public.orders to authenticated;
grant update (note, stocks, adjustments, inventory_at) on public.orders to authenticated;

grant select, insert, update, delete on public.order_lines to authenticated;
grant usage, select on sequence public.order_lines_id_seq to authenticated;

grant usage on schema private to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_responsible_or_admin() to authenticated;
grant execute on function private.can_edit_order_lines(uuid) to authenticated;

revoke all on function public.submit_order(uuid) from public;
revoke all on function public.validate_order(uuid) from public;
revoke all on function public.mark_ordered(uuid) from public;
revoke all on function public.cancel_order(uuid) from public;
grant execute on function public.submit_order(uuid) to authenticated;
grant execute on function public.validate_order(uuid) to authenticated;
grant execute on function public.mark_ordered(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;

comment on table public.orders is 'Documents StopFlow partagés : inventaires, validations et bons de commande.';
comment on table public.order_lines is 'Lignes figées de chaque document StopFlow pour préserver l’historique et le PDF.';