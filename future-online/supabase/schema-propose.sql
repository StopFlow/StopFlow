-- Schéma de conception proposé, non encore appliqué.
create extension if not exists pgcrypto;

create type public.user_role as enum ('employe', 'responsable');
create type public.document_status as enum
  ('brouillon', 'a_valider', 'valide', 'commande', 'annule');

create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id),
  full_name text not null,
  role public.user_role not null default 'employe'
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  name text not null,
  active boolean not null default true
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null,
  category text,
  unit text not null,
  target numeric not null default 0,
  active boolean not null default true
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  supplier_id uuid not null references public.suppliers(id),
  number text,
  status public.document_status not null default 'brouillon',
  author_id uuid not null references public.profiles(id),
  validator_id uuid references public.profiles(id),
  note text,
  inventory_at timestamptz not null default now(),
  validated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  article_id uuid not null references public.articles(id),
  stock numeric not null default 0,
  target numeric not null default 0,
  quantity numeric not null default 0
);
