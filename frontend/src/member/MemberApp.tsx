import { useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api, fmtDate, fmtTime, inr, todayISO, type Attendance, type Member, type Membership, type Payment, type Quote, type Workout } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { Button, ErrorText, Field, PlateGauge, PlateMark, Spinner, useToast } from "../ui";
import ChangePassword from "../pages/ChangePassword";

const TABS = [
  { to: "/", label: "Home" }, { to: "/checkin", label: "Check in" },
  { to: "/plan", label: "My plan" }, { to: "/history", label: "History" },
];

export default function MemberApp() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-chalk">
      <div className="flex-1 px-5 pb-28 pt-5">
        <Routes>
          <Route index element={<Home />} />
          <Route path="renew" element={<Renew />} />
          <Route path="checkin" element={<CheckIn />} />
          <Route path="plan" element={<MyPlan />} />
          <Route path="history" element={<History />} />
          <Route path="password" element={<ChangePassword />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
      <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[480px] border-t border-line bg-white pb-[max(env(safe-area-inset-bottom),10px)]">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === "/"}
            className={({ isActive }) => `flex min-h-[56px] flex-1 flex-col items-center gap-1 pt-2 text-xs ${isActive ? "font-semibold text-ink" : "text-muted"}`}>
            {({ isActive }) => (<>
              <span aria-hidden className="box-border h-[22px] w-[22px] rounded-full" style={{ border: isActive ? "6px solid #22679a" : "2px solid #b7bdb9" }} />
              {t.label}
            </>)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function useMe() {
  return useApi<Member>("/api/me");
}

function Home() {
  const { logout } = useAuth();
  const nav = useNavigate();
  const { data: me } = useMe();
  const { data: gym } = useApi<{ gym_name: string; timings: string; phone: string }>("/api/public/gym");
  const { data: ms } = useApi<Membership[]>("/api/me/memberships");
  const { data: pays } = useApi<Payment[]>("/api/me/payments");
  const { data: w } = useApi<Workout>("/api/me/workout");
  if (!me) return <Spinner />;
  const pending = pays?.find((p) => p.status === "pending");
  const rejected = pays?.[0]?.status === "rejected" ? pays[0] : null;
  const cur = ms?.find((x) => x.status === "active" && x.start_date && x.end_date && x.start_date <= todayISO() && x.end_date >= todayISO()) ?? ms?.find((x) => x.status === "active");
  const upcoming = ms?.filter((x) => x.status === "active" && x.start_date && x.start_date > todayISO()).sort((a, b) => a.start_date!.localeCompare(b.start_date!)) ?? [];
  const total = cur?.start_date && cur.end_date ? Math.round((+new Date(cur.end_date) - +new Date(cur.start_date)) / 86400000) + 1 : 30;
  const left = me.days_left ?? 0;
  const headline = me.status === "new" ? "No plan yet" : me.status === "expired" ? "Membership expired" : me.status === "expiring" ? (left === 0 ? "Ends today" : `Ends in ${left} ${left === 1 ? "day" : "days"}`) : "Membership active";
  const todayLine = w?.workout?.split("\n").find((l) => l.toLowerCase().startsWith(new Date().toLocaleDateString("en-IN", { weekday: "short" }).toLowerCase()));

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PlateMark size={48} />
          <div>
            <div className="text-sm text-muted">{gym?.gym_name}</div>
            <h1 className="h-display text-[30px] font-bold leading-tight">Hi, {me.name.split(" ")[0]}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[13px] text-muted" aria-label="Member ID">{me.code}</span>
          <button onClick={logout} className="text-sm text-muted">Log out</button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl bg-rubber px-5 py-6 text-chalk">
        <PlateGauge status={me.status} daysLeft={me.days_left} totalDays={total} size={210} />
        <div className="text-center">
          <div className="h-display text-[22px] font-semibold">{headline}</div>
          <div className="text-sm text-[#a3abaf]">{me.end_date
            ? upcoming.length ? `${me.plan} now, then ${upcoming.map((u) => u.plan_name).join(", then ")}. Paid till ${fmtDate(me.end_date)}` : `${me.plan} plan, valid till ${fmtDate(me.end_date)}`
            : "Choose a plan to start training"}</div>
        </div>
      </div>

      {pending && (
        <div className="flex gap-3 rounded-xl bg-plate-yellow-soft px-4 py-3.5 text-[#6b5100]">
          <span aria-hidden className="mt-1.5 h-3 w-3 flex-none rounded-full bg-plate-yellow" />
          <div><div className="font-semibold">Payment sent for confirmation</div>
            <div className="text-sm">{inr(pending.amount)} for {pending.plan_name}, UTR {pending.utr}. Your plan updates once the gym confirms it.</div></div>
        </div>
      )}
      {rejected && !pending && (
        <div className="rounded-xl bg-plate-red-soft px-4 py-3.5 text-[#a51f30]">
          <div className="font-semibold">The gym couldn't find your last payment</div>
          <div className="text-sm">UTR {rejected.utr}. Check the number in your UPI app and try again, or talk to the front desk.</div>
        </div>
      )}

      {!pending && <Button size="lg" onClick={() => nav("/renew")}>{me.status === "new" ? "Choose a plan" : "Renew membership"}</Button>}
      <Button size="lg" variant="line" onClick={() => nav("/checkin")}>Check in at the gym</Button>

      {w?.workout && (
        <div className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-baseline justify-between">
            <div className="h-display text-xl font-semibold">Today's workout</div>
            <NavLink to="/plan" className="text-sm">Full plan</NavLink>
          </div>
          <div className="mt-1.5 text-[#1f4255]">{todayLine ?? w.workout.split("\n")[0]}</div>
          {w.trainer_name && <div className="text-sm text-muted">Set by {w.trainer_name}</div>}
        </div>
      )}
      {gym?.timings && <p className="text-center text-sm text-muted">Open {gym.timings}{gym.phone ? `. Front desk ${gym.phone}` : ""}</p>}
      <NavLink to="/password" className="self-center text-sm text-muted">Change password</NavLink>
    </div>
  );
}

function Renew() {
  const nav = useNavigate();
  const toast = useToast();
  const { data: me } = useMe();
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const { data: quotes, error: qErr } = useApi<Quote[]>(`/api/quotes${applied ? `?code=${encodeURIComponent(applied)}` : ""}`);
  const { data: base } = useApi<Quote[]>("/api/quotes");
  const [planId, setPlanId] = useState<number | null>(null);
  const [step, setStep] = useState<"choose" | "pay">("choose");
  const [link, setLink] = useState<{ link: string; amount: number; upi_id: string; payee: string } | null>(null);
  const [utr, setUtr] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (quotes && planId === null) setPlanId(quotes[0]?.plan_id ?? null); }, [quotes, planId]);
  const q = quotes?.find((x) => x.plan_id === planId);
  const codeWorked = !!applied && !!quotes && !!base && quotes.some((x) => x.price < (base.find((b) => b.plan_id === x.plan_id)?.price ?? x.price));

  async function toPay() {
    if (!q) return;
    setErr("");
    try {
      setLink(await api(`/api/me/upi/${q.plan_id}${applied ? `?code=${encodeURIComponent(applied)}` : ""}`));
      setStep("pay");
    } catch (e) { setErr((e as Error).message); }
  }
  async function submit() {
    const u = utr.replace(/\s/g, "");
    if (!/^\d{12}$/.test(u)) return setErr("The UTR is the 12-digit number on your UPI payment receipt.");
    setBusy(true); setErr("");
    try {
      await api("/api/me/payments", { body: { plan_id: q!.plan_id, utr: u, code: applied || null } });
      toast("Sent. Your plan updates once the gym confirms it.");
      nav("/");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <button className="self-start text-sm font-semibold text-muted" onClick={() => (step === "pay" ? setStep("choose") : nav("/"))}>Back</button>
      <h1 className="h-display text-[30px] font-bold leading-tight">{step === "choose" ? "Choose a plan" : `Pay ${inr(link?.amount ?? 0)}`}</h1>

      {step === "choose" && (<>
        {qErr && <ErrorText>{qErr}</ErrorText>}
        <div className="flex flex-col gap-2.5">
          {quotes?.map((x, i) => {
            const on = x.plan_id === planId;
            return (
              <button key={x.plan_id} onClick={() => setPlanId(x.plan_id)} aria-pressed={on}
                className={`flex min-h-[64px] items-center gap-3.5 rounded-xl border-2 px-4 py-3.5 text-left ${on ? "border-plate-blue bg-plate-blue-soft" : "border-line bg-white"}`}>
                <span aria-hidden className="w-1.5 self-stretch rounded" style={{ background: ["#1b8a4f", "#22679a", "#e0a800", "#c8283b"][i % 4] }} />
                <span className="flex-1">
                  <span className="block text-[17px] font-semibold">{x.plan_name}</span>
                  <span className="block text-sm text-muted">
                    {x.duration_days} days{x.duration_days > 30 ? `, ${inr(Math.round(x.price / (x.duration_days / 30)))} a month` : ""}
                    {x.offer_name && <span className="text-plate-green">, {x.offer_name}</span>}
                  </span>
                </span>
                <span className="text-right">
                  {x.discount > 0 && <s className="block text-sm text-muted">{inr(x.list_price)}</s>}
                  <span className="h-display text-2xl font-bold">{inr(x.price)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <label htmlFor="code" className="sr-only">Offer code</label>
          <input id="code" className="input" placeholder="Have an offer code?" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Button variant="line" onClick={() => setApplied(code.trim())} disabled={!code.trim()}>Apply</Button>
        </div>
        {applied && <p className={`text-sm ${codeWorked ? "text-plate-green" : "text-[#a51f30]"}`}>{codeWorked ? `Code ${applied} applied.` : `Code ${applied} doesn't lower any price today. Check the code, or your current offer may already be better.`}</p>}
        {me?.status !== "new" && me?.end_date && (me.status === "active" || me.status === "expiring") && (
          <p className="text-sm text-muted">Starts after your current plan ends on {fmtDate(me.end_date)}, so you don't lose any days.</p>
        )}
        <ErrorText>{err}</ErrorText>
        <Button size="lg" onClick={toPay} disabled={!q}>Pay {q ? inr(q.price) : ""} with UPI</Button>
        <p className="text-center text-sm text-muted">Paying cash? Just pay at the front desk.</p>
      </>)}

      {step === "pay" && link && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-line bg-white p-5 text-center">
            <div className="text-sm text-muted">Scan with any UPI app, or tap the button below</div>
            <QRCodeSVG value={link.link} size={200} level="M" />
            <div className="h-display text-[34px] font-bold leading-none">{inr(link.amount)}</div>
            <div className="text-sm text-muted">to {link.upi_id} ({link.payee})</div>
          </div>
          <a href={link.link} className="flex min-h-[50px] items-center justify-center rounded-lg bg-plate-blue font-semibold text-white hover:bg-plate-blue-dark hover:text-white">Open GPay, PhonePe or Paytm</a>
          <Field label="After paying, enter the 12-digit UTR from your UPI app">
            <input className="input tabular tracking-wider" inputMode="numeric" placeholder="e.g. 431298765012" value={utr} onChange={(e) => { setUtr(e.target.value); setErr(""); }} />
          </Field>
          <ErrorText>{err}</ErrorText>
          <Button size="lg" onClick={submit} busy={busy}>Send for confirmation</Button>
          <p className="text-center text-[13px] text-muted">The gym checks it in their bank app, usually within a few hours.</p>
        </div>
      )}
    </div>
  );
}

function CheckIn() {
  const [params, setParams] = useSearchParams();
  const token = params.get("t");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "done" | "error"; msg?: string; time?: string; again?: boolean }>({ kind: token ? "busy" : "idle" });
  const sent = useRef(false);
  const { data: visits } = useApi<Attendance[]>(state.kind === "done" ? "/api/me/attendance" : null);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api<{ created: boolean; attendance: Attendance }>("/api/me/checkin", { body: { token } })
      .then((r) => setState({ kind: "done", time: fmtTime(r.attendance.check_in_at), again: !r.created }))
      .catch((e) => setState({ kind: "error", msg: e.message }))
      .finally(() => setParams({}, { replace: true }));
  }, [token, setParams]);
  const monthCount = visits?.filter((v) => v.day.startsWith(todayISO().slice(0, 7))).length;

  return (
    <div className="flex flex-col items-center gap-[18px] text-center">
      <h1 className="h-display self-start text-[30px] font-bold leading-tight">Check in</h1>
      {state.kind === "busy" && <p role="status" className="py-16 text-muted">Checking you in…</p>}
      {state.kind === "done" && (<>
        <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Checked in">
          <circle cx="80" cy="80" r="76" fill="#1b8a4f" /><circle cx="80" cy="80" r="56" fill="none" stroke="#14663b" strokeWidth="3" />
          <path d="M54 82l18 18 36-40" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="h-display text-[30px] font-bold">{state.again ? "Already in" : "You're in"}</div>
        <p className="text-[#1f4255]">{state.again ? `You checked in at ${state.time} today.` : `Checked in at ${state.time}. Have a good session.`}</p>
        {monthCount ? <p className="text-sm text-muted">Visit {monthCount} this month.</p> : null}
      </>)}
      {(state.kind === "idle" || state.kind === "error") && (<>
        {state.kind === "error" && <div role="alert" className="w-full rounded-xl bg-plate-red-soft px-4 py-3 text-[#a51f30]">{state.msg}</div>}
        <div className="relative flex h-[260px] w-[260px] items-center justify-center rounded-[20px] bg-rubber">
          {["left-7 top-7 border-l-4 border-t-4 rounded-tl-lg", "right-7 top-7 border-r-4 border-t-4 rounded-tr-lg", "bottom-7 left-7 border-b-4 border-l-4 rounded-bl-lg", "bottom-7 right-7 border-b-4 border-r-4 rounded-br-lg"].map((c) => (
            <span key={c} aria-hidden className={`absolute h-10 w-10 border-chalk ${c}`} />
          ))}
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#a3abaf" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><rect x="7" y="7" width="4" height="4" /><rect x="13" y="13" width="4" height="4" /><path d="M13 7h4v4M7 13v4h4" /></svg>
        </div>
        <p className="max-w-[30ch] text-[#1f4255]">Open your phone camera and point it at the QR code on the screen at the entrance. Or just use the fingerprint machine.</p>
      </>)}
    </div>
  );
}

function MyPlan() {
  const { data: w } = useApi<Workout>("/api/me/workout");
  if (!w) return <Spinner />;
  const days = w.workout.split("\n").filter((l) => l.trim());
  const todayShort = new Date().toLocaleDateString("en-IN", { weekday: "short" }).toLowerCase();
  return (
    <div className="flex flex-col gap-3.5">
      <h1 className="h-display text-[30px] font-bold leading-tight">My plan</h1>
      {w.trainer_name && <p className="-mt-2 text-sm text-muted">From {w.trainer_name}{w.updated_at ? `, updated ${fmtDate(w.updated_at)}` : ""}</p>}
      {!days.length ? <p className="text-muted">Your trainer hasn't written a plan yet. Ask them at the gym.</p> : days.map((l, i) => {
        const [d, ...rest] = l.split(":");
        const hasDay = rest.length > 0 && d.length <= 12;
        const isToday = hasDay && d.trim().toLowerCase().startsWith(todayShort);
        return (
          <div key={i} className={`flex items-baseline gap-3 rounded-xl px-4 py-3.5 ${isToday ? "bg-rubber text-chalk" : "border border-line bg-white"}`}>
            {hasDay && <div className="h-display w-[52px] flex-none text-lg font-semibold">{d.trim()}</div>}
            <div>{hasDay ? rest.join(":").trim() : l}</div>
          </div>
        );
      })}
      {w.diet && (
        <div className="rounded-xl border border-line bg-white px-4 py-3.5">
          <div className="h-display text-xl font-semibold">Diet notes</div>
          <p className="mt-1.5 whitespace-pre-line text-[#1f4255]">{w.diet}</p>
        </div>
      )}
    </div>
  );
}

