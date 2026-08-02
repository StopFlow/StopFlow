-- StopFlow 0.3.3 — fournisseurs partagés.
-- Migration appliquée sur le projet Supabase gjwvquhoecfikjorapud.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  vat_number text not null default '',
  delivery_notes text not null default '',
  logo_path text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint suppliers_code_not_blank check (btrim(code) <> ''),
  constraint suppliers_code_lowercase check (code = lower(code)),
  constraint suppliers_code_format check (code ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint suppliers_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists suppliers_name_lower_idx
  on public.suppliers (lower(name));

alter table public.suppliers enable row level security;

drop policy if exists suppliers_select_active_users on public.suppliers;
create policy suppliers_select_active_users
on public.suppliers
for select
to authenticated
using (private.is_active_user() and (active = true or private.is_admin()));

drop policy if exists suppliers_insert_admin on public.suppliers;
create policy suppliers_insert_admin
on public.suppliers
for insert
to authenticated
with check (private.is_admin());

drop policy if exists suppliers_update_admin on public.suppliers;
create policy suppliers_update_admin
on public.suppliers
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

grant select, insert, update on public.suppliers to authenticated;

insert into public.suppliers (code, name, description, logo_path, active, sort_order)
values
  ('colruyt', 'Colruyt', 'Apéritifs & digestifs', 'colruyt', true, 10),
  ('leloup', 'Leloup', 'Vins maison en fûts & azote', 'leloup', true, 20)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  logo_path = excluded.logo_path,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.articles add column if not exists supplier_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'articles_supplier_id_fkey'
      and conrelid = 'public.articles'::regclass
  ) then
    alter table public.articles
      add constraint articles_supplier_id_fkey
      foreign key (supplier_id)
      references public.suppliers(id)
      on update cascade
      on delete restrict;
  end if;
end $$;

update public.articles a
set supplier_id = s.id,
    supplier = s.name
from public.suppliers s
where a.supplier_id is null
  and (lower(btrim(a.supplier)) = lower(s.name) or lower(btrim(a.supplier)) = s.code);

create index if not exists articles_supplier_id_idx on public.articles (supplier_id);

create or replace function private.sync_article_supplier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_id uuid;
  resolved_name text;
begin
  if new.supplier_id is not null then
    select s.id, s.name into resolved_id, resolved_name
    from public.suppliers s where s.id = new.supplier_id;
    if resolved_id is null then raise exception 'Fournisseur introuvable.'; end if;
    new.supplier := resolved_name;
  elsif btrim(coalesce(new.supplier, '')) <> '' then
    select s.id, s.name into resolved_id, resolved_name
    from public.suppliers s
    where lower(s.name) = lower(btrim(new.supplier)) or s.code = lower(btrim(new.supplier))
    order by s.active desc, s.sort_order, s.name
    limit 1;
    if resolved_id is not null then
      new.supplier_id := resolved_id;
      new.supplier := resolved_name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists articles_sync_supplier on public.articles;
create trigger articles_sync_supplier
before insert or update of supplier, supplier_id on public.articles
for each row execute function private.sync_article_supplier();

create or replace function private.sync_supplier_name_to_articles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    update public.articles set supplier = new.name where supplier_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists suppliers_set_catalog_audit on public.suppliers;
create trigger suppliers_set_catalog_audit
before update on public.suppliers
for each row execute function private.set_catalog_audit();

drop trigger if exists suppliers_sync_article_names on public.suppliers;
create trigger suppliers_sync_article_names
after update of name on public.suppliers
for each row execute function private.sync_supplier_name_to_articles();

comment on table public.suppliers is
  'Fournisseurs partagés de StopFlow. La désactivation masque un fournisseur sans supprimer son historique.';
comment on column public.articles.supplier_id is
  'Lien vers le fournisseur partagé. La colonne supplier reste conservée pour compatibilité et historique.';
