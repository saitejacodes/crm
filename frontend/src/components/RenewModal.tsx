import { useEffect, useState } from "react";
import { api, fmtDate, inr, todayISO, type Member, type Quote } from "../api";
import { useAuth } from "../auth";
import { Button, ErrorText, Field, Modal, Segmented } from "../ui";

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export default function RenewModal({ member, onClose, onDone }: { member: Member; onClose: () => void; onDone: (msg: string) => void }) {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);
  const [method, setMethod] = useState<"cash" | "upi">("cash");
  const [utr, setUtr] = useState("");
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const qs = `/api/quotes?member_id=${member.id}${applied ? `&code=${encodeURIComponent(applied)}` : ""}`;
    api<Quote[]>(qs).then((q) => { setQuotes(q); setPlanId((p) => p ?? q[0]?.plan_id ?? null); }).catch((e) => setErr(e.message));
  }, [member.id, applied]);

  const q = quotes?.find((x) => x.plan_id === planId);
  const running = member.status === "active" || member.status === "expiring";
  const today = todayISO();
  const start = running && member.end_date ? addDays(member.end_date, 1) : today;
  const end = q ? addDays(start, q.duration_days - 1) : null;
  const finalPrice = custom && amount !== "" ? Number(amount) : q?.price ?? 0;

  async function save() {
    if (!q) return;
    setErr("");
    setBusy(true);
    try {
      await api(`/api/members/${member.id}/payments`, {
        body: {
          plan_id: q.plan_id, method, utr: method === "upi" && utr ? utr : null, code: applied || null,
          ...(custom ? { amount: Number(amount), discount_reason: reason || null } : {}),
        },
      });
      onDone(`Payment recorded. ${member.name} is active till ${fmtDate(end)}.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`Renew ${member.name}`} onClose={onClose}
      sub={running ? `Adds on after the current plan ends on ${fmtDate(member.end_date)}, so no days are lost.` : "Starts today."}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {quotes?.map((x) => {
            const on = x.plan_id === planId;
            return (
              <button key={x.plan_id} onClick={() => setPlanId(x.plan_id)} aria-pressed={on}
                className={`rounded-lg border-2 px-3.5 py-3 text-left ${on ? "border-plate-blue bg-plate-blue-soft" : "border-line bg-white hover:border-[#b7bdb9]"}`}>
                <span className="block font-semibold">{x.plan_name}</span>
                <span className="block text-sm text-muted">
                  {x.discount ? <><s>{inr(x.list_price)}</s> <span className="font-semibold text-plate-green">{inr(x.price)}</span></> : inr(x.price)}
                </span>
              </button>
            );
          })}
        </div>
        {q?.offer_name && !custom && <p className="rounded-md bg-plate-green-soft px-3 py-2 text-sm text-[#14663b]">{q.offer_name}: {inr(q.discount)} off</p>}

        <div className="flex gap-2">
          <input className="input" placeholder="Offer code (optional)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Button variant="line" onClick={() => setApplied(code.trim())} disabled={!code.trim() || code.trim() === applied}>Apply</Button>
        </div>

        <Segmented label="Paid by" value={method} onChange={setMethod}
          options={[{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI at desk" }]} />
        {method === "upi" && <Field label="UTR (optional)"><input className="input" value={utr} onChange={(e) => setUtr(e.target.value)} /></Field>}

        {isOwner && (
          <div className="rounded-lg border border-dashed border-[#cfd3ce] p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={custom} onChange={(e) => { setCustom(e.target.checked); setAmount(String(q?.price ?? "")); }} />
              Give a custom price (owner only)
            </label>
            {custom && (
              <div className="mt-3 grid grid-cols-[120px_1fr] gap-2">
                <Field label="Amount, ₹"><input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></Field>
                <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Couple membership" /></Field>
              </div>
            )}
          </div>
        )}

        <div className="flex items-baseline justify-between rounded-lg bg-chalk px-4 py-3">
          <span>New end date <strong>{fmtDate(end)}</strong></span>
          <span className="h-display text-2xl font-bold">{inr(finalPrice)}</span>
        </div>
        <ErrorText>{err}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} busy={busy} disabled={!q || (custom && amount === "")}>Record {inr(finalPrice)} payment</Button>
        </div>
      </div>
    </Modal>
  );
}
