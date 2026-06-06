import { supabase } from './supabase.ts';
import type {
  Group,
  GroupMember,
  GroupRole,
  GroupInvite,
  LeaderboardEntry,
  MyGroup,
} from '../types/groups.ts';

/**
 * Build a URL-safe slug from a group name plus a short random suffix. The suffix
 * avoids collisions on the `groups.slug` unique constraint without a round-trip
 * to check availability.
 */
export function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'group';
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${base}-${suffix}`;
}

/** Groups the user belongs to, each with my role and a member count. */
export async function listMyGroups(userId: string): Promise<MyGroup[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select(
      'role, group:group_id(id, name, slug, owner_id, is_private, members:group_members(count))',
    )
    .eq('user_id', userId);
  if (error) throw error;

  type Row = {
    role: GroupRole;
    group: (Group & { members: { count: number }[] }) | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.group)
    .map((r) => {
      const g = r.group!;
      return {
        id: g.id,
        name: g.name,
        slug: g.slug,
        owner_id: g.owner_id,
        is_private: g.is_private,
        myRole: r.role,
        memberCount: g.members?.[0]?.count ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Create a group owned by the user and add them as the owner member. The schema
 * does not auto-add the owner; the group_members insert policy permits inserting a
 * row where user_id = auth.uid(). Returns the new slug for navigation.
 */
export async function createGroup({
  userId,
  name,
  isPrivate,
}: {
  userId: string;
  name: string;
  isPrivate: boolean;
}): Promise<string> {
  const slug = slugify(name);
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({ name: name.trim(), slug, owner_id: userId, is_private: isPrivate })
    .select('id, slug')
    .single();
  if (groupError) throw groupError;

  const { error: memberError } = await supabase
    .from('group_members')
    .insert({ group_id: group.id, user_id: userId, role: 'owner' });
  if (memberError) throw memberError;

  return group.slug;
}

/** A group by slug, or null if it doesn't exist / RLS hides it (private, not a member). */
export async function getGroupBySlug(slug: string): Promise<Group | null> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, slug, owner_id, is_private, created_at')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data as Group | null;
}

const ROLE_ORDER: Record<GroupRole, number> = { owner: 0, admin: 1, member: 2 };

/** Members of a group with their profiles, ordered owner → admin → member, then join date. */
export async function getMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, joined_at, profile:user_id(username, display_name, avatar_url)')
    .eq('group_id', groupId);
  if (error) throw error;

  return ((data ?? []) as unknown as GroupMember[]).sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      a.joined_at.localeCompare(b.joined_at),
  );
}

/**
 * Leaderboard rows merged with member profiles, sorted by points desc (ties broken
 * by species_count). The group_leaderboard view has no profile FK to embed across,
 * so we join in memory against getMembers().
 */
export async function getLeaderboard(groupId: string): Promise<LeaderboardEntry[]> {
  const [{ data: rows, error }, members] = await Promise.all([
    supabase
      .from('group_leaderboard')
      .select('user_id, species_count, total_points')
      .eq('group_id', groupId),
    getMembers(groupId),
  ]);
  if (error) throw error;

  const profileOf = new Map(members.map((m) => [m.user_id, m.profile]));

  return ((rows ?? []) as { user_id: string; species_count: number; total_points: number }[])
    .map((r) => {
      const p = profileOf.get(r.user_id);
      return {
        user_id: r.user_id,
        username: p?.username ?? 'unknown',
        display_name: p?.display_name ?? null,
        species_count: r.species_count,
        total_points: r.total_points,
      };
    })
    .sort(
      (a, b) => b.total_points - a.total_points || b.species_count - a.species_count,
    );
}

/** The current reusable invite link for a group, or null if none is active. */
export async function getActiveInvite(groupId: string): Promise<GroupInvite | null> {
  const { data, error } = await supabase
    .from('group_invites')
    .select('id, group_id, token, status, expires_at, created_at')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as GroupInvite | null;
}

/** Create a new active invite for a group (admin only). */
export async function createInvite(groupId: string): Promise<GroupInvite> {
  const token = crypto.randomUUID().replace(/-/g, '');
  const { data, error } = await supabase
    .from('group_invites')
    .insert({ group_id: groupId, token, status: 'active' })
    .select('id, group_id, token, status, expires_at, created_at')
    .single();
  if (error) throw error;
  return data as GroupInvite;
}

/** Revoke all current active invites for a group and mint a fresh one. */
export async function regenerateInvite(groupId: string): Promise<GroupInvite> {
  const { error } = await supabase
    .from('group_invites')
    .update({ status: 'revoked' })
    .eq('group_id', groupId)
    .eq('status', 'active');
  if (error) throw error;
  return createInvite(groupId);
}

/** Revoke a single invite by id. */
export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('group_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId);
  if (error) throw error;
}

/** Redeem an invite token (must be signed in). Returns the joined group's slug. */
export async function redeemInvite(token: string): Promise<string> {
  const { data: groupId, error } = await supabase.rpc('redeem_invite', {
    invite_token: token,
  });
  if (error) throw error;

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('slug')
    .eq('id', groupId as string)
    .single();
  if (groupError) throw groupError;
  return group.slug;
}

/** Build the shareable invite URL for a token. */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function updateMemberRole(
  groupId: string,
  userId: string,
  role: GroupRole,
): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .update({ role })
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Delete a group (owner only); cascades to members and invites. */
export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', groupId);
  if (error) throw error;
}
