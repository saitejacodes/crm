import { useState, type FormEvent } from "react";
import { api, inr, type Plan } from "../api";
import { useApi } from "../hooks";
import { Button, ErrorText, Field, Modal, PageTitle, Spinner, useToast } from "../ui";

const STRIPES = ["#1b8a4f", "#22679a", "#e0a800", "#c8283b"];

export default function Plans() {
  const toast = useToast();
  const { data, reload } = useApi<Plan[]>("/api/plans?include_inactive=true");
  const [edit, setEdit] = useState<Partial<Plan> | null>(null);

  return (
    <div>
      <PageTitle actions={<Button onClick={() => setEdit({ name: "", duration_days: 30, price: 0, is_active: true })}>Add plan</Button>}>Plans and prices</PageTitle>
      <p className="mb-5 max-w-[60ch] text-muted">Members pick from these when they renew. A new price only applies to new payments. For short-term discounts, use Offers instead of changing the price.</p>
      {!data ? <Spinner /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.map((p, i) => (
            <div key={p.id} className={`flex flex-col gap-2 rounded-[10px] border border-line bg-white p-5 ${p.is_active ? "" : "opacity-60"}`}>
              <span aria-hidden className="h-1.5 w-12 rounded" style={{ background: STRIPES[i % 4] }} />
              <div className="h-display text-[26px] font-bold">{p.name}</div>
              <div className="text-sm text-muted">{p.duration_days} days{p.is_active ? "" : ", hidden from members"}</div>
              <div className="h-display tabular text-[32px] font-semibold">{inr(p.price)}</div>
              <div className="text-[13px] text-muted">{inr(Math.round(p.price / (p.duration_days / 30)))} a month</div>
              <Button size="sm" variant="line" className="mt-auto self-start" onClick={() => setEdit(p)}>Edit</Button>
            </div>
          ))}
        </div>
      )}
      {edit && <PlanForm p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); toast("Plan saved."); }} />}
    </div>
  );
}

function PlanForm({ p, onClose, onSaved }: { p: Partial<Plan>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: p.name ?? "", duration_days: String(p.duration_days ?? 30), price: String(p.price ?? ""), description: p.description ?? "", is_active: p.is_active ?? true });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const body = { ...f, duration_days: Number(f.duration_days), price: Number(f.price) };
      await api(p.id ? `/api/plans/${p.id}` : "/api/plans", { method: p.id ? "PUT" : "POST", body });
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title={p.id ? `Edit ${p.name}` : "Add plan"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Plan name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Length in days"><input className="input" inputMode="numeric" value={f.duration_days} onChange={(e) => setF({ ...f, duration_days: e.target.value.replace(/\D/g, "") })} required /></Field>
          <Field label="Price in rupees"><input className="input" inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, "") })} required /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Show this plan to members</label>
        <ErrorText>{err}</ErrorText>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save plan</Button></div>
      </form>
    </Modal>
  );
}
