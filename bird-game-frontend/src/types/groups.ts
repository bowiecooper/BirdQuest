// Shared types for the groups / leaderboard feature. Mirrors the Supabase schema
// in supabase/migrations/20260604000001_initial_schema.sql.

export type GroupRole = 'owner' | 'admin' | 'member';
export type InviteStatus = 'active' | 'revoked' | 'accepted';

export interface Group {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  is_private: boolean;
  created_at?: string;
}

/** A group as it appears in the "my groups" list, with my role + a member count. */
export interface MyGroup extends Group {
  myRole: GroupRole;
  memberCount: number;
}

interface MemberProfile {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface GroupMember {
  user_id: string;
  role: GroupRole;
  joined_at: string;
  profile: MemberProfile | null;
}

/** A row from the group_leaderboard view, after merging in the member's profile. */
export interface LeaderboardEntry {
  user_id: string;
  username: string;
  display_name: string | null;
  species_count: number;
  total_points: number;
}

export interface GroupInvite {
  id: string;
  group_id: string;
  token: string;
  status: InviteStatus;
  expires_at: string | null;
  created_at: string;
}
