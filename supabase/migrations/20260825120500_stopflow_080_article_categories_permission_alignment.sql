-- StopFlow 0.8.0 — aligner les catégories d’articles sur la permission articles.manage.

drop policy if exists article_categories_insert_managers on public.article_categories;
drop policy if exists article_categories_update_managers on public.article_categories;
drop policy if exists article_categories_select_active_users on public.article_categories;

create policy article_categories_insert_article_managers
on public.article_categories
for insert
to authenticated
with check (
  private.has_permission('articles.manage','cuisine')
  or private.has_permission('articles.manage','salle')
  or private.has_permission('articles.manage','nettoyage')
);

create policy article_categories_update_article_managers
on public.article_categories
for update
to authenticated
using (
  private.has_permission('articles.manage','cuisine')
  or private.has_permission('articles.manage','salle')
  or private.has_permission('articles.manage','nettoyage')
)
with check (
  private.has_permission('articles.manage','cuisine')
  or private.has_permission('articles.manage','salle')
  or private.has_permission('articles.manage','nettoyage')
);

create policy article_categories_select_active_users
on public.article_categories
for select
to authenticated
using (
  private.is_active_user()
  and (
    active = true
    or private.has_permission('articles.manage','cuisine')
    or private.has_permission('articles.manage','salle')
    or private.has_permission('articles.manage','nettoyage')
  )
);
