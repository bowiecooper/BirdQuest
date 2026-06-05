import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import './Layout.css';

export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="app-nav">
        <NavLink to="/" className="app-brand">
          🐦 BirdQuest
        </NavLink>
        <nav className="app-links">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/identify">Identify</NavLink>
          <NavLink to="/me">My Life List</NavLink>
        </nav>
        <div className="app-account">
          <span className="app-email">{user?.email}</span>
          <button onClick={handleSignOut} className="link-button">
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
