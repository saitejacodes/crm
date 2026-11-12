/* In-browser stand-in for the FastAPI backend, used only by the demo build.
   It follows the same rules: stacked renewals, offers (best discount wins, codes, new-members-only),
   owner-only custom price, rotating check-in code, fingerprint add/remove with saved templates. */
import { ApiError } from "../api";

type Role = "owner" | "staff" | "trainer" | "member";
interface U { id: number; name: string; phone: string; email: string | null; pw: string; role: Role; is_active: boolean }
interface M { id: number; user_id: number; code: string; gender: string | null; dob: string | null; address: string | null; emergency_contact: string | null; joined_on: string; trainer_id: number | null; notes: string | null; device_enabled: boolean | null; fp: boolean }
interface P { id: number; name: string; duration_days: number; price: number; description: string | null; is_active: boolean }
interface MS { id: number; member_id: number; plan_id: number; start_date: string | null; end_date: string | null; amount: number; list_price: number; discount: number; offer_id: number | null; discount_note: string | null; status: string; created_at: string }
interface PAY { id: number; member_id: number; membership_id: number; amount: number; method: string; utr: string | null; status: string; note: string | null; receipt_no: string | null; created_at: string; verified_at: string | null }
interface A { id: number; member_id: number; day: string; check_in_at: string; method: string }
interface O { id: number; name: string; kind: "percent" | "flat"; value: number; starts_on: string; ends_on: string; plan_ids: number[]; code: string | null; new_members_only: boolean; is_active: boolean }
interface PU { id: number; pin: string; member_id: number | null; punched_at: string; result: string }
interface DB {
  v: number; seq: number; users: U[]; members: M[]; plans: P[]; ms: MS[]; pays: PAY[]; att: A[]; offers: O[];
  workouts: Record<number, { workout: string; diet: string; trainer_id: number | null; updated_at: string }>;
  device: { serial: string; name: string; added: boolean } | null; punches: PU[];
  gym: { gym_name: string; upi_id: string; upi_payee_name: string; phone: string; address: string; timings: string; expiry_alert_days: number };
}

