import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./Layout";
import Attendance from "./pages/Attendance";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import Kiosk from "./pages/Kiosk";
import Login from "./pages/Login";
import Machine from "./pages/Machine";
import MemberDetail from "./pages/MemberDetail";
import Members from "./pages/Members";
import Offers from "./pages/Offers";
import Payments from "./pages/Payments";
import Plans from "./pages/Plans";
import Settings from "./pages/Settings";
import Team from "./pages/Team";
import Workouts from "./pages/Workouts";
import MemberApp from "./member/MemberApp";

export default function App() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <p className="p-8 text-muted" role="status">Loading…</p>;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />} />
      </Routes>
    );
  }
  if (user.role === "member") {
    return (
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/*" element={<MemberApp />} />
      </Routes>
    );
  }
  const home = user.role === "trainer" ? "/members" : "/";
  const owner = user.role === "owner";
  return (
    <Routes>
      <Route path="/login" element={<Navigate to={home} replace />} />
      <Route path="/kiosk" element={user.role === "trainer" ? <Navigate to={home} /> : <Kiosk />} />
      <Route element={<Layout />}>
        <Route index element={user.role === "trainer" ? <Navigate to="/members" replace /> : <Dashboard />} />
        <Route path="members" element={<Members />} />
        <Route path="members/:id" element={<MemberDetail />} />
        <Route path="payments" element={<Payments />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="workouts" element={<Workouts />} />
        <Route path="password" element={<ChangePassword />} />
        {owner && <>
          <Route path="offers" element={<Offers />} />
          <Route path="plans" element={<Plans />} />
          <Route path="machine" element={<Machine />} />
          <Route path="team" element={<Team />} />
          <Route path="settings" element={<Settings />} />
        </>}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}
