-- BirdQuest initial schema.
-- "Letterboxd for birding": a Species catalog + per-user Sightings, plus groups
-- and a rarity-weighted leaderboard. Auth is handled by Supabase (auth.users);
-- public.profiles mirrors it for app-facing data.

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Rarity tiers and their point values (rarer sightings score more).
-- rarity_tier is intentionally nullable: a species may be uncategorized.
create type rarity_tier as enum ('Common', 'Uncommon', 'Rare', 'Vagrant');
create type sighting_status as enum ('pending', 'confirmed', 'rejected');
create type group_role as enum ('owner', 'admin', 'member');
create type invite_status as enum ('active', 'revoked', 'accepted');

-- ---------------------------------------------------------------------------
-- profiles: app-facing user data, 1:1 with auth.users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text unique not null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- species: the catalog. class_index maps to the model's output classes and is
-- the join key for predictions coming back from POST /predict.
-- ---------------------------------------------------------------------------
create table public.species (
  id              bigint generated always as identity primary key,
  class_index     integer unique not null,
  common_name     text not null,
  scientific_name text,
  rarity_tier     rarity_tier,            -- nullable; seeded as 'Common' for now
  points          integer not null default 1
);

-- ---------------------------------------------------------------------------
-- sightings: a user's observation. model_top5 preserves the full prediction so
-- user-confirmed sightings double as labeled data for future retraining.
-- ---------------------------------------------------------------------------
create table public.sightings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  species_id       bigint references public.species (id),  -- null until confirmed
  photo_url        text,
  observed_at      timestamptz not null default now(),
  lat              double precision,
  lng              double precision,
  notes            text,
  model_confidence real,
  model_top5       jsonb,
  status           sighting_status not null default 'pending',
  created_at       timestamptz not null default now()
);

create index sightings_user_idx on public.sightings (user_id);
create index sightings_species_idx on public.sightings (species_id);

-- ---------------------------------------------------------------------------
-- groups + membership + link-based invites.
-- ---------------------------------------------------------------------------
create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  is_private boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

create table public.group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  token      text unique not null,
  status     invite_status not null default 'active',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index group_invites_group_idx on public.group_invites (group_id);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up. Reads optional
-- username/display_name from the signup metadata, falling back to the email
-- local-part. SECURITY DEFINER so it can write public.profiles from the auth
-- schema trigger; empty search_path is the Supabase-recommended hardening.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'display_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