function History() {
  const { data: visits } = useApi<Attendance[]>("/api/me/attendance");
  const { data: pays } = useApi<Payment[]>("/api/me/payments");
  const now = new Date();
  const [y, m] = [now.getFullYear(), now.getMonth()];
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysIn = new Date(y, m + 1, 0).getDate();
  const prefix = todayISO().slice(0, 8);
  const visited = new Set((visits ?? []).filter((v) => v.day.startsWith(prefix)).map((v) => Number(v.day.slice(8))));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="h-display text-[30px] font-bold leading-tight">History</h1>
      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex items-baseline justify-between">
          <div className="h-display text-xl font-semibold">{now.toLocaleDateString("en-IN", { month: "long" })} visits</div>
          <span className="text-sm text-muted">{visited.size} days</span>
        </div>
        <div className="mt-2.5 grid grid-cols-7 gap-1.5 text-center text-xs text-muted">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
          {Array.from({ length: first }).map((_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: daysIn }).map((_, i) => {
            const d = i + 1, v = visited.has(d), t = d === now.getDate();
            return <span key={d} aria-label={`${d}${v ? ", visited" : ""}`}
              className={`flex h-[34px] items-center justify-center rounded-full text-[13px] ${v ? "bg-plate-green font-semibold text-white" : t ? "text-ink shadow-[inset_0_0_0_2px_#22679a]" : "text-[#1f4255]"}`}>{d}</span>;
          })}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="h-display px-4 pb-1.5 pt-3.5 text-xl font-semibold">Payments</div>
        {!pays?.length ? <p className="px-4 pb-4 text-muted">No payments yet.</p> : pays.map((p) => (
          <div key={p.id} className="flex justify-between gap-3 border-t border-[#eceeea] px-4 py-2.5">
            <div>
              <div className="font-semibold">{p.plan_name}</div>
              <div className="text-[13px] text-muted">
                {p.status === "pending" ? "Waiting for the gym to confirm" : p.status === "rejected" ? "Not received by the gym" : `Paid ${fmtDate(p.verified_at)}, ${p.method === "upi" ? "UPI" : "cash"}${p.receipt_no ? `, receipt ${p.receipt_no}` : ""}`}
                {p.discount > 0 && `, saved ${inr(p.discount)}`}
              </div>
            </div>
            <div className="h-display text-xl font-semibold">{inr(p.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
