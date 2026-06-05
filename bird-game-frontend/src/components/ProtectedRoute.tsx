import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';

/**
 * Gate for authenticated routes. While the initial session resolves we show a
 * lightweight loading state; unauthenticated users are redirected to /login
 * (remembering where they were headed).
 */
export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="route-loading">Loading…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
