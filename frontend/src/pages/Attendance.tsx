import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtTime, todayISO, type Attendance as Att, type Member } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { Button, Empty, PageTitle, Panel, PlateDot, statusText, useToast } from "../ui";

const METHOD: Record<string, string> = { qr: "QR scan", manual: "At desk", finger: "Fingerprint" };

export default function Attendance() {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user?.role !== "trainer";
  const [day, setDay] = useState(todayISO());
  const { data: log, reload } = useApi<Att[]>(`/api/attendance?day=${day}`);
  const { data: members } = useApi<Member[]>(canEdit ? "/api/members" : null);
  const [q, setQ] = useState("");
  const isToday = day === todayISO();
  const inSet = useMemo(() => new Set((log ?? []).map((a) => a.member_id)), [log]);

  const matches = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return [];
    return (members ?? []).filter((m) => m.is_active && `${m.name} ${m.phone} ${m.code}`.toLowerCase().includes(ql)).slice(0, 6);
  }, [members, q]);

  async function checkIn(m: Member) {
    try {
      await api(`/api/attendance/manual/${m.id}`, { method: "POST" });
      toast(`${m.name} checked in.`);
      reload();
    } catch (e) { toast((e as Error).message); }
  }

  return (
    <div>
      <PageTitle actions={canEdit && <Link to="/kiosk" className="inline-flex min-h-[40px] items-center rounded-md border border-[#cfd3ce] bg-white px-4 font-semibold text-ink hover:border-ink hover:text-ink">Open entrance QR screen</Link>}>
        Attendance
      </PageTitle>
      <div className="flex flex-wrap items-start gap-6">
        {canEdit && isToday && (
          <Panel title="Check in at the desk" className="w-full md:w-[360px]">
            <p className="mb-3 text-sm text-muted">For members without their phone or fingerprint. Everyone else uses the machine or the entrance QR.</p>
            <label htmlFor="csearch" className="sr-only">Find member</label>
            <input id="csearch" className="input" placeholder="Type a name, phone or member ID" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-2">
              {matches.map((m) => {
                const done = inSet.has(m.id), blocked = m.status === "expired" || m.status === "new";
                return (
                  <div key={m.id} className="flex items-center gap-2.5 border-b border-[#eceeea] py-2.5 last:border-b-0">
                    <PlateDot status={m.status} size={14} />
                    <div className="min-w-0 flex-1"><div className="font-semibold">{m.name}</div><div className="text-[13px] text-muted">{m.code}, {statusText(m)}</div></div>
                    {done ? <span className="rounded-md bg-plate-green-soft px-3 py-1.5 text-sm font-semibold text-[#14663b]">Checked in</span>
                      : blocked ? <Link to={`/members/${m.id}`} className="rounded-md border border-[#efc3c9] px-3 py-1.5 text-sm font-semibold text-[#a51f30]">Renew first</Link>
                      : <Button size="sm" onClick={() => checkIn(m)}>Check in</Button>}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
        <Panel className="min-w-0 flex-1 basis-[380px]" pad={false}
          title={isToday ? "Today" : new Date(day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
          aside={<span className="flex items-center gap-3">{log?.length ?? 0} checked in
            <input type="date" aria-label="Pick a day" className="rounded border border-line px-2 py-1 text-sm" value={day} max={todayISO()} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </span>}>
          {!log?.length ? <Empty>No check-ins {isToday ? "yet today" : "on this day"}.</Empty> : log.map((a) => (
            <div key={a.id} className="flex items-center gap-3.5 border-b border-[#eceeea] px-5 py-2.5 last:border-b-0">
              <span className="h-display tabular w-[78px] text-xl font-semibold">{fmtTime(a.check_in_at)}</span>
              <Link to={`/members/${a.member_id}`} className="flex-1 font-semibold text-ink hover:text-plate-blue">{a.member_name} <span className="font-normal text-muted">{a.member_code}</span></Link>
              <span className="text-[13px] text-muted">{METHOD[a.method] ?? a.method}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
