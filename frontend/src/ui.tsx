import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Member, MemberStatus } from "./api";

/* ---------- buttons ---------- */
type Variant = "blue" | "line" | "ghost" | "red" | "dark";
const VARIANTS: Record<Variant, string> = {
  blue: "bg-plate-blue text-white hover:bg-plate-blue-dark",
  line: "bg-white text-ink border border-[#cfd3ce] hover:border-ink",
  ghost: "bg-transparent text-muted hover:text-ink",
  red: "bg-white text-[#a51f30] border border-[#efc3c9] hover:border-[#a51f30]",
  dark: "bg-rubber text-chalk hover:bg-rubber-2",
};
export function Button({ variant = "blue", size = "md", busy, className = "", children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; busy?: boolean }) {
  const sz = size === "sm" ? "min-h-[34px] px-3 text-sm" : size === "lg" ? "min-h-[50px] px-5 text-base w-full" : "min-h-[40px] px-4 text-[15px]";
  return (
    <button {...rest} disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors disabled:opacity-60 ${sz} ${VARIANTS[variant]} ${className}`}>
      {busy ? "Working…" : children}
    </button>
  );
}

/* ---------- headings / surfaces ---------- */
export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 className="h-display text-[40px] font-bold leading-[1.05] sm:text-[44px]">{children}</h1>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Panel({ title, aside, children, className = "", pad = true }:
  { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`overflow-hidden rounded-[10px] border border-line bg-white ${className}`}>
      {title && (
        <div className="flex items-baseline justify-between gap-3 border-b border-[#eceeea] px-5 py-4">
          <h2 className="h-display text-2xl font-semibold">{title}</h2>
          {aside && <span className="text-sm text-muted">{aside}</span>}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}
export const Empty = ({ children }: { children: ReactNode }) => <p className="px-5 py-7 text-muted">{children}</p>;
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-muted">{hint}</span>}
    </label>
  );
}
export const ErrorText = ({ children }: { children: ReactNode }) =>
  children ? <p role="alert" className="text-sm text-[#a51f30]">{children}</p> : null;

/* ---------- membership status in plate colours ---------- */
const ST: Record<MemberStatus, { bg: string; ink: string; dot: string }> = {
  active: { bg: "#e3f3ea", ink: "#14663b", dot: "#1b8a4f" },
  expiring: { bg: "#fdf3d4", ink: "#6b5100", dot: "#e0a800" },
  expired: { bg: "#fbe4e7", ink: "#a51f30", dot: "#c8283b" },
  new: { bg: "#eceeea", ink: "#4a5256", dot: "#8a9296" },
};
export const statusColor = (s: MemberStatus) => ST[s].dot;
export function statusText(m: Pick<Member, "status" | "days_left">) {
  const d = m.days_left ?? 0;
  if (m.status === "new") return "No plan yet";
  if (m.status === "expired") return `Expired ${-d} ${d === -1 ? "day" : "days"} ago`;
  if (m.status === "expiring") return d === 0 ? "Ends today" : `Ends in ${d} ${d === 1 ? "day" : "days"}`;
  return "Active";
}
export function PlateDot({ status, size = 9 }: { status: MemberStatus; size?: number }) {
  return <span aria-hidden className="inline-block flex-none rounded-full"
    style={{ width: size, height: size, background: ST[status].dot, boxShadow: `inset 0 0 0 ${Math.round(size / 3.2)}px rgba(0,0,0,.12)` }} />;
}
export function StatusPill({ m }: { m: Pick<Member, "status" | "days_left"> }) {
  const c = ST[m.status];
  return (
    <span className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-full py-[3px] pl-2 pr-[10px] text-[13px] font-semibold"
      style={{ background: c.bg, color: c.ink }}>
      <PlateDot status={m.status} />{statusText(m)}
    </span>
  );
}

/** The signature element: a bumper plate whose ring fills with the days left. */
export function PlateGauge({ status, daysLeft, totalDays, size = 200 }:
  { status: MemberStatus; daysLeft: number | null; totalDays: number; size?: number }) {
  const C = 2 * Math.PI * 74;
  const left = daysLeft ?? 0;
  const frac = status === "new" ? 0 : Math.max(0, Math.min(1, (left + 1) / Math.max(totalDays, 1)));
  const big = status === "new" ? "0" : String(Math.abs(left));
  const small = status === "new" ? "no plan" : left < 0 ? "days overdue" : left === 1 ? "day left" : "days left";
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={`${big} ${small}`}>
      <circle cx="100" cy="100" r="92" fill="#0c1f2b" />
      <circle cx="100" cy="100" r="74" fill="none" stroke="#1f4255" strokeWidth="18" />
      <circle cx="100" cy="100" r="74" fill="none" stroke={ST[status].dot} strokeWidth="18" strokeLinecap="round"
        strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 100 100)"
        style={{ transition: "stroke-dasharray .6s ease" }} />
      <circle cx="100" cy="100" r="52" fill="#14303f" />
      <text x="100" y="104" textAnchor="middle" fill="#f4f5f3" style={{ font: "700 46px 'Barlow Condensed', sans-serif" }}>{big}</text>
      <text x="100" y="128" textAnchor="middle" fill="#a3abaf" style={{ font: "400 14px Barlow, sans-serif" }}>{small}</text>
    </svg>
  );
}

/* ---------- segmented filter ---------- */
export function Segmented<T extends string>({ options, value, onChange, label }:
  { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} aria-pressed={o.value === value}
          className={`min-h-[34px] rounded-md border px-3 text-sm font-semibold ${o.value === value ? "border-rubber bg-rubber text-white" : "border-[#cfd3ce] bg-white text-ink hover:border-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- modal ---------- */
export function Modal({ title, sub, onClose, children, wide }:
  { title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(28,33,36,.55)] p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-xl ${wide ? "sm:max-w-2xl" : "sm:max-w-[500px]"}`}>
        <div className="mb-4">
          <h2 className="h-display text-[28px] font-bold leading-tight">{title}</h2>
          {sub && <div className="text-sm text-muted">{sub}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const t = useRef<number>(0);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setMsg(""), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 sm:bottom-7">
        {msg && <div role="status" className="rounded-lg bg-rubber px-[18px] py-3 text-[15px] text-chalk shadow-[0_6px_24px_rgba(28,33,36,.25)]">{msg}</div>}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- brand mark: a bumper plate ---------- */
export function PlateMark({ size = 40 }: { size?: number }) {
  return <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={size} height={size} className="flex-none rounded-lg" style={{ width: size, height: size }} />;
}

export function Spinner() {
  return <p className="px-5 py-7 text-muted" role="status">Loading…</p>;
}
