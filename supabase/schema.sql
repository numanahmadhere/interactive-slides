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

-- ---------------------------------------------------------------------------------
-- Limits. Everything is free: there are no plans, so every account gets the same caps.
-- Safe to run again. (Older installs may still hold unused subscription tables from
-- when there were paid plans; nothing reads them any more and they can be dropped.)
-- ---------------------------------------------------------------------------------

create or replace function public.plan_of(uid uuid) returns text
language sql immutable as $$ select 'free'::text $$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;

create or replace function public.my_plan() returns text
language sql stable security definer set search_path = public as $$
  select public.plan_of(auth.uid())
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- How many decks one account may keep online. Keep the number the same as
-- src/billing/plans.js (a test checks they match).
create or replace function public.deck_limit(p text) returns int
language sql immutable as $$ select 1000 $$;

-- Saving a new deck online past the limit is refused. Opening, editing and
-- deleting existing decks always works.
create or replace function public.decks_enforce_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  have int;
  allowed int;
begin
  select count(*) into have from public.decks where owner = new.owner;
  allowed := public.deck_limit(public.plan_of(new.owner));
  if have >= allowed then
    raise exception 'deck_limit' using errcode = 'P0001', detail = allowed::text;
  end if;
  return new;
end $$;

drop trigger if exists decks_enforce_limit on public.decks;
create trigger decks_enforce_limit before insert on public.decks
  for each row execute function public.decks_enforce_limit();


-- Self-paced courses: someone who finishes a shared deck can leave their name, and the deck's owner sees the list.
-- Visitors can only add a row through record_completion() for a deck that is shared right now; they cannot read anything back.
create table if not exists public.completions (
  id           bigint generated always as identity primary key,
  deck_id      uuid not null references public.decks (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  completed_at timestamptz not null default now()
);
create index if not exists completions_deck_idx on public.completions (deck_id, completed_at desc);

alter table public.completions enable row level security;
drop policy if exists "completions: owner reads"   on public.completions;
drop policy if exists "completions: owner deletes" on public.completions;
create policy "completions: owner reads"   on public.completions for select to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.owner = auth.uid()));
create policy "completions: owner deletes" on public.completions for delete to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.owner = auth.uid()));
revoke all on public.completions from anon;
revoke insert, update on public.completions from authenticated;

create or replace function public.record_completion(t text, who text) returns boolean
language plpgsql security definer set search_path = public as $$
declare d uuid; n text := left(btrim(regexp_replace(coalesce(who, ''), '[[:cntrl:]]', ' ', 'g')), 80);
begin
  if t is null or char_length(t) < 22 or n = '' then return false; end if;
  select id into d from public.decks where share_token = t;
  if d is null then return false; end if;
  if (select count(*) from public.completions where deck_id = d) >= 5000 then return false; end if; -- a ceiling, not a feature
  insert into public.completions (deck_id, name) values (d, n);
  return true;
