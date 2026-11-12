export type Role = "owner" | "staff" | "trainer" | "member";

export interface User {
  id: number; name: string; phone: string; email: string | null; role: Role; is_active: boolean;
  member_id: number | null;
}
export type MemberStatus = "active" | "expiring" | "expired" | "new";
export interface Member {
  id: number; user_id: number; code: string; name: string; phone: string; email: string | null;
  gender: string | null; dob: string | null; address: string | null; emergency_contact: string | null;
  joined_on: string; trainer_id: number | null; trainer_name: string | null; notes: string | null;
  is_active: boolean; device_enabled: boolean | null; has_fingerprint: boolean; status: MemberStatus; end_date: string | null; days_left: number | null; plan: string | null;
}
export interface Plan { id: number; name: string; duration_days: number; price: number; description: string | null; is_active: boolean }
export interface Membership { id: number; plan_id: number; plan_name: string; start_date: string | null; end_date: string | null; amount: number; list_price: number | null; discount: number; discount_note: string | null; status: string; created_at: string | null }
export interface Payment {
  id: number; member_id: number; member_name: string; member_code: string; amount: number; method: string;
  utr: string | null; status: "pending" | "verified" | "rejected"; note: string | null; receipt_no: string | null;
  plan_name: string | null; list_price: number | null; discount: number; discount_note: string | null;
  created_at: string | null; verified_at: string | null;
}
export interface Offer {
  id: number; name: string; kind: "percent" | "flat"; value: number; starts_on: string; ends_on: string;
  plan_ids: number[]; code: string | null; new_members_only: boolean; is_active: boolean;
  state: "running" | "upcoming" | "ended" | "paused"; times_used: number;
}
export interface Quote { plan_id: number; plan_name: string; duration_days: number; list_price: number; discount: number; price: number; offer_name: string | null }
export interface Device { id: number; serial: string; name: string; is_active: boolean; last_seen: string | null; online: boolean; pending_commands: number }
export interface Punch { id: number; pin: string; member_id: number | null; member_name: string | null; member_code: string | null; punched_at: string; result: "ok" | "expired" | "unknown" | "disabled" }
export interface Attendance { id: number; member_id: number; member_name: string; member_code: string; day: string; check_in_at: string; method: string }
export interface Workout { member_id: number; workout: string; diet: string; trainer_id: number | null; trainer_name: string | null; updated_at: string | null }
export interface GymSettings { gym_name: string; upi_id: string; upi_payee_name: string; phone: string; address: string; timings: string; expiry_alert_days: number }

const BASE = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "gym_token";

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string | null) => {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function errorText(body: unknown): string {
  const d = (body as { detail?: unknown })?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d.length) {
    const e = d[0] as { loc?: string[]; msg?: string };
    const field = e.loc?.[e.loc.length - 1];
    return `${field ? field.replace(/_/g, " ") + ": " : ""}${(e.msg ?? "invalid").replace(/^Value error, /, "")}`;
  }
  return "Something went wrong";
}

export const IS_DEMO = import.meta.env.VITE_DEMO === "1";

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  if (IS_DEMO) {
    const { demoApi } = await import("./demo/server");
    try {
      return (await demoApi(opts.method ?? (opts.body !== undefined ? "POST" : "GET"), path, opts.body as Record<string, unknown> | undefined, tokenStore.get())) as T;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && tokenStore.get()) { tokenStore.set(null); window.location.hash = "#/login"; window.location.reload(); }
      throw e;
    }
  }
  const headers: Record<string, string> = {};
  const t = tokenStore.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet.");
  }
  if (res.status === 401 && t) {
    tokenStore.set(null);
    window.location.href = "/login";
  }
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, errorText(body));
  return body as T;
}

export async function downloadFile(path: string, filename: string) {
  if (IS_DEMO) {
    const text = await api<string>(path);
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: filename }).click();
    return;
  }
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) throw new ApiError(res.status, "Download failed");
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
}
