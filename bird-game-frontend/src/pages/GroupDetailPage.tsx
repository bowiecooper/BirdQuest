import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import {
  getGroupBySlug,
  getMembers,
  getLeaderboard,
  getActiveInvite,
  createInvite,
  regenerateInvite,
  revokeInvite,
  inviteUrl,
  leaveGroup,
  removeMember,
  updateMemberRole,
  deleteGroup,
} from '../lib/groups.ts';
import type {
  Group,
  GroupInvite,
  GroupMember,
  GroupRole,
  LeaderboardEntry,
} from '../types/groups.ts';
import './Groups.css';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function GroupDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [invite, setInvite] = useState<GroupInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const myRole: GroupRole | null =
    members.find((m) => m.user_id === user?.id)?.role ?? null;
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';

  const load = useCallback(async () => {
    if (!slug) return;
    setError(null);
    try {
      const g = await getGroupBySlug(slug);
      if (!g) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setGroup(g);
      const [mem, lb] = await Promise.all([getMembers(g.id), getLeaderboard(g.id)]);
      setMembers(mem);
      setLeaderboard(lb);
      // Only members can read invites; admins are the ones who act on them.
      const amMember = mem.some((m) => m.user_id === user?.id);
      if (amMember) setInvite(await getActiveInvite(g.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [slug, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!invite) return;
    await navigator.clipboard.writeText(inviteUrl(invite.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="page">
        <p className="page-lead">Loading…</p>
      </div>
    );
  }

  if (notFound || !group) {
    return (
      <div className="page">
        <h1>Group not found</h1>
        <p className="page-lead">
          This group doesn't exist, or it's private and you're not a member.
        </p>
        <button className="btn-secondary" onClick={() => navigate('/groups')}>
          Back to groups
        </button>
      </div>
    );
  }

  const pointsOf = new Map(leaderboard.map((e) => [e.user_id, e]));

  return (
    <div className="page">
      <div className="group-header">
        <h1>{group.name}</h1>
        <div>
          <span className={`group-badge group-badge--${group.is_private ? 'private' : 'public'}`}>
            {group.is_private ? 'Private' : 'Public'}
          </span>{' '}
          {myRole && <span className="group-badge group-badge--role">{myRole}</span>}
        </div>
      </div>

      {error && <p className="identify-error">{error}</p>}

      {/* Leaderboard */}
      <section className="group-section">
        <h2>Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="page-lead">No members to rank yet.</p>
        ) : (
          <table className="leaderboard">
            <thead>
              <tr>
                <th className="lb-rank">#</th>
                <th>Birder</th>
                <th className="lb-num">Species</th>
                <th className="lb-num">Points</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((e, i) => (
                <tr key={e.user_id} className={e.user_id === user?.id ? 'lb-me' : undefined}>
                  <td className="lb-rank">{MEDALS[i] ?? i + 1}</td>
                  <td>
                    {e.display_name || e.username}
                    {e.user_id === user?.id && <span className="lb-you"> (you)</span>}
                  </td>
                  <td className="lb-num">{e.species_count}</td>
                  <td className="lb-num lb-points">{e.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Invite (admins) */}
      {isAdmin && (
        <section className="group-section">
          <h2>Invite link</h2>
          {invite ? (
            <>
              <div className="invite-box">
                <code className="invite-url">{inviteUrl(invite.token)}</code>
                <button className="btn-secondary" onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="group-hint">
                Anyone signed in can join with this link. Regenerate to invalidate the
                old one.
              </p>
              <div className="group-actions">
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => run(() => regenerateInvite(group.id))}
                >
                  Regenerate
                </button>
                <button
                  className="link-danger"
                  disabled={busy}
                  onClick={() => run(() => revokeInvite(invite.id))}
                >
                  Revoke link
                </button>
              </div>
            </>
          ) : (
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => run(() => createInvite(group.id))}
            >
              Create invite link
            </button>
          )}
        </section>
      )}

      {/* Members */}
      <section className="group-section">
        <h2>Members ({members.length})</h2>
        <ul className="member-list">
          {members.map((m) => {
            const lb = pointsOf.get(m.user_id);
            const isSelf = m.user_id === user?.id;
            return (
              <li key={m.user_id} className="member-row">
                <div className="member-info">
                  <span className="member-name">
                    {m.profile?.display_name || m.profile?.username || 'Unknown'}
                    {isSelf && <span className="lb-you"> (you)</span>}
                  </span>
                  <span className="group-badge group-badge--role">{m.role}</span>
                  {lb && (
                    <span className="member-stat">
                      {lb.total_points} pts · {lb.species_count} species
                    </span>
                  )}
                </div>
                {/* Admin controls — never act on the owner row. */}
                {isAdmin && m.role !== 'owner' && !isSelf && (
                  <div className="member-actions">
                    {m.role === 'member' ? (
                      <button
                        className="link-button"
                        disabled={busy}
                        onClick={() => run(() => updateMemberRole(group.id, m.user_id, 'admin'))}
                      >
                        Make admin
                      </button>
                    ) : (
                      <button
                        className="link-button"
                        disabled={busy}
                        onClick={() => run(() => updateMemberRole(group.id, m.user_id, 'member'))}
                      >
                        Make member
                      </button>
                    )}
                    <button
                      className="link-danger"
                      disabled={busy}
                      onClick={() => run(() => removeMember(group.id, m.user_id))}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Footer actions */}
      <section className="group-section group-footer">
        {myRole && !isOwner && (
          <button
            className="link-danger"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await leaveGroup(group.id, user!.id);
                navigate('/groups');
              })
            }
          >
            Leave group
          </button>
        )}
        {isOwner && (
          <button
            className="link-danger"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Delete "${group.name}"? This cannot be undone.`)) return;
              void run(async () => {
                await deleteGroup(group.id);
                navigate('/groups');
              });
            }}
          >
            Delete group
          </button>
        )}
      </section>
    </div>
  );
}
