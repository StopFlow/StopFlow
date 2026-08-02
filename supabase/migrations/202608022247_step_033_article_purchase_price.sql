-- StopFlow 0.3.3 — prix d’achat facultatif par article.

alter table public.articles
  add column if not exists purchase_price numeric(12,2);

alter table public.articles
  drop constraint if exists articles_purchase_price_non_negative;

alter table public.articles
  add constraint articles_purchase_price_non_negative
  check (purchase_price is null or purchase_price >= 0);

comment on column public.articles.purchase_price is
  'Prix d’achat HTVA facultatif, exprimé en euros pour le conditionnement indiqué dans unit.';
