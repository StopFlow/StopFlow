-- StopFlow 0.6.0 — sécurité Supabase stricte par département.
-- Migration additive et rétrocompatible avec l'interface 0.5.4.

begin;

create or replace function private.is_operational_department(p_department text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce(p_department in ('salle','cuisine','nettoyage'), false);
$$;

create or replace function private.can_access_department(p_department text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select private.is_active_user()
    and private.is_operational_department(p_department)
    and (
      private.is_responsible_or_admin()
      or p_department = private.current_department()
    );
$$;

create or replace function private.can_access_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and private.can_access_department(o.department)
  );
$$;

create or replace function private.can_edit_order_lines(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and private.can_access_department(o.department)
      and (
        private.is_responsible_or_admin()
        or (
          o.author_id = auth.uid()
          and o.status = 'Brouillon'
        )
      )
  );
$$;

revoke all on function private.is_operational_department(text) from public;
revoke all on function private.can_access_department(text) from public;
revoke all on function private.can_access_order(uuid) from public;
revoke all on function private.can_edit_order_lines(uuid) from public;
grant execute on function private.is_operational_department(text) to authenticated;
grant execute on function private.can_access_department(text) to authenticated;
grant execute on function private.can_access_order(uuid) to authenticated;
grant execute on function private.can_edit_order_lines(uuid) to authenticated;

create or replace function private.stopflow_060_apply_article_department()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_supplier public.suppliers;
begin
  if new.supplier_id is not null then
    select s.* into v_supplier
    from public.suppliers s
    where s.id = new.supplier_id
    limit 1;
  else
    select s.* into v_supplier
    from public.suppliers s
    where lower(s.name) = lower(btrim(coalesce(new.supplier,'')))
    limit 1;
  end if;

  if v_supplier.id is null then
    raise exception 'Fournisseur introuvable pour cet article.' using errcode = '23503';
  end if;

  if not private.is_operational_department(v_supplier.department) then
    raise exception 'Le département du fournisseur est invalide.' using errcode = '23514';
  end if;

  new.supplier_id := v_supplier.id;
  new.supplier := v_supplier.name;
  new.department := v_supplier.department;
  return new;
end;
$$;

create or replace function private.stopflow_060_apply_order_department()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_supplier public.suppliers;
begin
  select s.* into v_supplier
  from public.suppliers s
  where lower(s.name) = lower(btrim(coalesce(new.supplier,'')))
  limit 1;

  if v_supplier.id is null then
    raise exception 'Fournisseur introuvable pour cette commande.' using errcode = '23503';
  end if;

  if tg_op = 'INSERT' and v_supplier.active is not true then
    raise exception 'Ce fournisseur est désactivé.' using errcode = '23514';
  end if;

  if not private.is_operational_department(v_supplier.department) then
    raise exception 'Le département du fournisseur est invalide.' using errcode = '23514';
  end if;

  new.supplier := v_supplier.name;
  new.department := v_supplier.department;
  return new;
end;
$$;

create or replace function private.stopflow_060_cascade_supplier_department()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.name is distinct from old.name
     or new.department is distinct from old.department then
    update public.articles
    set supplier = new.name,
        department = new.department
    where supplier_id = new.id;

    update public.orders
    set supplier = new.name,
        department = new.department
    where status = 'Brouillon'
      and lower(supplier) = lower(old.name);
  end if;
  return new;
end;
$$;

drop trigger if exists stopflow_060_article_department on public.articles;
create trigger stopflow_060_article_department
before insert or update of supplier_id, supplier, department
on public.articles
for each row execute function private.stopflow_060_apply_article_department();

drop trigger if exists stopflow_060_order_department on public.orders;
create trigger stopflow_060_order_department
before insert or update of supplier, department
on public.orders
for each row execute function private.stopflow_060_apply_order_department();

drop trigger if exists stopflow_060_supplier_department_cascade on public.suppliers;
create trigger stopflow_060_supplier_department_cascade
after update of name, department
on public.suppliers
for each row execute function private.stopflow_060_cascade_supplier_department();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'suppliers_department_operational_check'
  ) then
    alter table public.suppliers
      add constraint suppliers_department_operational_check
      check (department in ('salle','cuisine','nettoyage')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'articles_department_operational_check'
  ) then
    alter table public.articles
      add constraint articles_department_operational_check
      check (department in ('salle','cuisine','nettoyage')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_department_operational_check'
  ) then
    alter table public.orders
      add constraint orders_department_operational_check
      check (department in ('salle','cuisine','nettoyage')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_department_known_check'
  ) then
    alter table public.profiles
      add constraint profiles_department_known_check
      check (departement is null or departement in ('salle','cuisine','nettoyage','bureau')) not valid;
  end if;
end
$$;