const KEY = "sv_gym_demo_db_v2";
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const addDays = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); };
const diff = (s: string) => { const [y, m, d] = s.split("-").map(Number); const t = new Date(); return Math.round((new Date(y, m - 1, d).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000); };
const stamp = (day: string, h: number, mi: number) => `${day}T${pad(h)}:${pad(mi)}:00`;
const nowStamp = () => { const d = new Date(); return `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const fail = (status: number, msg: string): never => { throw new ApiError(status, msg); };

/* ---------------- seed ---------------- */
function seed(): DB {
  const t = today();
  const db: DB = {
    v: 1, seq: 100, users: [], members: [], plans: [], ms: [], pays: [], att: [], offers: [], workouts: {}, punches: [],
    device: { serial: "CQZ7232460123", name: "Entrance", added: true },
    gym: { gym_name: "SV Fitness Gym", upi_id: "svfitness@okaxis", upi_payee_name: "SV Fitness Gym", phone: "9666645114", address: "Shivaji Marg, Vinayaka Hills, Vignanapuri Teachers Colony, B.N Reddy Nagar, Hyderabad 500112", timings: "Mon to Sat 5 AM to 9 PM, Sun 6 AM to 10 AM", expiry_alert_days: 7 },
  };
  const id = () => ++db.seq;
  const user = (name: string, phone: string, role: Role, pw: string) => { const u: U = { id: id(), name, phone, email: null, pw, role, is_active: true }; db.users.push(u); return u; };
  user("Suresh Reddy", "9000000000", "owner", "owner123");
  user("Meena", "9111111111", "staff", "pass123");
  const arjun = user("Arjun Rao", "9222222222", "trainer", "pass123");
  const kavya = user("Kavya Nair", "9333333333", "trainer", "pass123");
  [["Monthly", 30, 1000], ["Quarterly", 90, 2700], ["Half-yearly", 180, 5000], ["Yearly", 365, 9000]].forEach(([n, d, p]) =>
    db.plans.push({ id: id(), name: n as string, duration_days: d as number, price: p as number, description: null, is_active: true }));
  const plan = (n: string) => db.plans.find((p) => p.name === n)!;
  const people: [string, string, string | null, U | null, number, boolean][] = [
    ["Ravi Kumar", "9876543210", "Quarterly", arjun, 0, true], ["Priya Sharma", "9845012345", "Monthly", kavya, -27, true],
    ["Mohammed Irfan", "9700123456", "Yearly", arjun, -100, true], ["Anjali Gupta", "9123456780", "Monthly", kavya, -24, true],
    ["Vikram Singh", "9988776655", "Monthly", null, -37, false], ["Sai Charan", "9012345678", "Half-yearly", arjun, -60, true],
    ["Deepika Iyer", "9345678901", null, null, 0, false], ["Rahul Verma", "9567890123", "Quarterly", kavya, -103, true],
    ["Lakshmi Prasad", "9678901234", "Monthly", kavya, -10, true], ["Karthik Menon", "9789012345", "Monthly", arjun, -28, true],
  ];
  let n = 0, r = 0;
  for (const [name, phone, pn, tr, shift, fp] of people) {
    const u = user(name, phone, "member", phone);
    const m: M = { id: ++n, user_id: u.id, code: "M" + String(n).padStart(4, "0"), gender: null, dob: null, address: null, emergency_contact: null,
      joined_on: addDays(t, Math.min(shift, 0) - 5), trainer_id: tr?.id ?? null, notes: null, device_enabled: pn && shift > -40 ? true : null, fp };
    db.members.push(m);
    if (pn) {
      const p = plan(pn), start = addDays(t, shift);
      const ms: MS = { id: id(), member_id: m.id, plan_id: p.id, start_date: start, end_date: addDays(start, p.duration_days - 1), amount: p.price, list_price: p.price, discount: 0, offer_id: null, discount_note: null, status: "active", created_at: stamp(start, 8, 30) };
      db.ms.push(ms);
      db.pays.push({ id: id(), member_id: m.id, membership_id: ms.id, amount: p.price, method: r % 2 ? "upi" : "cash", utr: r % 2 ? `43${String(1000000000 + r * 7919)}` : null, status: "verified", note: null, receipt_no: `R${start.slice(2, 4)}${start.slice(5, 7)}-${String(++r).padStart(5, "0")}`, created_at: stamp(start, 8, 30), verified_at: stamp(start, 8, 31) });
    }
  }
  const mem = (name: string) => db.members.find((m) => db.users.find((u) => u.id === m.user_id)!.name === name)!;
  // 14 days of attendance
  let s = 7;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const regulars = ["Ravi Kumar", "Priya Sharma", "Mohammed Irfan", "Anjali Gupta", "Sai Charan", "Lakshmi Prasad", "Karthik Menon"].map(mem);
  for (let d = 13; d >= 1; d--) {
    const day = addDays(t, -d);
    for (const m of regulars) if (rnd() > 0.35) db.att.push({ id: id(), member_id: m.id, day, check_in_at: stamp(day, [6, 6, 7, 18, 19][Math.floor(rnd() * 5)], Math.floor(rnd() * 60)), method: rnd() > 0.3 ? "finger" : "qr" });
  }
  for (const [nm, h, mi] of [["Mohammed Irfan", 6, 2], ["Sai Charan", 6, 15], ["Ravi Kumar", 6, 41], ["Lakshmi Prasad", 7, 20]] as [string, number, number][]) {
    const m = mem(nm);
    db.att.push({ id: id(), member_id: m.id, day: t, check_in_at: stamp(t, h, mi), method: "finger" });
    db.punches.push({ id: id(), pin: String(m.id), member_id: m.id, punched_at: stamp(t, h, mi), result: "ok" });
  }
  const vik = mem("Vikram Singh");
  db.punches.push({ id: id(), pin: String(vik.id), member_id: vik.id, punched_at: stamp(t, 7, 5), result: "expired" });
  // workouts
  db.workouts[mem("Ravi Kumar").id] = { workout: "Mon: Chest and triceps, bench 4x8\nTue: Back and biceps, deadlift 3x5\nWed: Legs, squat 4x6\nThu: Shoulders\nFri: Arms and core\nSat: 30 min cardio\nSun: Rest", diet: "140 g protein a day. Eggs and paneer at breakfast.", trainer_id: arjun.id, updated_at: stamp(addDays(t, -9), 10, 0) };
  db.workouts[mem("Priya Sharma").id] = { workout: "Mon: Full body circuit, 3 rounds\nTue: 25 min incline walk\nWed: Full body circuit, 3 rounds\nThu: 25 min incline walk\nFri: Full body circuit, 3 rounds\nSat: Yoga or a long walk\nSun: Rest", diet: "Two litres of water a day. Dal and sprouts at lunch.", trainer_id: kavya.id, updated_at: stamp(addDays(t, -10), 10, 0) };
  // offers
  db.offers.push({ id: id(), name: "Diwali Offer", kind: "percent", value: 20, starts_on: addDays(t, -3), ends_on: addDays(t, 4), plan_ids: [plan("Quarterly").id, plan("Half-yearly").id, plan("Yearly").id], code: null, new_members_only: false, is_active: true });
  db.offers.push({ id: id(), name: "Gym Anniversary", kind: "flat", value: 500, starts_on: addDays(t, -1), ends_on: addDays(t, 6), plan_ids: [], code: "SV5YRS", new_members_only: false, is_active: true });
  db.offers.push({ id: id(), name: "New Year Offer", kind: "percent", value: 25, starts_on: `${t.slice(0, 4)}-12-28`, ends_on: `${Number(t.slice(0, 4)) + 1}-01-10`, plan_ids: [], code: null, new_members_only: false, is_active: true });
  // two UPI payments waiting
  const pend = (m: M, pn: string, utr: string, mins: number) => {
    const p = plan(pn), q = quote(db, p, m, null);
    const ms: MS = { id: id(), member_id: m.id, plan_id: p.id, start_date: null, end_date: null, amount: q.price, list_price: p.price, discount: q.discount, offer_id: q.offer_id, discount_note: q.offer_name, status: "pending", created_at: nowStamp() };
    db.ms.push(ms);
    const d = new Date(Date.now() - mins * 60000);
    db.pays.push({ id: id(), member_id: m.id, membership_id: ms.id, amount: q.price, method: "upi", utr, status: "pending", note: null, receipt_no: null, created_at: `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`, verified_at: null });
  };
  pend(mem("Deepika Iyer"), "Monthly", "431298765012", 40);
  pend(vik, "Quarterly", "431277001245", 95);
  return db;
}

let db: DB = load();
function load(): DB {
  try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw) as DB; if (d.v === 1) return d; } } catch { /* storage blocked */ }
  return seed();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* in-memory only */ } }
export function resetDemo() { db = seed(); save(); }

/* ---------------- domain rules (mirror backend/app/services.py, pricing.py, device.py) ---------------- */
const nid = () => ++db.seq;
const userOf = (m: M) => db.users.find((u) => u.id === m.user_id)!;
const planOf = (id: number) => db.plans.find((p) => p.id === id)!;
const memberById = (id: number) => db.members.find((m) => m.id === id) ?? fail(404, "Member not found");
const msOf = (m: M) => db.ms.filter((x) => x.member_id === m.id);

function status(m: M) {
  const t = today();
  const active = msOf(m).filter((x) => x.status === "active" && x.end_date);
  const cover = active.filter((x) => x.start_date! <= t && t <= x.end_date!);
  const cur = cover.length ? cover.sort((a, b) => b.end_date!.localeCompare(a.end_date!))[0] : active.sort((a, b) => b.end_date!.localeCompare(a.end_date!))[0];
  if (!cur) return { status: "new" as const, end_date: null, days_left: null, plan: null };
  let end = cur.end_date!;
  for (;;) { const nx = active.find((x) => x.start_date === addDays(end, 1)); if (!nx) break; end = nx.end_date!; }
  const left = diff(end);
  const st = cur.start_date! > t ? "active" : left < 0 ? "expired" : left <= db.gym.expiry_alert_days ? "expiring" : "active";
  return { status: st as "active" | "expiring" | "expired", end_date: end, days_left: left, plan: planOf(cur.plan_id).name };
}
function memberOut(m: M) {
  const u = userOf(m), tr = m.trainer_id ? db.users.find((x) => x.id === m.trainer_id) : null;
  return { id: m.id, user_id: u.id, code: m.code, name: u.name, phone: u.phone, email: u.email, gender: m.gender, dob: m.dob, address: m.address,
    emergency_contact: m.emergency_contact, joined_on: m.joined_on, trainer_id: m.trainer_id, trainer_name: tr?.name ?? null, notes: m.notes,
    is_active: u.is_active, device_enabled: m.device_enabled, has_fingerprint: m.fp, ...status(m) };
}
const userOut = (u: U) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role, is_active: u.is_active, member_id: db.members.find((m) => m.user_id === u.id)?.id ?? null });
const msOut = (x: MS) => ({ ...x, plan_name: planOf(x.plan_id).name });
function payOut(p: PAY) {
  const m = memberById(p.member_id), ms = db.ms.find((x) => x.id === p.membership_id);
  return { ...p, member_name: userOf(m).name, member_code: m.code, plan_name: ms ? planOf(ms.plan_id).name : null, list_price: ms?.list_price ?? null, discount: ms?.discount ?? 0, discount_note: ms?.discount_note ?? null };
}
const attOut = (a: A) => { const m = memberById(a.member_id); return { ...a, member_name: userOf(m).name, member_code: m.code }; };

function applies(o: O, p: P, m: M | null, d: DB = db) {
  const t = today();
  if (!o.is_active || t < o.starts_on || t > o.ends_on) return false;
  if (o.plan_ids.length && !o.plan_ids.includes(p.id)) return false;
  if (o.new_members_only && m && d.ms.some((x) => x.member_id === m.id && x.status === "active")) return false;
  return true;
}
type Q = { price: number; discount: number; offer_id: number | null; offer_name: string | null };
function quote(d: DB, p: P, m: M | null, code: string | null): Q {
  const cands = d.offers.filter((o) => !o.code);
  if (code) {
    const c = d.offers.find((o) => o.code === code.trim().toUpperCase());
    if (!c || !applies(c, p, m, d)) fail(400, "This offer code isn't valid for this plan today");
    cands.push(c!);
  }
  let best: { d: number; o: O } | null = null;
  for (const o of cands) if (applies(o, p, m, d)) {
    const dd = Math.max(0, Math.min(p.price, o.kind === "percent" ? Math.floor((p.price * o.value) / 100) : o.value));
    if (!best || dd > best.d) best = { d: dd, o };
  }
  return best && best.d > 0 ? { price: p.price - best.d, discount: best.d, offer_id: best.o.id, offer_name: best.o.name } : { price: p.price, discount: 0, offer_id: null, offer_name: null };
}
function activate(ms: MS) {
  const latest = msOf(memberById(ms.member_id)).filter((x) => x.status === "active").map((x) => x.end_date!).sort().pop();
  let start = today();
  if (latest && latest >= start) start = addDays(latest, 1);
  ms.start_date = start; ms.end_date = addDays(start, planOf(ms.plan_id).duration_days - 1); ms.status = "active";
}
function verify(p: PAY) {
  p.status = "verified"; p.verified_at = nowStamp();
  const n = db.pays.filter((x) => x.receipt_no).length + 1;
  p.receipt_no = `R${today().slice(2, 4)}${today().slice(5, 7)}-${String(n).padStart(5, "0")}`;
  const ms = db.ms.find((x) => x.id === p.membership_id);
  if (ms) activate(ms);
  syncDevice(memberById(p.member_id));
}
function syncDevice(m: M): string {
  if (!db.device?.added) return "no_device";
  const want = userOf(m).is_active && ["active", "expiring"].includes(status(m).status);
  if (want && m.device_enabled !== true) { m.device_enabled = true; return "enabled"; }
  if (!want && m.device_enabled === true) { if (!m.fp) return "needs_fingerprint_backup"; m.device_enabled = false; return "disabled"; }
  return "unchanged";
}
function newMembership(m: M, p: P, q: Q, statusVal: string): MS {
  const ms: MS = { id: nid(), member_id: m.id, plan_id: p.id, start_date: null, end_date: null, amount: q.price, list_price: p.price, discount: q.discount, offer_id: q.offer_id, discount_note: q.offer_name, status: statusVal, created_at: nowStamp() };
  db.ms.push(ms);
  return ms;
}
function deskPayment(m: M, b: { plan_id: number; method: string; utr?: string | null; code?: string | null; amount?: number; discount_reason?: string | null }, by: U) {
  const p = db.plans.find((x) => x.id === Number(b.plan_id)) ?? fail(404, "Plan not found");
  if (b.utr && db.pays.some((x) => x.utr === b.utr)) fail(409, "This UTR was already used for another payment");
  let q: Q = quote(db, p, m, b.code ?? null);
  if (b.amount !== undefined && b.amount !== null && b.amount !== p.price) {
    if (by.role !== "owner") fail(403, "Only the owner can give a custom discount. Use an offer instead.");
    if (b.amount > p.price) fail(400, "Amount can't be more than the plan price");
    q = { price: b.amount, discount: p.price - b.amount, offer_id: null, offer_name: b.discount_reason || "Owner discount" };
  }
  const ms = newMembership(m, p, q, "pending");
  const pay: PAY = { id: nid(), member_id: m.id, membership_id: ms.id, amount: q.price, method: b.method, utr: b.utr || null, status: "pending", note: null, receipt_no: null, created_at: nowStamp(), verified_at: null };
  db.pays.push(pay);
  verify(pay);
  return pay;
}
function checkIn(m: M, method: string, at = nowStamp()) {
  if (!userOf(m).is_active) fail(403, "Account disabled. Please contact the front desk.");
  if (["expired", "new"].includes(status(m).status)) fail(402, "Membership expired. Please renew to check in.");
  const ex = db.att.find((a) => a.member_id === m.id && a.day === at.slice(0, 10));
  if (ex) return { a: ex, created: false };
  const a: A = { id: nid(), member_id: m.id, day: at.slice(0, 10), check_in_at: at, method };
  db.att.push(a);
  return { a, created: true };
}
const kioskToken = (offset = 0) => { const w = Math.floor(Date.now() / 60000) - offset; let h = 2166136261; for (const c of `sv-${w}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0") + w.toString(16); };

/* demo-only hooks for the Demo panel */
export function demoPunch(memberId: number) {
  const m = memberById(memberId), at = nowStamp(), st = status(m).status;
  const result = !userOf(m).is_active ? "disabled" : ["expired", "new"].includes(st) ? "expired" : "ok";
  db.punches.push({ id: nid(), pin: String(m.id), member_id: m.id, punched_at: at, result });
  if (result === "ok") checkIn(m, "finger", at);
  if (m.device_enabled === null) m.device_enabled = true;
  save();
  return { name: userOf(m).name, result };
}
export const demoToken = () => kioskToken();
export const demoMembers = () => db.members.map((m) => ({ id: m.id, name: userOf(m).name, phone: userOf(m).phone, status: status(m).status }));

/* ---------------- router ---------------- */
function me(token: string | null): U {
  const id = token?.startsWith("demo:") ? Number(token.slice(5)) : NaN;
  const u = db.users.find((x) => x.id === id);
  if (!u) fail(401, "Not logged in");
  if (!u!.is_active) fail(401, "Account disabled");
  return u!;
}
const need = (u: U, ...roles: Role[]) => { if (!roles.includes(u.role)) fail(403, "You don't have access to this"); };
const STAFF: Role[] = ["owner", "staff"], ALL: Role[] = ["owner", "staff", "trainer"];
const cleanPhone = (v: string) => { let s = (v || "").replace(/\D/g, ""); if (s.length === 12 && s.startsWith("91")) s = s.slice(2); return s; };
const phoneOk = (s: string) => /^[6-9]\d{9}$/.test(s) || fail(422, "phone: enter a 10-digit Indian mobile number");

type Body = Record<string, unknown>;
export async function demoApi(method: string, url: string, body: Body | undefined, token: string | null): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120));
  const [path, qs] = url.split("?");
  const q = new URLSearchParams(qs ?? "");
  const seg = path.replace(/^\/api\//, "").split("/");
  const out = route(method, seg, q, body ?? {}, token);
  save();
  return JSON.parse(JSON.stringify(out));
}

