-- Reusable invite links.
--
-- Migration 0003 defined redeem_invite() to mark the token 'accepted' on success,
-- which made every invite single-use (one token = one join). The product wants
-- Discord-style reusable links: one link a group admin shares, that many people can
-- redeem. Recreate the function WITHOUT the 'accepted' update so a link stays
-- 'active' and can be redeemed repeatedly. Reuse is still bounded by:
--   * status = 'active'   — admins set 'revoked' to kill a link (or regenerate)
--   * expires_at          — optional time limit
-- The on-conflict no-op keeps re-redeeming (already a member) harmless.

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

  -- NOTE: intentionally NO `update ... set status='accepted'` here — the link is
  -- reusable. Admins revoke by setting status='revoked' (see regenerateInvite).
  return inv.group_id;
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;
