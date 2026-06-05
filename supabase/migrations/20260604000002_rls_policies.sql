-- Row-Level Security: public, Letterboxd-style.
-- Anyone (including logged-out visitors) can read profiles, the species catalog,
-- and sightings (public life lists). Writes are restricted to the owning user.
-- Groups gate their own membership and invites.

-- Membership helpers. SECURITY DEFINER so they bypass RLS on group_members and
-- therefore do NOT recurse when referenced inside group_members' own policies
-- (the standard Supabase pattern for self-referential membership checks).
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

alter table public.profiles       enable row level security;
alter table public.species        enable row level security;
alter table public.sightings      enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.group_invites  enable row level security;

-- profiles: world-readable; you may only write your own row.
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);
create policy "Users insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);
create policy "Users update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- species: world-readable catalog; no client writes (seeded via service role).
create policy "Species are viewable by everyone"
  on public.species for select using (true);

-- sightings: world-readable; only the owner may create/edit/delete.
create policy "Sightings are viewable by everyone"
  on public.sightings for select using (true);
create policy "Users create their own sightings"
  on public.sightings for insert with check (auth.uid() = user_id);
create policy "Users update their own sightings"
  on public.sightings for update using (auth.uid() = user_id);
create policy "Users delete their own sightings"
  on public.sightings for delete using (auth.uid() = user_id);

-- groups: public groups are visible to all; private groups only to members/owner.
create policy "Public or member groups are viewable"
  on public.groups for select
  using (not is_private or owner_id = auth.uid() or public.is_group_member(id));
create policy "Users create groups they own"
  on public.groups for insert with check (auth.uid() = owner_id);
create policy "Owners update their groups"
  on public.groups for update using (auth.uid() = owner_id);
create policy "Owners delete their groups"
  on public.groups for delete using (auth.uid() = owner_id);

-- group_members: visible to fellow members; you may add yourself (e.g. via an
-- accepted invite) and admins may manage others; you may always leave.
create policy "Members view their group's membership"
  on public.group_members for select using (public.is_group_member(group_id));
create policy "Join self or admin adds members"
  on public.group_members for insert
  with check (user_id = auth.uid() or public.is_group_admin(group_id));
create policy "Admins update membership"
  on public.group_members for update using (public.is_group_admin(group_id));
create policy "Leave self or admin removes members"
  on public.group_members for delete
  using (user_id = auth.uid() or public.is_group_admin(group_id));

-- group_invites: managed by admins; invitees redeem via redeem_invite() (a
-- SECURITY DEFINER function in the next migration), so they need no direct read.
create policy "Members view group invites"
  on public.group_invites for select using (public.is_group_member(group_id));
create policy "Admins create invites"
  on public.group_invites for insert with check (public.is_group_admin(group_id));
create policy "Admins update invites"
  on public.group_invites for update using (public.is_group_admin(group_id));
create policy "Admins delete invites"
  on public.group_invites for delete using (public.is_group_admin(group_id));
