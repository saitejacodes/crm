import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmtDate, fmtTime, inr, whatsappLink, type Member } from "../api";
import { useAuth } from "../auth";
import AddMemberModal from "../components/AddMemberModal";
import { useApi } from "../hooks";
import { Button, Empty, Panel, PlateDot, Spinner, statusText, useToast } from "../ui";
import type { Payment } from "../api";

interface Dash {
  gym_name: string; total_members: number; checkins_today: number; pending_payments: number; new_this_month: number;
  counts: Record<"active" | "expiring" | "expired" | "new", number>;
  expiring: Member[]; recently_expired: Member[];
  revenue_by_month?: { month: string; amount: number }[]; revenue_this_month?: number; revenue_today?: number;
  attendance_14d: { day: string; count: number }[];
  blocked_punches_today: { member_id: number; name: string; code: string; phone: string; at: string }[];
  running_offers: { id: number; name: string; ends_on: string; code: string | null }[];
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function reminderText(m: Member, gym: string) {
  const first = m.name.split(" ")[0];
  return m.status === "expired"
    ? `Hi ${first}, your ${gym} membership ended on ${fmtDate(m.end_date)}. Renew in the app to keep training.`
    : `Hi ${first}, your ${gym} membership ends on ${fmtDate(m.end_date)}. Renew in the app in two taps.`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, reload } = useApi<Dash>("/api/dashboard");
  const { data: pending, reload: reloadPending } = useApi<Payment[]>("/api/payments?status=pending&limit=50");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function act(p: Payment, ok: boolean) {
    setBusyId(p.id);
    try {
      await api(`/api/payments/${p.id}/${ok ? "verify" : "reject"}`, { body: ok ? undefined : { note: "Payment not received" }, method: "POST" });
      toast(ok ? `Confirmed. ${p.member_name}'s membership is updated.` : `Marked as not received. ${p.member_name} can pay again.`);
      reload(); reloadPending();
    } catch (e) { toast((e as Error).message); } finally { setBusyId(null); }
  }

  if (!data) return <Spinner />;
  const due = [...data.expiring, ...data.recently_expired];
  const figures = [
    { v: data.counts.active + data.counts.expiring, l: "Active members" },
    { v: data.checkins_today, l: "Checked in today" },
    { v: data.counts.expiring, l: "Ending this week" },
    user?.role === "owner" ? { v: inr(data.revenue_this_month ?? 0), l: "Collected this month" } : { v: data.pending_payments, l: "Payments to confirm" },
  ];
  const revMax = Math.max(1, ...(data.revenue_by_month ?? []).map((r) => r.amount));
  const visMax = Math.max(1, ...data.attendance_14d.map((r) => r.count));

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-muted">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="h-display text-[40px] font-bold leading-[1.05] sm:text-[44px]">{greeting()}, {user?.name.split(" ")[0]}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="line" onClick={() => nav("/attendance")}>Check in a member</Button>
          <Button onClick={() => setAdding(true)}>Add member</Button>
        </div>
      </div>

      {data.running_offers.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] bg-plate-green-soft px-5 py-3 text-[#14663b]">
          <span className="font-semibold">Running now:</span>
          {data.running_offers.map((o) => (
            <span key={o.id}>{o.name}{o.code ? ` (code ${o.code})` : ""}, till {fmtDate(o.ends_on)}</span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap rounded-[10px] border border-line bg-white">
        {figures.map((f) => (
          <div key={f.l} className="min-w-[150px] flex-1 border-r border-[#eceeea] px-5 py-4 last:border-r-0">
            <div className="h-display tabular text-[34px] font-semibold leading-tight">{f.v}</div>
            <div className="text-sm text-muted">{f.l}</div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="UPI payments to confirm" aside={`${pending?.length ?? 0} waiting`} pad={false}>
          {!pending?.length ? <Empty>All caught up. New UPI payments from members show up here.</Empty> : pending.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 border-b border-[#eceeea] px-5 py-3.5 last:border-b-0">
              <div className="min-w-[180px] flex-1">
                <div className="font-semibold">{p.member_name} <span className="font-normal text-muted">{p.member_code}</span></div>
                <div className="text-sm text-muted">{p.plan_name} plan, UTR {p.utr}{p.discount ? `, ${p.discount_note}` : ""}</div>
              </div>
              <div className="h-display tabular text-2xl font-semibold">{inr(p.amount)}</div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="red" disabled={busyId === p.id} onClick={() => act(p, false)}>Not received</Button>
                <Button size="sm" busy={busyId === p.id} onClick={() => act(p, true)}>Confirm</Button>
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Renewals due" aside="Next days and lapsed" pad={false}>
          {!due.length ? <Empty>Nobody is due. Members ending soon show up here.</Empty> : due.map((m) => (
            <div key={m.id} className="flex items-center gap-3 border-b border-[#eceeea] px-5 py-3 last:border-b-0">
              <PlateDot status={m.status} size={14} />
              <Link to={`/members/${m.id}`} className="min-w-0 flex-1 text-ink hover:text-ink">
                <span className="block font-semibold">{m.name}</span>
                <span className="block text-sm text-muted">{statusText(m)}, {m.plan}</span>
              </Link>
              <a className="inline-flex min-h-[34px] items-center rounded-md border border-[#cfd3ce] bg-white px-3 text-sm font-semibold text-ink hover:border-ink hover:text-ink"
                href={whatsappLink(m.phone, reminderText(m, data.gym_name))} target="_blank" rel="noopener">Remind on WhatsApp</a>
            </div>
          ))}
        </Panel>
      </div>

      {data.blocked_punches_today.length > 0 && (
        <Panel title="Tried to enter with an expired plan" aside="Fingerprint, today" pad={false}>
          {data.blocked_punches_today.map((b) => (
            <div key={b.member_id} className="flex items-center gap-3 border-b border-[#eceeea] px-5 py-3 last:border-b-0">
              <PlateDot status="expired" size={14} />
              <Link to={`/members/${b.member_id}`} className="flex-1 font-semibold text-ink">{b.name} <span className="font-normal text-muted">{b.code}</span></Link>
              <span className="text-sm text-muted">{fmtTime(b.at)}</span>
            </div>
          ))}
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {data.revenue_by_month && (
          <Panel title="Collections" aside="Owner only">
            <div className="flex h-[170px] items-end gap-3.5">
              {data.revenue_by_month.map((r, i, a) => (
                <div key={r.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="tabular text-[13px] text-muted">{r.amount >= 1000 ? (r.amount / 1000).toFixed(1) + "k" : r.amount}</span>
                  <div className="w-full max-w-[46px] rounded-t" title={inr(r.amount)}
                    style={{ height: Math.max(2, (r.amount / revMax) * 120), background: i === a.length - 1 ? "#22679a" : "#bcd6ea" }} />
                  <span className="text-[13px] text-muted">{r.month.split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
        <Panel title="Check-ins, last 14 days">
          <div className="flex h-[170px] items-end gap-1.5">
            {data.attendance_14d.map((r, i, a) => (
              <div key={r.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <div className="w-full rounded-t-[3px]" title={`${fmtDate(r.day)}: ${r.count}`}
                  style={{ height: Math.max(2, (r.count / visMax) * 130), background: i === a.length - 1 ? "#1b8a4f" : "#c5dfd0" }} />
                <span className="text-xs text-muted">{new Date(r.day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "narrow" })}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {adding && <AddMemberModal onClose={() => setAdding(false)} onAdded={(m) => { setAdding(false); toast(`${m.name} added as ${m.code}.`); nav(`/members/${m.id}`); }} />}
    </div>
  );
}
