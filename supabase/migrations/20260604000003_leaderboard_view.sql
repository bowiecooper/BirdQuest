-- Rarity-weighted leaderboard + invite redemption.

-- group_leaderboard: for each (group, member), the SUM of species.points over the
-- DISTINCT confirmed species that member has logged. Members with no confirmed
-- sightings still appear (0 points) via the left join.
--
-- security_invoker = true makes the view run with the querying user's RLS, so the
-- group_members policy naturally restricts results to groups you belong to.
create view public.group_leaderboard
with (security_invoker = true) as
select
  gm.group_id,
  gm.user_id,
  coalesce(agg.species_count, 0) as species_count,
  coalesce(agg.total_points, 0) as total_points
from public.group_members gm
left join (
  select user_id,
         count(*)    as species_count,
         sum(points) as total_points
  from (
    -- one row per (user, distinct confirmed species) so duplicates of the same
    -- species don't score twice
    select distinct s.user_id, s.species_id, sp.points
    from public.sightings s
    join public.species sp on sp.id = s.species_id
    where s.status = 'confirmed'
  ) distinct_species
  group by user_id
) agg on agg.user_id = gm.user_id;

grant select on public.group_leaderboard to anon, authenticated;

-- redeem_invite: an authenticated user redeems an invite token and is added to
-- the group. SECURITY DEFINER so the invitee needs no direct read on
-- group_invites (their RLS only allows existing members to see invites).
-- Single-use: the invite is marked 'accepted' on success.
create or replace function public.redeem_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.group_invites;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to redeem an invite';
  end if;

  select * into inv
  from public.group_invites
  where token = invite_token
    and status = 'active'
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (inv.group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  update public.group_invites set status = 'accepted' where id = inv.id;
  return inv.group_id;
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;
