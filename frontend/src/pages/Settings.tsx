import { useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, type GymSettings } from "../api";
import { useApi } from "../hooks";
import { Button, ErrorText, Field, PageTitle, Panel, Spinner, useToast } from "../ui";

export default function Settings() {
  const toast = useToast();
  const { data } = useApi<GymSettings>("/api/settings");
  const [f, setF] = useState<GymSettings | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF(data); }, [data]);
  if (!f) return <Spinner />;
  const set = (k: keyof GymSettings) => (e: { target: { value: string } }) => setF({ ...f, [k]: k === "expiry_alert_days" ? Number(e.target.value) || 0 : e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api("/api/settings", { method: "PUT", body: f }); toast("Settings saved."); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const sample = f.upi_id ? `upi://pay?pa=${encodeURIComponent(f.upi_id)}&pn=${encodeURIComponent(f.upi_payee_name || f.gym_name)}&am=1.00&cu=INR&tn=Test` : "";

  return (
    <div className="max-w-[960px]">
      <PageTitle>Gym settings</PageTitle>
      <div className="flex flex-wrap items-start gap-6">
        <Panel className="min-w-0 flex-1 basis-[380px]">
          <form onSubmit={save} className="space-y-4">
            <Field label="Gym name"><input className="input" value={f.gym_name} onChange={set("gym_name")} required /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Front desk phone"><input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
              <Field label="Remind members this many days before expiry"><input className="input" value={f.expiry_alert_days} onChange={set("expiry_alert_days")} inputMode="numeric" /></Field>
            </div>
            <Field label="Address"><input className="input" value={f.address} onChange={set("address")} /></Field>
            <Field label="Timings" hint="Shown to members on the sign-in page and in their app."><input className="input" value={f.timings} onChange={set("timings")} /></Field>
            <Field label="UPI ID that receives payments" hint="From GPay, PhonePe, Paytm or your bank's business app, e.g. yourgym@okaxis.">
              <input className="input" value={f.upi_id} onChange={set("upi_id")} placeholder="yourgym@okaxis" />
            </Field>
            <Field label="Name shown in the UPI app"><input className="input" value={f.upi_payee_name} onChange={set("upi_payee_name")} placeholder={f.gym_name} /></Field>
            <ErrorText>{err}</ErrorText>
            <Button type="submit" busy={busy}>Save settings</Button>
          </form>
        </Panel>
        <div className="flex w-full flex-col items-center gap-3 rounded-[10px] bg-rubber p-6 text-center text-chalk sm:w-[280px]">
          <div className="text-sm text-[#a3abaf]">Test it: scan to pay ₹1 to yourself</div>
          {sample ? <div className="rounded-lg bg-white p-3"><QRCodeSVG value={sample} size={196} /></div> : <p className="py-10 text-sm text-[#a3abaf]">Add your UPI ID to see the payment QR members get.</p>}
          <div className="h-display text-[22px] font-semibold">{f.upi_id}</div>
        </div>
      </div>
    </div>
  );
}
