import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { redeemInvite } from '../lib/groups.ts';
import './Groups.css';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // guard React 18 StrictMode double-invoke
    redeemInvite(token)
      .then((slug) => navigate(`/groups/${slug}`, { replace: true }))
      .catch((e) => setError((e as Error).message));
  }, [token, navigate]);

  return (
    <div className="page">
      {error ? (
        <>
          <h1>Couldn't join</h1>
          <p className="identify-error">{error}</p>
          <button className="btn-secondary" onClick={() => navigate('/groups')}>
            Back to groups
          </button>
        </>
      ) : (
        <>
          <h1>Joining group…</h1>
          <p className="page-lead">Redeeming your invite.</p>
        </>
      )}
    </div>
  );
}