alter table public.suppliers validate constraint suppliers_department_operational_check;
alter table public.articles validate constraint articles_department_operational_check;
alter table public.orders validate constraint orders_department_operational_check;
alter table public.profiles validate constraint profiles_department_known_check;

drop policy if exists suppliers_select_active_users on public.suppliers;
create policy suppliers_select_active_users
on public.suppliers
for select
to authenticated
using (
  private.can_access_department(department)
  and (active = true or private.is_admin())
);

drop policy if exists suppliers_insert_admin on public.suppliers;
create policy suppliers_insert_admin
on public.suppliers
for insert
to authenticated
with check (
  private.is_admin()
  and private.is_operational_department(department)
);

drop policy if exists suppliers_update_admin on public.suppliers;
create policy suppliers_update_admin
on public.suppliers
for update
to authenticated
using (private.is_admin())
with check (
  private.is_admin()
  and private.is_operational_department(department)
);

drop policy if exists articles_select_active_users on public.articles;
create policy articles_select_active_users
on public.articles
for select
to authenticated
using (
  private.can_access_department(department)
  and (active = true or private.is_responsible_or_admin())
);

drop policy if exists articles_insert_responsible on public.articles;
create policy articles_insert_responsible
on public.articles
for insert
to authenticated
with check (
  private.is_responsible_or_admin()
  and private.is_operational_department(department)
);

drop policy if exists articles_update_responsible on public.articles;
create policy articles_update_responsible
on public.articles
for update
to authenticated
using (private.is_responsible_or_admin())
with check (
  private.is_responsible_or_admin()
  and private.is_operational_department(department)
);

drop policy if exists orders_select_active on public.orders;
create policy orders_select_active
on public.orders
for select
to authenticated
using (private.can_access_department(department));

drop policy if exists orders_insert_own_draft on public.orders;
create policy orders_insert_own_draft
on public.orders
for insert
to authenticated
with check (
  private.is_active_user()
  and author_id = auth.uid()
  and status = 'Brouillon'
  and number is null
  and validator_id is null
  and validator_name is null
  and validated_at is null
  and private.can_access_department(department)
);

drop policy if exists orders_update_own_draft on public.orders;
create policy orders_update_own_draft
on public.orders
for update
to authenticated
using (
  private.is_active_user()
  and author_id = auth.uid()
  and status = 'Brouillon'
  and private.can_access_department(department)
)
with check (
  author_id = auth.uid()
  and status = 'Brouillon'
  and number is null
  and validator_id is null
  and validator_name is null
  and validated_at is null
  and private.can_access_department(department)
);

drop policy if exists orders_update_manager on public.orders;
create policy orders_update_manager
on public.orders
for update
to authenticated
using (private.is_responsible_or_admin())
with check (
  private.is_responsible_or_admin()
  and private.is_operational_department(department)
);

drop policy if exists order_lines_select_active on public.order_lines;
create policy order_lines_select_active
on public.order_lines
for select
to authenticated
using (private.can_access_order(order_id));

