import { useState, type FormEvent } from "react";
import { api, fmtDate, inr, todayISO, type Offer, type Plan } from "../api";
import { useApi } from "../hooks";
import { Button, Empty, ErrorText, Field, Modal, PageTitle, Segmented, Spinner, useToast } from "../ui";

const STATE: Record<Offer["state"], { label: string; bg: string; ink: string }> = {
  running: { label: "Running", bg: "#e3f3ea", ink: "#14663b" },
  upcoming: { label: "Starts later", bg: "#e3eff8", ink: "#1b557f" },
  ended: { label: "Ended", bg: "#eceeea", ink: "#4a5256" },
  paused: { label: "Paused", bg: "#fdf3d4", ink: "#6b5100" },
};

/** Ready-made starting points for the usual Indian gym calendar. */
const PRESETS = [
  { name: "Diwali Offer", kind: "percent" as const, value: 20, days: 10 },
  { name: "New Year Offer", kind: "percent" as const, value: 25, days: 15 },
  { name: "Gym Anniversary", kind: "flat" as const, value: 500, days: 7 },
  { name: "Independence Day", kind: "percent" as const, value: 15, days: 3 },
];

type Draft = Omit<Offer, "id" | "state" | "times_used">;

function blank(): Draft {
  const t = todayISO();
  return { name: "", kind: "percent", value: 10, starts_on: t, ends_on: t, plan_ids: [], code: null, new_members_only: false, is_active: true };
}

function plusDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export default function Offers() {
  const toast = useToast();
  const { data, reload } = useApi<Offer[]>("/api/offers");
  const { data: plans } = useApi<Plan[]>("/api/plans");
  const [edit, setEdit] = useState<{ id: number | null; d: Draft } | null>(null);

  const off = (o: Pick<Offer, "kind" | "value">) => (o.kind === "percent" ? `${o.value}% off` : `${inr(o.value)} off`);
  const planNames = (ids: number[]) => (!ids.length ? "All plans" : ids.map((i) => plans?.find((p) => p.id === i)?.name).filter(Boolean).join(", "));

  async function togglePause(o: Offer) {
    const { id, state, times_used, ...rest } = o; void state; void times_used;
    try {
      await api(`/api/offers/${id}`, { method: "PUT", body: { ...rest, is_active: !o.is_active } });
      toast(o.is_active ? `${o.name} paused.` : `${o.name} is back on.`);
      reload();
    } catch (e) { toast((e as Error).message); }
  }

  return (
    <div>
      <PageTitle actions={<Button onClick={() => setEdit({ id: null, d: blank() })}>Create offer</Button>}>Offers</PageTitle>
      <p className="mb-5 max-w-[68ch] text-muted">
        Offers apply on their dates by themselves, in the member app and at the desk. Give an offer a code if only people who know the code should get it. Only you can create or change offers.
      </p>

      <div className="mb-7 flex flex-wrap gap-2">
        <span className="self-center text-sm text-muted">Quick start:</span>
        {PRESETS.map((p) => (
          <button key={p.name} className="min-h-[34px] rounded-full border border-[#cfd3ce] bg-white px-3.5 text-sm font-semibold hover:border-ink"
            onClick={() => setEdit({ id: null, d: { ...blank(), name: p.name, kind: p.kind, value: p.value, ends_on: plusDays(todayISO(), p.days - 1) } })}>
            {p.name}
          </button>
        ))}
      </div>

      {!data ? <Spinner /> : !data.length ? <Empty>No offers yet. Use a quick start above, or create your own.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((o) => {
            const st = STATE[o.state];
            return (
              <article key={o.id} className="flex flex-col gap-3 rounded-[10px] border border-line bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="h-display text-[26px] font-bold leading-tight">{o.name}</h2>
                  <span className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold" style={{ background: st.bg, color: st.ink }}>{st.label}</span>
                </div>
                <div className="h-display text-[40px] font-bold leading-none text-plate-blue">{off(o)}</div>
                <dl className="space-y-1 text-sm">
                  <div><dt className="inline text-muted">Dates </dt><dd className="inline">{fmtDate(o.starts_on)} to {fmtDate(o.ends_on)}</dd></div>
                  <div><dt className="inline text-muted">Plans </dt><dd className="inline">{planNames(o.plan_ids)}</dd></div>
                  <div><dt className="inline text-muted">Who </dt><dd className="inline">{o.new_members_only ? "New members only" : "Everyone"}{o.code ? `, with code ${o.code}` : ", automatic"}</dd></div>
                  <div><dt className="inline text-muted">Used </dt><dd className="inline">{o.times_used} {o.times_used === 1 ? "time" : "times"}</dd></div>
                </dl>
                <div className="mt-auto flex gap-2 pt-1">
                  <Button size="sm" variant="line" onClick={() => { const { id, state, times_used, ...d } = o; void state; void times_used; setEdit({ id, d }); }}>Edit</Button>
                  {o.state !== "ended" && <Button size="sm" variant="ghost" onClick={() => togglePause(o)}>{o.is_active ? "Pause" : "Turn back on"}</Button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {edit && plans && <OfferForm init={edit.d} id={edit.id} plans={plans} onClose={() => setEdit(null)}
        onSaved={(name) => { setEdit(null); reload(); toast(`${name} saved.`); }} />}
    </div>
  );
}

function OfferForm({ init, id, plans, onClose, onSaved }: { init: Draft; id: number | null; plans: Plan[]; onClose: () => void; onSaved: (name: string) => void }) {
  const [d, setD] = useState<Draft>(init);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const active = plans.filter((p) => p.is_active);
  const sample = active[0];
  const sampleOff = sample ? (d.kind === "percent" ? Math.floor((sample.price * d.value) / 100) : Math.min(sample.price, d.value)) : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api(id ? `/api/offers/${id}` : "/api/offers", { method: id ? "PUT" : "POST", body: { ...d, code: d.code || null } });
      onSaved(d.name);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const togglePlan = (pid: number) => setD({ ...d, plan_ids: d.plan_ids.includes(pid) ? d.plan_ids.filter((x) => x !== pid) : [...d.plan_ids, pid] });

  return (
    <Modal title={id ? `Edit ${init.name}` : "Create offer"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Offer name" hint="Members see this name, e.g. Diwali Offer."><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required /></Field>
        <div className="flex flex-wrap items-end gap-3">
          <Segmented label="Discount type" value={d.kind} onChange={(kind) => setD({ ...d, kind })}
            options={[{ value: "percent", label: "Percent off" }, { value: "flat", label: "Rupees off" }]} />
          <div className="w-[130px]">
            <Field label={d.kind === "percent" ? "Percent" : "Rupees"}>
              <input className="input tabular" inputMode="numeric" value={d.value} onChange={(e) => setD({ ...d, value: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts"><input className="input" type="date" value={d.starts_on} onChange={(e) => setD({ ...d, starts_on: e.target.value })} required /></Field>
          <Field label="Ends (last day)"><input className="input" type="date" value={d.ends_on} min={d.starts_on} onChange={(e) => setD({ ...d, ends_on: e.target.value })} required /></Field>
        </div>
        <fieldset>
          <legend className="label">Plans (none ticked means all plans)</legend>
          <div className="flex flex-wrap gap-2">
            {active.map((p) => (
              <label key={p.id} className={`flex min-h-[36px] cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${d.plan_ids.includes(p.id) ? "border-plate-blue bg-plate-blue-soft" : "border-line"}`}>
                <input type="checkbox" checked={d.plan_ids.includes(p.id)} onChange={() => togglePlan(p.id)} />{p.name}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Offer code (optional)" hint="Leave empty to apply it to everyone automatically.">
          <input className="input uppercase" value={d.code ?? ""} onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase() })} placeholder="e.g. DIWALI20" />
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.new_members_only} onChange={(e) => setD({ ...d, new_members_only: e.target.checked })} />Only for new members joining for the first time</label>
        {sample && <p className="rounded-md bg-chalk px-3 py-2 text-sm">Example: {sample.name} becomes <strong>{inr(sample.price - sampleOff)}</strong> instead of {inr(sample.price)}.</p>}
        <ErrorText>{err}</ErrorText>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save offer</Button></div>
      </form>
    </Modal>
  );
}
