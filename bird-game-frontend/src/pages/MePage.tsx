import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { supabase } from '../lib/supabase.ts';
import './MePage.css';

interface SightingRow {
  id: string;
  species_id: number | null;
  photo_url: string | null;
  observed_at: string;
  model_confidence: number | null;
  notes: string | null;
  species: {
    common_name: string;
    scientific_name: string | null;
    rarity_tier: string | null;
  } | null;
}

const SELECT =
  'id, species_id, photo_url, observed_at, model_confidence, notes, ' +
  'species:species_id(common_name, scientific_name, rarity_tier)';

export default function MePage() {
  const { user } = useAuth();
  const [sightings, setSightings] = useState<SightingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('sightings')
      .select(SELECT)
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .order('observed_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setSightings((data ?? []) as unknown as SightingRow[]);
      });
  }, [user]);

  if (error) {
    return (
      <div className="page">
        <h1>My life list</h1>
        <p className="identify-error">{error}</p>
      </div>
    );
  }

  if (sightings === null) {
    return (
      <div className="page">
        <h1>My life list</h1>
        <p className="page-lead">Loading…</p>
      </div>
    );
  }

  const speciesCount = new Set(sightings.map((s) => s.species_id)).size;

  return (
    <div className="page">
      <h1>My life list</h1>
      {sightings.length === 0 ? (
        <>
          <p className="page-lead">No sightings yet.</p>
          <Link to="/identify" className="btn-primary">
            Identify your first bird
          </Link>
        </>
      ) : (
        <>
          <p className="page-lead">
            {speciesCount} {speciesCount === 1 ? 'species' : 'species'} ·{' '}
            {sightings.length} {sightings.length === 1 ? 'sighting' : 'sightings'}
          </p>
          <ul className="lifelist-grid">
            {sightings.map((s) => (
              <li key={s.id} className="lifelist-card">
                {s.photo_url ? (
                  <img
                    className="lifelist-photo"
                    src={s.photo_url}
                    alt={s.species?.common_name ?? 'Bird sighting'}
                    loading="lazy"
                  />
                ) : (
                  <div className="lifelist-photo lifelist-photo--empty">🐦</div>
                )}
                <div className="lifelist-body">
                  <h3>{s.species?.common_name ?? 'Unknown species'}</h3>
                  {s.species?.scientific_name && (
                    <p className="lifelist-sci">{s.species.scientific_name}</p>
                  )}
                  <p className="lifelist-meta">
                    {new Date(s.observed_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {s.model_confidence != null && (
                      <> · {Math.round(s.model_confidence * 100)}% confident</>
                    )}
                  </p>
                  {s.notes && <p className="lifelist-notes">{s.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
