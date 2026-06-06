import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute.tsx';
import { Layout } from './components/Layout.tsx';
import LoginPage from './pages/LoginPage.tsx';
import SignupPage from './pages/SignupPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import IdentifyPage from './pages/IdentifyPage.tsx';
import MePage from './pages/MePage.tsx';
import GroupsPage from './pages/GroupsPage.tsx';
import GroupDetailPage from './pages/GroupDetailPage.tsx';
import InvitePage from './pages/InvitePage.tsx';
import './App.css';

export default function App() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Protected app routes share the Layout (nav shell) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/identify" element={<IdentifyPage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:slug" element={<GroupDetailPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