function route(method: string, s: string[], q: URLSearchParams, b: Body, token: string | null): unknown {
  const [a, b1, b2] = s;
  const M_ = method;
  if (a === "public" && b1 === "gym") return { gym_name: db.gym.gym_name, phone: db.gym.phone, address: db.gym.address, timings: db.gym.timings };
  if (a === "auth" && b1 === "login") {
    const u = db.users.find((x) => x.phone === cleanPhone(String(b.phone)));
    if (!u || u.pw !== b.password) fail(401, "Wrong phone number or password");
    if (!u!.is_active) fail(403, "Your account is disabled. Please contact the gym.");
    return { token: `demo:${u!.id}`, user: userOut(u!) };
  }
  const u = me(token);
  if (a === "auth" && b1 === "me") return userOut(u);
  if (a === "auth" && b1 === "password") { if (b.old_password !== u.pw) fail(400, "Current password is wrong"); u.pw = String(b.new_password); return { ok: true }; }

  if (a === "users") {
    need(u, ...STAFF);
    if (!b1 && M_ === "GET") return db.users.filter((x) => x.role !== "member" && (!q.get("role") || x.role === q.get("role"))).map(userOut);
    need(u, "owner");
    if (!b1) { const ph = cleanPhone(String(b.phone)); phoneOk(ph); if (db.users.some((x) => x.phone === ph)) fail(409, "This phone number is already registered");
      const nu: U = { id: nid(), name: String(b.name), phone: ph, email: null, pw: String(b.password), role: b.role as Role, is_active: true }; db.users.push(nu); return userOut(nu); }
    const t = db.users.find((x) => x.id === Number(b1)) ?? fail(404, "User not found");
    if (t.id === u.id && b.is_active === false) fail(400, "You can't disable your own account");
    Object.assign(t, b); return userOut(t);
  }

  if (a === "plans") {
    if (M_ === "GET") return db.plans.filter((p) => (q.get("include_inactive") === "true" && u.role !== "member") || p.is_active);
    need(u, "owner");
    const data = { name: String(b.name), duration_days: Number(b.duration_days), price: Number(b.price), description: (b.description as string) || null, is_active: b.is_active !== false };
    if (data.duration_days <= 0) fail(422, "duration days: must be more than 0");
    if (!b1) { const p = { id: nid(), ...data }; db.plans.push(p); return p; }
    const p = db.plans.find((x) => x.id === Number(b1)) ?? fail(404, "Plan not found"); Object.assign(p, data); return p;
  }

  if (a === "quotes") {
    const m = u.role === "member" ? db.members.find((x) => x.user_id === u.id)! : q.get("member_id") ? memberById(Number(q.get("member_id"))) : null;
    return db.plans.filter((p) => p.is_active).sort((x, y) => x.duration_days - y.duration_days).map((p) => {
      let r; try { r = quote(db, p, m, q.get("code")); } catch { r = quote(db, p, m, null); }
      return { plan_id: p.id, plan_name: p.name, duration_days: p.duration_days, list_price: p.price, discount: r.discount, price: r.price, offer_name: r.offer_name };
    });
  }

  if (a === "offers") {
    need(u, ...STAFF);
    const out = (o: O) => { const t = today(); return { ...o, state: !o.is_active ? "paused" : t < o.starts_on ? "upcoming" : t > o.ends_on ? "ended" : "running", times_used: db.ms.filter((x) => x.offer_id === o.id && x.status === "active").length }; };
    if (M_ === "GET") return [...db.offers].sort((x, y) => y.starts_on.localeCompare(x.starts_on)).map(out);
    need(u, "owner");
    const code = b.code ? String(b.code).trim().toUpperCase() : null;
    if (Number(b.value) <= 0) fail(422, "value: must be more than 0");
    if (b.kind === "percent" && Number(b.value) > 90) fail(422, "Percentage discount can be at most 90%");
    if (String(b.ends_on) < String(b.starts_on)) fail(422, "End date is before the start date");
    if (code && db.offers.some((o) => o.code === code && o.id !== Number(b1))) fail(409, "Another offer already uses this code");
    const data = { name: String(b.name), kind: b.kind as O["kind"], value: Number(b.value), starts_on: String(b.starts_on), ends_on: String(b.ends_on), plan_ids: (b.plan_ids as number[]) ?? [], code, new_members_only: !!b.new_members_only, is_active: b.is_active !== false };
    if (!b1) { const o = { id: nid(), ...data }; db.offers.push(o); return out(o); }
    const o = db.offers.find((x) => x.id === Number(b1)) ?? fail(404, "Offer not found"); Object.assign(o, data); return out(o);
  }

  if (a === "members") {
    need(u, ...ALL);
    if (!b1 && M_ === "GET") {
      let list = db.members.filter((m) => u.role !== "trainer" || m.trainer_id === u.id).map(memberOut);
      const ql = (q.get("q") ?? "").toLowerCase();
      if (ql) list = list.filter((m) => `${m.name} ${m.phone} ${m.code}`.toLowerCase().includes(ql));
      return list.sort((x, y) => x.name.localeCompare(y.name));
    }
    if (!b1 && M_ === "POST") {
      need(u, ...STAFF);
      const ph = cleanPhone(String(b.phone)); phoneOk(ph);
      if (String(b.name ?? "").trim().length < 2) fail(422, "name: enter the full name");
      if (db.users.some((x) => x.phone === ph)) fail(409, "This phone number is already registered");
      const nu: U = { id: nid(), name: String(b.name).trim(), phone: ph, email: null, pw: (b.password as string) || ph, role: "member", is_active: true };
      db.users.push(nu);
      const num = Math.max(0, ...db.members.map((x) => x.id)) + 1;
      const m: M = { id: num, user_id: nu.id, code: "M" + String(num).padStart(4, "0"), gender: (b.gender as string) || null, dob: null, address: null, emergency_contact: null, joined_on: today(), trainer_id: (b.trainer_id as number) || null, notes: null, device_enabled: null, fp: false };
      db.members.push(m);
      if (b.plan_id) deskPayment(m, { plan_id: Number(b.plan_id), method: (b.payment_method as string) || "cash", utr: b.utr as string }, u);
      return memberOut(m);
    }
    const m = memberById(Number(b1));
    if (u.role === "trainer" && m.trainer_id !== u.id) fail(403, "This member is not assigned to you");
    if (!b2 && M_ === "GET") return memberOut(m);
    if (!b2 && M_ === "PATCH") {
      need(u, ...STAFF);
      const mu = userOf(m);
      if (b.phone) { const ph = cleanPhone(String(b.phone)); phoneOk(ph); if (ph !== mu.phone && db.users.some((x) => x.phone === ph)) fail(409, "This phone number is already registered"); mu.phone = ph; }
      if (b.name) mu.name = String(b.name);
      if (b.is_active !== undefined) mu.is_active = !!b.is_active;
      if (b.password) mu.pw = String(b.password);
      for (const k of ["emergency_contact", "address", "notes", "trainer_id"] as const) if (k in b) (m as unknown as Record<string, unknown>)[k] = b[k] || null;
      syncDevice(m);
      return memberOut(m);
    }
    if (b2 === "memberships") return msOf(m).sort((x, y) => y.id - x.id).map(msOut);
    if (b2 === "payments" && M_ === "GET") { need(u, ...STAFF); return db.pays.filter((p) => p.member_id === m.id).sort((x, y) => y.id - x.id).map(payOut); }
    if (b2 === "payments") { need(u, ...STAFF); return payOut(deskPayment(m, b as never, u)); }
    if (b2 === "attendance") return db.att.filter((x) => x.member_id === m.id).sort((x, y) => y.day.localeCompare(x.day)).map(attOut);
    if (b2 === "workout") {
      if (M_ === "PUT") db.workouts[m.id] = { workout: String(b.workout ?? ""), diet: String(b.diet ?? ""), trainer_id: u.id, updated_at: nowStamp() };
      return workoutOut(m.id);
    }
  }

  if (a === "payments") {
    need(u, ...STAFF);
    if (b1 === "export.csv") {
      need(u, "owner");
      const rows = db.pays.filter((p) => p.status === "verified").map(payOut);
      return ["Receipt,Date,Member code,Member,Plan,Plan price,Discount,Offer,Amount paid,Method,UTR"].concat(rows.map((o) =>
        [o.receipt_no, (o.verified_at ?? "").slice(0, 10), o.member_code, o.member_name, o.plan_name, o.list_price, o.discount, o.discount_note ?? "", o.amount, o.method, o.utr ?? ""].join(","))).join("\n");
    }
    if (!b1) return db.pays.filter((p) => !q.get("status") || p.status === q.get("status")).sort((x, y) => y.id - x.id).map(payOut);
    const p = db.pays.find((x) => x.id === Number(b1)) ?? fail(404, "Payment not found");
    if (p.status !== "pending") fail(400, `Payment is already ${p.status}`);
    if (b2 === "verify") verify(p);
    if (b2 === "reject") { p.status = "rejected"; p.note = (b.note as string) || "Payment not received"; p.verified_at = nowStamp(); const ms = db.ms.find((x) => x.id === p.membership_id); if (ms) ms.status = "cancelled"; }
    return payOut(p);
  }

  if (a === "attendance") {
    need(u, ...ALL);
    if (b1 === "kiosk-token") { need(u, ...STAFF); return { token: kioskToken(), rotates_in_seconds: 60, gym_name: db.gym.gym_name }; }
    if (b1 === "manual") { need(u, ...STAFF); return attOut(checkIn(memberById(Number(b2)), "manual").a); }
    const day = q.get("day") || today();
    return db.att.filter((x) => x.day === day).sort((x, y) => y.check_in_at.localeCompare(x.check_in_at)).map(attOut);
  }

  if (a === "dashboard") { need(u, ...STAFF); return dashboard(u); }
  if (a === "settings") {
    if (M_ === "PUT") { need(u, "owner"); if (b.upi_id && !String(b.upi_id).includes("@")) fail(422, "UPI ID looks wrong (should be like name@bank)"); Object.assign(db.gym, b); }
    return db.gym;
  }

  if (a === "devices") {
    need(u, ...STAFF);
    const dev = () => db.device ? [{ id: 1, serial: db.device.serial, name: db.device.name, is_active: db.device.added, last_seen: nowStamp(), online: true, pending_commands: 0 }] : [];
    if (!b1 && M_ === "GET") return dev();
    if (b1 === "punches") return [...db.punches].sort((x, y) => y.punched_at.localeCompare(x.punched_at)).slice(0, 30).map((p) => {
      const m = p.member_id ? memberById(p.member_id) : null; return { ...p, member_name: m ? userOf(m).name : null, member_code: m?.code ?? null };
    });
    if (b1 === "attention") {
      const cannot = [], notEn = [];
      for (const m of db.members) {
        const want = userOf(m).is_active && ["active", "expiring"].includes(status(m).status);
        const row = { id: m.id, code: m.code, name: userOf(m).name, pin: String(m.id) };
        if (!want && m.device_enabled && !m.fp) cannot.push(row);
        if (want && !m.fp) notEn.push(row);
      }
      return { cannot_block: cannot, not_enrolled: notEn };
    }
    need(u, "owner");
    if (b1 === "sync") { const c: Record<string, number> = {}; for (const m of db.members) { const r = syncDevice(m); c[r] = (c[r] ?? 0) + 1; } return c; }
    if (M_ === "POST") { db.device = { serial: String(b.serial), name: String(b.name || "Entrance"), added: true }; for (const m of db.members) syncDevice(m); return dev()[0]; }
    if (M_ === "DELETE") { if (db.device) db.device.added = false; return { ok: true }; }
  }

  if (a === "me") {
    need(u, "member");
    const m = db.members.find((x) => x.user_id === u.id)!;
    if (!b1) return memberOut(m);
    if (b1 === "memberships") return msOf(m).sort((x, y) => y.id - x.id).map(msOut);
    if (b1 === "attendance") return db.att.filter((x) => x.member_id === m.id).sort((x, y) => y.day.localeCompare(x.day)).map(attOut);
    if (b1 === "workout") return workoutOut(m.id);
    if (b1 === "upi") {
      const p = db.plans.find((x) => x.id === Number(b2)) ?? fail(404, "Plan not found");
      const r = quote(db, p, m, q.get("code"));
      const g = db.gym, note = `${m.code} ${p.name}`;
      return { link: `upi://pay?pa=${encodeURIComponent(g.upi_id)}&pn=${encodeURIComponent(g.upi_payee_name || g.gym_name)}&am=${r.price}.00&cu=INR&tn=${encodeURIComponent(note)}`,
        amount: r.price, list_price: p.price, discount: r.discount, offer_name: r.offer_name, upi_id: g.upi_id, payee: g.upi_payee_name || g.gym_name, note };
    }
    if (b1 === "payments" && M_ === "GET") return db.pays.filter((p) => p.member_id === m.id).sort((x, y) => y.id - x.id).map(payOut);
    if (b1 === "payments") {
      const p = db.plans.find((x) => x.id === Number(b.plan_id)) ?? fail(404, "Plan not found");
      const utr = String(b.utr ?? "").replace(/\s/g, "").toUpperCase();
      if (db.pays.some((x) => x.utr === utr)) fail(409, "This UTR / reference number was already submitted");
      if (db.pays.some((x) => x.member_id === m.id && x.status === "pending")) fail(409, "You already have a payment waiting for verification");
      const r = quote(db, p, m, (b.code as string) ?? null);
      const ms = newMembership(m, p, r, "pending");
      const pay: PAY = { id: nid(), member_id: m.id, membership_id: ms.id, amount: r.price, method: "upi", utr, status: "pending", note: null, receipt_no: null, created_at: nowStamp(), verified_at: null };
      db.pays.push(pay);
      return payOut(pay);
    }
    if (b1 === "checkin") {
      const t = String(b.token ?? "");
      if (t !== kioskToken(0) && t !== kioskToken(1)) fail(400, "This QR code has expired. Please scan the screen again.");
      const r = checkIn(m, "qr");
      return { created: r.created, attendance: attOut(r.a) };
    }
  }
  return fail(404, "Not found");
}

