import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { listMyGroups, createGroup } from '../lib/groups.ts';
import type { MyGroup } from '../types/groups.ts';
import './Groups.css';

export default function GroupsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<MyGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    listMyGroups(user.id)
      .then(setGroups)
      .catch((e) => setError(e.message));
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const slug = await createGroup({ userId: user.id, name, isPrivate });
      navigate(`/groups/${slug}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <h1>Groups</h1>
      <p className="page-lead">
        Form a flock, invite friends with a link, and compete on a rarity-weighted
        leaderboard.
      </p>

      {error && <p className="identify-error">{error}</p>}

      <form className="group-create" onSubmit={handleCreate}>
        <input
          className="group-input"
          type="text"
          placeholder="New group name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="group-private-toggle">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          Private
        </label>
        <button className="btn-primary" type="submit" disabled={!name.trim() || creating}>
          {creating ? 'Creating…' : 'Create group'}
        </button>
      </form>

      {groups === null ? (
        <p className="page-lead">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="page-lead">
          You're not in any groups yet. Create one above, or open an invite link a
          friend shared with you.
        </p>
      ) : (
        <div className="card-grid">
          {groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.slug}`} className="action-card">
              <h3>{g.name}</h3>
              <p>
                <span className={`group-badge group-badge--${g.is_private ? 'private' : 'public'}`}>
                  {g.is_private ? 'Private' : 'Public'}
                </span>{' '}
                <span className={`group-badge group-badge--role`}>{g.myRole}</span>
              </p>
              <p>
                {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
