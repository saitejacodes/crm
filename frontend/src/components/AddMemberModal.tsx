import { useState, type FormEvent } from "react";
import { api, inr, type Member, type Quote, type User } from "../api";
import { useApi } from "../hooks";
import { Button, ErrorText, Field, Modal } from "../ui";

export default function AddMemberModal({ onClose, onAdded }: { onClose: () => void; onAdded: (m: Member) => void }) {
  const { data: quotes } = useApi<Quote[]>("/api/quotes");
  const { data: trainers } = useApi<User[]>("/api/users?role=trainer");
  const [f, setF] = useState({ name: "", phone: "", gender: "", trainer_id: "", plan_id: "", payment_method: "cash", utr: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const chosen = quotes?.find((q) => String(q.plan_id) === f.plan_id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const m = await api<Member>("/api/members", {
        body: {
          name: f.name.trim(), phone: f.phone, gender: f.gender || null,
          trainer_id: f.trainer_id ? Number(f.trainer_id) : null,
          plan_id: f.plan_id ? Number(f.plan_id) : null,
          payment_method: f.plan_id ? f.payment_method : null,
          utr: f.payment_method === "upi" && f.utr ? f.utr : null,
        },
      });
      onAdded(m);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Add member" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Full name"><input className="input" value={f.name} onChange={set("name")} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile number"><input className="input" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="10 digits" required /></Field>
          <Field label="Gender">
            <select className="input" value={f.gender} onChange={set("gender")}>
              <option value="">Prefer not to say</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Trainer">
          <select className="input" value={f.trainer_id} onChange={set("trainer_id")}>
            <option value="">No trainer</option>
            {trainers?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Plan">
          <select className="input" value={f.plan_id} onChange={set("plan_id")}>
            <option value="">Pay later</option>
            {quotes?.map((q) => (
              <option key={q.plan_id} value={q.plan_id}>
                {q.plan_name}, {inr(q.price)}{q.discount ? ` (${q.offer_name}, was ${inr(q.list_price)})` : ""}
              </option>
            ))}
          </select>
        </Field>
        {chosen && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid by">
              <select className="input" value={f.payment_method} onChange={set("payment_method")}>
                <option value="cash">Cash</option><option value="upi">UPI at desk</option>
              </select>
            </Field>
            {f.payment_method === "upi" && <Field label="UTR (optional)"><input className="input" value={f.utr} onChange={set("utr")} /></Field>}
          </div>
        )}
        <p className="text-sm text-muted">Their first password is their mobile number. The app asks them to change it.</p>
        <ErrorText>{err}</ErrorText>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={busy}>{chosen ? `Add and collect ${inr(chosen.price)}` : "Add member"}</Button>
        </div>
      </form>
    </Modal>
  );
}