function workoutOut(memberId: number) {
  const w = db.workouts[memberId];
  const tr = w?.trainer_id ? db.users.find((x) => x.id === w.trainer_id) : null;
  return { member_id: memberId, workout: w?.workout ?? "", diet: w?.diet ?? "", trainer_id: w?.trainer_id ?? null, trainer_name: tr?.name ?? null, updated_at: w?.updated_at ?? null };
}

function dashboard(u: U) {
  const t = today();
  const outs = db.members.filter((m) => userOf(m).is_active).map(memberOut);
  const counts = { active: 0, expiring: 0, expired: 0, new: 0 };
  outs.forEach((o) => counts[o.status]++);
  const data: Record<string, unknown> = {
    gym_name: db.gym.gym_name, total_members: outs.length, counts,
    checkins_today: db.att.filter((a) => a.day === t).length,
    pending_payments: db.pays.filter((p) => p.status === "pending").length,
    expiring: outs.filter((o) => o.status === "expiring").sort((a, b) => a.days_left! - b.days_left!),
    recently_expired: outs.filter((o) => o.status === "expired" && o.days_left! >= -30).sort((a, b) => b.days_left! - a.days_left!),
    new_this_month: db.members.filter((m) => m.joined_on.slice(0, 7) === t.slice(0, 7)).length,
    blocked_punches_today: [...new Map(db.punches.filter((p) => p.result !== "ok" && p.result !== "unknown" && p.punched_at.startsWith(t)).map((p) => {
      const m = memberById(p.member_id!); return [m.id, { member_id: m.id, name: userOf(m).name, code: m.code, phone: userOf(m).phone, at: p.punched_at }];
    })).values()],
    running_offers: db.offers.filter((o) => o.is_active && o.starts_on <= t && t <= o.ends_on).map((o) => ({ id: o.id, name: o.name, ends_on: o.ends_on, code: o.code })),
    attendance_14d: Array.from({ length: 14 }, (_, i) => { const d = addDays(t, i - 13); return { day: d, count: db.att.filter((a) => a.day === d).length }; }),
  };
  if (u.role === "owner") {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
    data.revenue_by_month = months.map((d) => {
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      return { month: d.toLocaleDateString("en-IN", { month: "short", year: "numeric" }), amount: db.pays.filter((p) => p.status === "verified" && p.verified_at?.startsWith(key)).reduce((s, p) => s + p.amount, 0) };
    });
    data.revenue_this_month = (data.revenue_by_month as { amount: number }[])[5].amount;
    data.revenue_today = db.pays.filter((p) => p.status === "verified" && p.verified_at?.startsWith(t)).reduce((s, p) => s + p.amount, 0);
  }
  return data;
}
