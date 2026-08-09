create table if not exists public.profile_card_preferences (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  zone text not null check (zone in ('home','cuisine','salle','nettoyage','general')),
  card_key text not null check (char_length(card_key) between 1 and 120),
  position integer not null default 0 check (position >= 0),
  hidden boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_id, zone, card_key)
);

create index if not exists profile_card_preferences_profile_zone_idx
  on public.profile_card_preferences(profile_id, zone, position, card_key);

alter table public.profile_card_preferences enable row level security;

drop policy if exists profile_card_preferences_select_own on public.profile_card_preferences;
create policy profile_card_preferences_select_own
on public.profile_card_preferences
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists profile_card_preferences_insert_own on public.profile_card_preferences;
create policy profile_card_preferences_insert_own
on public.profile_card_preferences
for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists profile_card_preferences_update_own on public.profile_card_preferences;
create policy profile_card_preferences_update_own
on public.profile_card_preferences
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists profile_card_preferences_delete_own on public.profile_card_preferences;
create policy profile_card_preferences_delete_own
on public.profile_card_preferences
for delete
to authenticated
using (profile_id = auth.uid());

grant select, insert, update, delete on public.profile_card_preferences to authenticated;

comment on table public.profile_card_preferences is 'Préférences personnelles d’affichage des cartes StopFlow 0.7.0. Indépendantes des permissions métier.';
comment on column public.profile_card_preferences.settings is 'Réservé aux options visuelles futures (taille, couleur, etc.) sans modifier les permissions.';
