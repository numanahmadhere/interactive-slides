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
-- Plans and billing (Paddle). Safe to run again.
--
-- subscriptions has one row per paying person, written only by the Paddle webhook
-- (netlify/functions/paddle-webhook.mjs, using the service role key). Signed-in people
-- can read their own row to see their plan; nobody can write it from the browser.
-- ---------------------------------------------------------------------------------

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  plan                   text not null check (plan in ('free', 'starter', 'pro', 'advanced')),
  status                 text not null,                       -- Paddle: active, trialing, past_due, paused, canceled
  billing_interval       text check (billing_interval in ('month', 'year')),
  paddle_customer_id     text,
  paddle_subscription_id text unique,
  trial_ends_at          timestamptz,
  ends_at                timestamptz,                         -- when access stops (a scheduled cancel, or period end)
  update_payment_url     text,
  cancel_url             text,
  event_at               timestamptz not null default now(),  -- time of the newest Paddle event applied
  updated_at             timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions: owner reads" on public.subscriptions;
create policy "subscriptions: owner reads" on public.subscriptions for select to authenticated using (user_id = auth.uid());
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

-- Webhook deliveries already handled, so a retried delivery changes nothing.
create table if not exists public.paddle_events (
  event_id    text primary key,
  event_type  text not null,
  received_at timestamptz not null default now()
);
alter table public.paddle_events enable row level security;
revoke all on public.paddle_events from anon, authenticated;

-- The plan someone is on right now, worked out in the database.
create or replace function public.plan_of(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.plan from public.subscriptions s
      where s.user_id = uid
        and s.status in ('active', 'trialing', 'past_due')
        and (s.ends_at is null or s.ends_at > now())),
    'free')
$$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;

create or replace function public.my_plan() returns text
language sql stable security definer set search_path = public as $$
  select public.plan_of(auth.uid())
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- How many decks each plan may keep online. Keep these numbers the same as
-- src/billing/plans.js (a test checks they match).
create or replace function public.deck_limit(p text) returns int
language sql immutable as $$
  select case p when 'starter' then 25 when 'pro' then 100 when 'advanced' then 1000 else 3 end
$$;

-- Saving a new deck online past the plan's limit is refused. Opening, editing and
-- deleting existing decks always works, so downgrading never locks anyone out of their work.
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

-- Applied by the Paddle webhook, and only by it. One transaction records the delivery
-- (so a retry does nothing), checks the person exists, ignores an event older than the
-- one already applied, and never lets a second subscription replace one that is
-- paying. Returns: applied | duplicate | stale | unknown_user | conflict.
create or replace function public.paddle_apply(p_event_id text, p_event_type text, p_occurred timestamptz, rec jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := (rec->>'user_id')::uuid;
  n int;
  current_row public.subscriptions%rowtype;
begin
  insert into public.paddle_events (event_id, event_type) values (p_event_id, p_event_type) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return 'duplicate'; end if;

  if not exists (select 1 from auth.users where id = uid) then return 'unknown_user'; end if;

  select * into current_row from public.subscriptions where user_id = uid;
  if found
     and current_row.paddle_subscription_id is distinct from rec->>'paddle_subscription_id'
     and current_row.status in ('active', 'trialing', 'past_due')
     and (current_row.ends_at is null or current_row.ends_at > now()) then
    return 'conflict';   -- someone else's payment must not replace a paying subscription
  end if;

  begin
    insert into public.subscriptions as s
      (user_id, plan, status, billing_interval, paddle_customer_id, paddle_subscription_id, trial_ends_at, ends_at, update_payment_url, cancel_url, event_at, updated_at, paddle_env)
    values
      (uid, rec->>'plan', rec->>'status', nullif(rec->>'billing_interval', ''), rec->>'paddle_customer_id', rec->>'paddle_subscription_id',
       nullif(rec->>'trial_ends_at', '')::timestamptz, nullif(rec->>'ends_at', '')::timestamptz,
       nullif(rec->>'update_payment_url', ''), nullif(rec->>'cancel_url', ''), p_occurred, now(), nullif(rec->>'paddle_env', ''))
    on conflict (user_id) do update set
      plan = excluded.plan, status = excluded.status, billing_interval = excluded.billing_interval,
      paddle_customer_id = excluded.paddle_customer_id, paddle_subscription_id = excluded.paddle_subscription_id,
      trial_ends_at = excluded.trial_ends_at, ends_at = excluded.ends_at,
      update_payment_url = excluded.update_payment_url, cancel_url = excluded.cancel_url,
      event_at = excluded.event_at, updated_at = now(), paddle_env = excluded.paddle_env
      where s.event_at <= excluded.event_at;
    get diagnostics n = row_count;
  exception when unique_violation then
    return 'conflict';   -- that Paddle subscription already belongs to another account
  end;
  return case when n = 0 then 'stale' else 'applied' end;
end $$;
revoke all on function public.paddle_apply(text, text, timestamptz, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------
-- Customers and payments mirrored from Paddle, and which Paddle account (live or sandbox) each
-- row came from. Written only by the webhook. Safe to run again.
-- ---------------------------------------------------------------------------------

alter table public.subscriptions add column if not exists paddle_env text check (paddle_env in ('live', 'sandbox'));
alter table public.subscriptions add column if not exists last_paid_at timestamptz;

create table if not exists public.paddle_customers (
  customer_id text primary key,
  email       text not null,
  paddle_env  text not null check (paddle_env in ('live', 'sandbox')),
  event_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.paddle_customers enable row level security;
revoke all on public.paddle_customers from anon, authenticated;

-- A customer event: upsert by Paddle's id, ignoring a delivery older than the one already applied.
create or replace function public.paddle_apply_customer(p_event_id text, p_event_type text, p_occurred timestamptz, rec jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.paddle_events (event_id, event_type) values (p_event_id, p_event_type) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return 'duplicate'; end if;
  insert into public.paddle_customers as c (customer_id, email, paddle_env, event_at, updated_at)
  values (rec->>'customer_id', coalesce(rec->>'email', ''), rec->>'paddle_env', p_occurred, now())
  on conflict (customer_id) do update set email = excluded.email, paddle_env = excluded.paddle_env, event_at = excluded.event_at, updated_at = now()
    where c.event_at <= excluded.event_at;
  get diagnostics n = row_count;
  return case when n = 0 then 'stale' else 'applied' end;
end $$;
revoke all on function public.paddle_apply_customer(text, text, timestamptz, jsonb) from public, anon, authenticated;

-- A completed payment: note when a subscription was last paid. If we have not seen the subscription yet
-- nothing is stored and the later subscription event tells the story.
create or replace function public.paddle_apply_transaction(p_event_id text, p_event_type text, p_occurred timestamptz, rec jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.paddle_events (event_id, event_type) values (p_event_id, p_event_type) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return 'duplicate'; end if;
  update public.subscriptions set last_paid_at = greatest(coalesce(last_paid_at, p_occurred), p_occurred)
    where paddle_subscription_id = rec->>'paddle_subscription_id';
  get diagnostics n = row_count;
  return case when n = 0 then 'no_subscription_yet' else 'applied' end;
end $$;
revoke all on function public.paddle_apply_transaction(text, text, timestamptz, jsonb) from public, anon, authenticated;

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
