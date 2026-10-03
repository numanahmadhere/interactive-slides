-- Interactive Slides: cloud storage and share links.
-- Run this once in your Supabase project (SQL Editor > New query > paste > Run).
-- It is safe to run again.

create table if not exists public.decks (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'Untitled deck' check (char_length(title) <= 200),
  data        jsonb not null,
  share_token text unique check (share_token is null or char_length(share_token) >= 22),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Added later: a small picture of the first slide for the dashboard. Safe to run again.
alter table public.decks add column if not exists thumb text check (thumb is null or char_length(thumb) <= 60000);

create index if not exists decks_owner_idx on public.decks (owner, updated_at desc);

-- updated_at is set by the database, not trusted from the browser.
create or replace function public.decks_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  new.owner = old.owner;            -- a deck can never be handed to someone else
  return new;
end $$;

drop trigger if exists decks_touch on public.decks;
create trigger decks_touch before update on public.decks
  for each row execute function public.decks_touch();

-- Row level security: a signed-in person can only see and change their own decks.
alter table public.decks enable row level security;

drop policy if exists "decks: owner reads"   on public.decks;
drop policy if exists "decks: owner inserts" on public.decks;
drop policy if exists "decks: owner updates" on public.decks;
drop policy if exists "decks: owner deletes" on public.decks;

create policy "decks: owner reads"   on public.decks for select to authenticated using (owner = auth.uid());
create policy "decks: owner inserts" on public.decks for insert to authenticated with check (owner = auth.uid());
create policy "decks: owner updates" on public.decks for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "decks: owner deletes" on public.decks for delete to authenticated using (owner = auth.uid());

-- Anonymous visitors get no direct access to the table at all.
revoke all on public.decks from anon;

-- A share link works through this one function. It returns the deck for an exact
-- token and nothing else; there is no way to list or search shared decks.
create or replace function public.get_shared_deck(t text) returns jsonb
language sql security definer set search_path = public as $$
  select data from public.decks where share_token = t and t is not null and char_length(t) >= 22
$$;

revoke all on function public.get_shared_deck(text) from public;
grant execute on function public.get_shared_deck(text) to anon, authenticated;

-- Deleting your own account. Removes the sign-in and, through the foreign key, every
-- deck. The browser can only call this for the signed-in person.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