create or replace function public.save_order_draft_atomic(
  p_order_id uuid,
  p_supplier text,
  p_author_name text,
  p_note text,
  p_stocks jsonb,
  p_adjustments jsonb,
  p_inventory_at timestamptz,
  p_created_at timestamptz,
  p_expected_revision bigint,
  p_lines jsonb
)
returns public.orders
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order public.orders;
  v_profile public.profiles;
  v_supplier public.suppliers;
  v_article public.articles;
  v_line jsonb;
  v_position integer := 0;
  v_department text;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and actif = true;

  if v_profile.id is null then
    raise exception 'Compte StopFlow inactif ou session invalide.' using errcode = '42501';
  end if;

  if p_order_id is null or btrim(coalesce(p_supplier,'')) = '' then
    raise exception 'Identifiant ou fournisseur manquant.' using errcode = '22023';
  end if;

  select s.* into v_supplier
  from public.suppliers s
  where lower(s.name) = lower(btrim(p_supplier))
  limit 1;

  if v_supplier.id is null then
    raise exception 'Fournisseur introuvable.' using errcode = '23503';
  end if;

  if v_supplier.active is not true then
    raise exception 'Ce fournisseur est désactivé.' using errcode = '23514';
  end if;

  if not private.is_operational_department(v_supplier.department) then
    raise exception 'Le département du fournisseur est invalide.' using errcode = '23514';
  end if;

  v_department := v_supplier.department;

  if not private.is_responsible_or_admin() then
    if not private.is_operational_department(v_profile.departement) then
      raise exception 'Aucun département opérationnel n’est attribué à ce compte.' using errcode = '42501';
    end if;

    if v_profile.departement <> v_department then
      raise exception 'Ce fournisseur appartient à un autre département.' using errcode = '42501';
    end if;
  end if;

  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb)) <> 'array' then
    raise exception 'Les lignes du brouillon sont invalides.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_stocks,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_adjustments,'{}'::jsonb)) <> 'object' then
    raise exception 'Les données de stock du brouillon sont invalides.' using errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    insert into public.orders(
      id, supplier, department, status, author_id, author_name,
      note, stocks, adjustments, inventory_at, created_at,
      revision, last_edited_by, last_edited_name
    ) values (
      p_order_id, v_supplier.name, v_department, 'Brouillon', auth.uid(),
      coalesce(
        nullif(btrim(p_author_name),''),
        nullif(btrim(concat_ws(' ',v_profile.prenom,v_profile.nom)),''),
        v_profile.email
      ),
      coalesce(p_note,''), coalesce(p_stocks,'{}'::jsonb), coalesce(p_adjustments,'{}'::jsonb),
      coalesce(p_inventory_at,now()), coalesce(p_created_at,now()),
      1, auth.uid(),
      coalesce(nullif(btrim(concat_ws(' ',v_profile.prenom,v_profile.nom)),''),v_profile.email)
    ) returning * into v_order;
  else
    if v_order.status <> 'Brouillon' then
      raise exception 'Ce document a déjà été envoyé et ne peut plus être remplacé comme brouillon.' using errcode = 'P0001';
    end if;

    if lower(v_order.supplier) <> lower(v_supplier.name) then
      raise exception 'Le fournisseur du brouillon ne peut pas être modifié.' using errcode = '42501';
    end if;

    if not private.is_responsible_or_admin() then
      if v_order.author_id <> auth.uid() then
        raise exception 'Vous ne pouvez pas modifier ce brouillon.' using errcode = '42501';
      end if;

      if v_order.department <> v_profile.departement then
        raise exception 'Ce brouillon appartient à un autre département.' using errcode = '42501';
      end if;
    end if;

    if p_expected_revision is null or v_order.revision <> p_expected_revision then
      raise exception 'CONFLIT_REVISION: ce brouillon a été modifié sur un autre appareil.' using errcode = '40001';
    end if;

    update public.orders
    set supplier = v_supplier.name,
        department = v_department,
        note = coalesce(p_note,''),
        stocks = coalesce(p_stocks,'{}'::jsonb),
        adjustments = coalesce(p_adjustments,'{}'::jsonb),
        inventory_at = coalesce(p_inventory_at,inventory_at),
        revision = revision + 1,
        last_edited_by = auth.uid(),
        last_edited_name = coalesce(
          nullif(btrim(concat_ws(' ',v_profile.prenom,v_profile.nom)),''),
          v_profile.email
        )
    where id = p_order_id
    returning * into v_order;
  end if;

  delete from public.order_lines where order_id = p_order_id;

  for v_line in
    select value
    from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb))
  loop
    if nullif(v_line->>'article_id','') is null then
      raise exception 'Une ligne du brouillon ne possède pas d’article.' using errcode = '22023';
    end if;

    select a.* into v_article
    from public.articles a
    where a.id::text = v_line->>'article_id'
      and a.supplier_id = v_supplier.id
      and a.department = v_department
    limit 1;

    if v_article.id is null then
      raise exception 'Une ligne du brouillon appartient à un autre fournisseur ou département.' using errcode = '42501';
    end if;

    insert into public.order_lines(
      order_id,line_position,article_id,article_name,category,unit,
      target,stock,proposed,quantity
    ) values (
      p_order_id,
      v_position,
      v_article.id::text,
      v_article.name,
      v_article.category,
      v_article.unit,
      greatest(0,coalesce((v_line->>'target')::numeric,0)),
      greatest(0,coalesce((v_line->>'stock')::numeric,0)),
      greatest(0,coalesce((v_line->>'proposed')::numeric,0)),
      greatest(0,coalesce((v_line->>'quantity')::numeric,0))
    );

    v_position := v_position + 1;
  end loop;

  return v_order;
end;
$$;

create or replace function private.submit_order_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order public.orders;
begin
  if not private.is_active_user() then
    raise exception 'Compte StopFlow inactif.' using errcode = '42501';
  end if;

  update public.orders o
  set status = 'À valider',
      inventory_at = now()
  where o.id = p_order_id
    and o.status = 'Brouillon'
    and private.can_access_department(o.department)
    and (
      o.author_id = auth.uid()
      or private.is_responsible_or_admin()
    )
  returning o.* into v_order;

  if v_order.id is null then
    raise exception 'Brouillon introuvable, déjà envoyé ou inaccessible.' using errcode = '42501';
  end if;

  return v_order;
end;
$$;

comment on function public.save_order_draft_atomic(uuid,text,text,text,jsonb,jsonb,timestamptz,timestamptz,bigint,jsonb)
is 'StopFlow 0.6.0 : enregistrement atomique contrôlé par fournisseur et département.';

comment on function private.can_access_order(uuid)
is 'StopFlow 0.6.0 : autorise la lecture d’une commande et de ses lignes selon le département.';

commit;
