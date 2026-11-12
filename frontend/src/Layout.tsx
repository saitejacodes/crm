import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api, type Role } from "./api";
import { useAuth } from "./auth";
import { useApi } from "./hooks";
import { PlateMark } from "./ui";

const NAV: { to: string; label: string; roles: Role[] }[] = [
  { to: "/", label: "Today", roles: ["owner", "staff"] },
  { to: "/members", label: "Members", roles: ["owner", "staff", "trainer"] },
  { to: "/payments", label: "Payments", roles: ["owner", "staff"] },
  { to: "/attendance", label: "Attendance", roles: ["owner", "staff", "trainer"] },
  { to: "/workouts", label: "Workout plans", roles: ["owner", "staff", "trainer"] },
  { to: "/offers", label: "Offers", roles: ["owner"] },
  { to: "/plans", label: "Plans and prices", roles: ["owner"] },
  { to: "/machine", label: "Fingerprint machine", roles: ["owner"] },
  { to: "/team", label: "Staff and trainers", roles: ["owner"] },
  { to: "/settings", label: "Settings", roles: ["owner"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { data: gym } = useApi<{ gym_name: string }>("/api/public/gym");
  const [pending, setPending] = useState(0);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (user?.role === "trainer") return;
    const load = () => api<{ id: number }[]>("/api/payments?status=pending&limit=100").then((r) => setPending(r.length)).catch(() => {});
    load();
    const t = window.setInterval(load, 60000);
    return () => window.clearInterval(t);
  }, [user?.role, loc.pathname]);
  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav aria-label="Main" className="bg-rubber text-[#e6e8e5] md:sticky md:top-0 md:flex md:h-screen md:w-[240px] md:flex-none md:flex-col md:gap-7 md:px-4 md:py-6">
        <div className="flex items-center gap-3 px-4 py-3 md:px-1.5 md:py-0">
          <PlateMark />
          <div className="min-w-0 flex-1">
            <div className="h-display truncate text-[22px] font-bold leading-none">{gym?.gym_name ?? "Gym"}</div>
            <div className="mt-[3px] text-[13px] text-[#a3abaf]">Gym Manager</div>
          </div>
          <button className="rounded-md px-3 py-2 text-sm font-semibold text-chalk md:hidden" aria-expanded={open}
            onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Menu"}</button>
        </div>
        <div className={`${open ? "flex" : "hidden"} flex-col gap-0.5 px-3 pb-4 md:flex md:px-0 md:pb-0`}>
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-3.5 py-2.5 text-[15px] ${isActive ? "bg-rubber-3 font-semibold text-white" : "text-[#c4cacd] hover:bg-rubber-2"}`}>
              {({ isActive }) => (<>
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: isActive ? "#e0a800" : "#8a9296", opacity: isActive ? 1 : 0.4 }} />
                {n.label}
                {n.to === "/payments" && pending > 0 && <span className="ml-auto text-[13px] text-[#f4c542]" aria-label={`${pending} waiting`}>{pending}</span>}
              </>)}
            </NavLink>
          ))}
        </div>
        <div className={`${open ? "block" : "hidden"} border-t border-rubber-3 px-4 py-3 md:mt-auto md:block md:border-0 md:p-0`}>
          <div className="text-sm text-[#c4cacd]">{user.name}</div>
          <div className="mb-2 text-[13px] capitalize text-[#a3abaf]">{user.role === "staff" ? "Desk staff" : user.role}</div>
          <div className="flex gap-3 text-sm">
            <NavLink to="/password" className="text-[#a9c4f0] hover:text-white">Change password</NavLink>
            <button onClick={logout} className="text-[#a9c4f0] hover:text-white">Log out</button>
          </div>
        </div>
      </nav>
      <main className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-8">
        <div className="mx-auto max-w-[1180px]"><Outlet /></div>
      </main>
    </div>
  );
}