end $$;
revoke all on function public.record_completion(text, text) from public;
grant execute on function public.record_completion(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------------
-- Team workspaces: a shared set of decks, an invite link, a shared brand kit, and comments on slides.
-- Only a Pro or Advanced plan can create a team (checked here, in the database). People join with a link and
-- do not need a plan of their own. Safe to run again.
-- ---------------------------------------------------------------------------------

create table if not exists public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  owner      uuid not null references auth.users (id) on delete cascade,
  brand      jsonb not null default '{}' check (pg_column_size(brand) <= 400000),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id   uuid not null references public.teams (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  email     text not null default '',
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on public.team_members (user_id);

create table if not exists public.team_invites (
  token      text primary key check (char_length(token) >= 22),
  team_id    uuid not null references public.teams (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days'
);

alter table public.decks add column if not exists team_id uuid references public.teams (id) on delete set null;
create index if not exists decks_team_idx on public.decks (team_id) where team_id is not null;

-- How many people a team may hold. Keep in step with src/billing/plans.js (a test checks).
create or replace function public.team_seats(p text) returns int
language sql immutable as $$ select 25 $$;

create or replace function public.is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = t and user_id = auth.uid())
$$;
revoke all on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated;

create or replace function public.can_access_deck(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.decks k where k.id = d and (k.owner = auth.uid() or (k.team_id is not null and public.is_team_member(k.team_id))))
$$;
revoke all on function public.can_access_deck(uuid) from public, anon;
grant execute on function public.can_access_deck(uuid) to authenticated;

-- Team members work on the team's decks; only the person who made a deck can delete it, share it by link, or move it.
drop policy if exists "decks: owner reads"   on public.decks;
drop policy if exists "decks: owner updates" on public.decks;
create policy "decks: owner reads"   on public.decks for select to authenticated
  using (owner = auth.uid() or (team_id is not null and public.is_team_member(team_id)));
create policy "decks: owner updates" on public.decks for update to authenticated
  using (owner = auth.uid() or (team_id is not null and public.is_team_member(team_id)))
  with check (owner = auth.uid() or (team_id is not null and public.is_team_member(team_id)));

create or replace function public.decks_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  new.owner = old.owner;            -- a deck can never be handed to someone else
  if auth.uid() is distinct from old.owner and coalesce(current_setting('is.team_admin', true), '') <> '1' then   -- a teammate edits the content, nothing about who can see it
    new.team_id = old.team_id;
    new.share_token = old.share_token;
  end if;
  return new;
end $$;

-- A deck can only be put in a team its owner belongs to.
create or replace function public.decks_check_team() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.team_id is not null and (tg_op = 'INSERT' or new.team_id is distinct from old.team_id)
     and not exists (select 1 from public.team_members where team_id = new.team_id and user_id = new.owner) then
    raise exception 'not_in_team' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists decks_check_team on public.decks;
create trigger decks_check_team before insert or update on public.decks
  for each row execute function public.decks_check_team();

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
drop policy if exists "teams: members read"   on public.teams;
drop policy if exists "teams: owner updates"  on public.teams;
drop policy if exists "teams: owner deletes"  on public.teams;
drop policy if exists "team_members: members read" on public.team_members;
create policy "teams: members read"  on public.teams for select to authenticated using (public.is_team_member(id));
create policy "teams: owner updates" on public.teams for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "teams: owner deletes" on public.teams for delete to authenticated using (owner = auth.uid());
create policy "team_members: members read" on public.team_members for select to authenticated using (public.is_team_member(team_id));
revoke all on public.teams, public.team_members, public.team_invites from anon;
revoke insert on public.teams from authenticated;
revoke insert, update on public.team_members from authenticated, anon;
revoke all on public.team_invites from authenticated;
-- the owner may change the name and brand kit, nothing else
revoke update on public.teams from authenticated;
grant update (name, brand) on public.teams to authenticated;

create or replace function public.create_team(n text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; who uuid := auth.uid(); nm text := left(btrim(coalesce(n, '')), 80);
begin
  if who is null then raise exception 'not signed in'; end if;
  if public.team_seats(public.plan_of(who)) = 0 then raise exception 'team_needs_plan' using errcode = 'P0001'; end if;
  if nm = '' then raise exception 'team_needs_name' using errcode = 'P0001'; end if;
  if (select count(*) from public.teams where owner = who) >= 3 then raise exception 'team_limit' using errcode = 'P0001'; end if;
  insert into public.teams (name, owner) values (nm, who) returning id into t;
  insert into public.team_members (team_id, user_id, email, role) values (t, who, coalesce((select email from auth.users where id = who), ''), 'owner');
  return t;
end $$;
revoke all on function public.create_team(text) from public, anon;
grant execute on function public.create_team(text) to authenticated;

create or replace function public.create_team_invite(t uuid) returns text
language plpgsql security definer set search_path = public as $$
declare tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); o uuid;
begin
  select owner into o from public.teams where id = t;
  if o is distinct from auth.uid() then raise exception 'not_team_owner' using errcode = 'P0001'; end if;
  if public.team_seats(public.plan_of(o)) = 0 then raise exception 'team_needs_plan' using errcode = 'P0001'; end if;
  delete from public.team_invites where team_id = t and expires_at < now();
  insert into public.team_invites (token, team_id) values (tok, t);
  return tok;
end $$;
revoke all on function public.create_team_invite(uuid) from public, anon;
grant execute on function public.create_team_invite(uuid) to authenticated;

-- Joining uses up the invite. Returns the team's id.
create or replace function public.accept_team_invite(tok text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.team_invites%rowtype; o uuid; who uuid := auth.uid();
begin
  if who is null then raise exception 'not signed in'; end if;
  select * into inv from public.team_invites where token = tok and tok is not null and expires_at > now();
  if not found then raise exception 'invite_invalid' using errcode = 'P0001'; end if;
  select owner into o from public.teams where id = inv.team_id;
  if exists (select 1 from public.team_members where team_id = inv.team_id and user_id = who) then
    delete from public.team_invites where token = tok;
    return inv.team_id;
  end if;
  if (select count(*) from public.team_members where team_id = inv.team_id) >= public.team_seats(public.plan_of(o)) then
    raise exception 'team_full' using errcode = 'P0001';
  end if;
  insert into public.team_members (team_id, user_id, email) values (inv.team_id, who, coalesce((select email from auth.users where id = who), ''));
  delete from public.team_invites where token = tok;
  return inv.team_id;
end $$;
revoke all on function public.accept_team_invite(text) from public, anon;
grant execute on function public.accept_team_invite(text) to authenticated;

-- The owner removes anyone; anyone else can only remove themselves (leave). The owner cannot leave: delete the team instead.
create or replace function public.remove_team_member(t uuid, u uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare o uuid; who uuid := auth.uid();
begin
  select owner into o from public.teams where id = t;
  if o is null or u = o or (who is distinct from o and who is distinct from u) then return false; end if;
  delete from public.team_members where team_id = t and user_id = u;
  perform set_config('is.team_admin', '1', true);
  update public.decks set team_id = null where team_id = t and owner = u;   -- their decks go back to being theirs alone
  return true;
end $$;
revoke all on function public.remove_team_member(uuid, uuid) from public, anon;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;

-- Comments on a slide of a team's deck.
create table if not exists public.deck_comments (
  id          bigint generated always as identity primary key,
  deck_id     uuid not null references public.decks (id) on delete cascade,
  slide_id    text not null check (char_length(slide_id) <= 64),
  author      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '' check (char_length(author_name) <= 80),
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists deck_comments_deck_idx on public.deck_comments (deck_id, created_at);

alter table public.deck_comments enable row level security;
drop policy if exists "comments: readers read"   on public.deck_comments;
drop policy if exists "comments: readers write"  on public.deck_comments;
drop policy if exists "comments: readers update" on public.deck_comments;
drop policy if exists "comments: author or owner deletes" on public.deck_comments;
create policy "comments: readers read"   on public.deck_comments for select to authenticated using (public.can_access_deck(deck_id));
create policy "comments: readers write"  on public.deck_comments for insert to authenticated with check (author = auth.uid() and public.can_access_deck(deck_id));
create policy "comments: readers update" on public.deck_comments for update to authenticated using (public.can_access_deck(deck_id)) with check (public.can_access_deck(deck_id));
create policy "comments: author or owner deletes" on public.deck_comments for delete to authenticated
  using (author = auth.uid() or exists (select 1 from public.decks k where k.id = deck_id and k.owner = auth.uid()));
revoke all on public.deck_comments from anon;

-- Anyone who can see a comment can mark it done; only its author can change what it says. A deck holds at most 2000.
create or replace function public.comments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.deck_comments where deck_id = new.deck_id) >= 2000 then raise exception 'comment_limit' using errcode = 'P0001'; end if;
    return new;
  end if;
  new.deck_id = old.deck_id; new.slide_id = old.slide_id; new.author = old.author; new.created_at = old.created_at;
  if auth.uid() is distinct from old.author then new.body = old.body; new.author_name = old.author_name; end if;
  return new;
end $$;
drop trigger if exists comments_guard on public.deck_comments;
create trigger comments_guard before insert or update on public.deck_comments
  for each row execute function public.comments_guard();

-- ---------------------------------------------------------------------------------
-- Claude connector. Safe to run again.
--
-- One secret link per person lets Claude build decks in their account (netlify/functions/mcp.mjs).
-- Only a hash of the secret is stored here, so a database leak does not reveal working links. The server
-- reads the table with the service role key; people manage their own link through the three functions below.
-- ---------------------------------------------------------------------------------

create table if not exists public.connector_keys (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.connector_keys enable row level security;
revoke all on public.connector_keys from anon, authenticated;

create or replace function public.set_connector_key(h text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if h is null or h !~ '^[0-9a-f]{64}$' then raise exception 'bad key'; end if;
  insert into public.connector_keys (user_id, token_hash) values (auth.uid(), h)
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
end $$;
revoke all on function public.set_connector_key(text) from public, anon;
grant execute on function public.set_connector_key(text) to authenticated;

create or replace function public.remove_connector_key() returns void
language sql security definer set search_path = public as $$
  delete from public.connector_keys where user_id = auth.uid()
$$;
revoke all on function public.remove_connector_key() from public, anon;
grant execute on function public.remove_connector_key() to authenticated;

-- Whether a link exists and when it was made and last used. Never the hash.
create or replace function public.connector_key_info() returns table (created_at timestamptz, last_used_at timestamptz)
language sql stable security definer set search_path = public as $$
  select k.created_at, k.last_used_at from public.connector_keys k where k.user_id = auth.uid()
$$;
revoke all on function public.connector_key_info() from public, anon;
grant execute on function public.connector_key_info() to authenticated;
