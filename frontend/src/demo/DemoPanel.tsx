import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, tokenStore } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../ui";
import { demoMembers, demoPunch, demoToken, resetDemo } from "./server";

const PEOPLE = [
  { label: "Owner", who: "Suresh", phone: "9000000000", pw: "owner123" },
  { label: "Desk staff", who: "Meena", phone: "9111111111", pw: "pass123" },
  { label: "Trainer", who: "Arjun", phone: "9222222222", pw: "pass123" },
  { label: "Member, ends in 2 days", who: "Priya", phone: "9845012345", pw: "9845012345" },
  { label: "Member, no plan yet", who: "Deepika", phone: "9345678901", pw: "9345678901" },
  { label: "Member, expired", who: "Rahul", phone: "9567890123", pw: "9567890123" },
];

/** Only in the demo build: switch person, simulate the fingerprint machine and the entrance QR. */
export default function DemoPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const members = open ? demoMembers() : [];

  async function become(phone: string, pw: string) {
    const r = await api<{ token: string }>("/api/auth/login", { body: { phone, password: pw } });
    tokenStore.set(r.token);
    window.location.hash = "#/";
    window.location.reload();
  }
  function punch() {
    if (!pick) return;
    const r = demoPunch(Number(pick));
    toast(r.result === "ok" ? `Fingerprint: ${r.name} checked in.` : `Fingerprint: ${r.name} refused, plan expired. Shown on the dashboard.`);
    setOpen(false);
    nav(user?.role === "member" ? "/" : "/machine");
    window.dispatchEvent(new Event("hashchange"));
  }

  return (
    <div className="fixed bottom-[84px] right-3 z-[60] flex flex-col-reverse items-end font-sans md:bottom-5">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="rounded-full bg-plate-yellow px-3.5 py-1.5 text-sm font-semibold text-ink shadow-[0_2px_10px_rgba(0,0,0,.2)]">
        {open ? "Close demo" : "Demo"}
      </button>
      {open && (
        <div className="mb-2 max-h-[70vh] w-[300px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-line bg-white p-4 text-ink shadow-[0_10px_40px_rgba(28,33,36,.25)]">
          <div className="h-display text-xl font-bold">Try it as</div>
          <div className="mt-2 flex flex-col gap-1">
            {PEOPLE.map((p) => (
              <button key={p.phone} onClick={() => become(p.phone, p.pw)}
                className={`flex justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-chalk ${user?.phone === p.phone ? "bg-plate-blue-soft font-semibold" : ""}`}>
                <span>{p.who}</span><span className="text-muted">{p.label}</span>
              </button>
            ))}
          </div>
          <div className="h-display mt-4 text-xl font-bold">Fingerprint machine</div>
          <p className="text-[13px] text-muted">Pretend someone puts their thumb on the machine.</p>
          <div className="mt-2 flex gap-2">
            <select className="input !py-1.5 text-sm" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Member">
              <option value="">Pick a member</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.status})</option>)}
            </select>
            <button onClick={punch} disabled={!pick} className="rounded-md bg-rubber px-3 text-sm font-semibold text-white disabled:opacity-50">Punch</button>
          </div>
          {user?.role === "member" && (<>
            <div className="h-display mt-4 text-xl font-bold">Entrance QR</div>
            <button className="mt-1 w-full rounded-md border border-[#cfd3ce] py-2 text-sm font-semibold" onClick={() => { setOpen(false); nav(`/checkin?t=${demoToken()}`); }}>
              Scan the entrance QR now
            </button>
          </>)}
          <button className="mt-4 text-sm text-muted underline" onClick={() => { resetDemo(); window.location.hash = "#/"; window.location.reload(); }}>Reset demo data</button>
          <p className="mt-2 text-[12px] text-muted">Data stays in this browser only. The real app runs on the gym's server.</p>
        </div>
      )}
    </div>
  );
}
