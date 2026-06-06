import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { supabase } from '../lib/supabase.ts';

interface Profile {
  username: string;
  display_name: string | null;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setProfile(data));
  }, [user]);

  const name = profile?.display_name || profile?.username || 'birder';

  return (
    <div className="page">
      <h1>Welcome, {name} 👋</h1>
      <p className="page-lead">
        Identify a bird from a photo and add it to your life list.
      </p>

      <div className="card-grid">
        <Link to="/identify" className="action-card">
          <h3>📸 Identify a bird</h3>
          <p>Upload a photo and let the model name the species.</p>
        </Link>
        <Link to="/me" className="action-card">
          <h3>📖 My life list</h3>
          <p>Browse the species you've confirmed so far.</p>
        </Link>
        <Link to="/groups" className="action-card">
          <h3>🪶 Groups</h3>
          <p>Compete with friends on a rarity-weighted leaderboard.</p>
        </Link>
      </div>
    </div>
  );
}
