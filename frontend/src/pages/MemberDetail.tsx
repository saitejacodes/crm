import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fmtDate, inr, todayISO, whatsappLink, type Attendance, type Member, type Membership, type Payment, type User, type Workout } from "../api";
import { useAuth } from "../auth";
import RenewModal from "../components/RenewModal";
import { useApi } from "../hooks";
import { Button, ErrorText, Field, Modal, Panel, PlateGauge, Spinner, StatusPill, useToast } from "../ui";
import { reminderText } from "./Dashboard";

export default function MemberDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const staff = user?.role === "owner" || user?.role === "staff";
  const { data: m, reload } = useApi<Member>(`/api/members/${id}`);
  const { data: memberships, reload: reloadMs } = useApi<Membership[]>(`/api/members/${id}/memberships`);
  const { data: payments, reload: reloadPay } = useApi<Payment[]>(staff ? `/api/members/${id}/payments` : null);
  const { data: visits, reload: reloadVisits } = useApi<Attendance[]>(`/api/members/${id}/attendance`);
  const { data: workout } = useApi<Workout>(`/api/members/${id}/workout`);
  const { data: gym } = useApi<{ gym_name: string }>("/api/public/gym");
  const [renew, setRenew] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!m) return <Spinner />;
  const current = memberships?.find((x) => x.status === "active" && x.end_date === m.end_date) ?? memberships?.find((x) => x.status === "active");
  const totalDays = current?.start_date && current.end_date
    ? Math.round((new Date(current.end_date).getTime() - new Date(current.start_date).getTime()) / 86400000) + 1 : 30;
  const month = todayISO().slice(0, 7);
  const upcoming = memberships?.filter((x) => x.status === "active" && x.start_date && x.start_date > todayISO()) ?? [];
  const planLabel = (m.plan ?? "None") + (upcoming.length ? `, then ${upcoming.map((u) => u.plan_name).join(", then ")} from ${fmtDate(upcoming[upcoming.length - 1].start_date)}` : "");
  const monthVisits = visits?.filter((v) => v.day.startsWith(month)).length ?? 0;
  const inToday = visits?.some((v) => v.day === todayISO());

  async function checkIn() {
    try {
      await api(`/api/attendance/manual/${m!.id}`, { method: "POST" });
      toast(`${m!.name} checked in.`);
      reloadVisits();
    } catch (e) { toast((e as Error).message); }
  }

  return (
    <div className="space-y-5">
      <Link to="/members" className="inline-block text-sm font-semibold text-muted hover:text-ink">Back to members</Link>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex w-full flex-col items-center gap-4 rounded-[10px] border border-line bg-white p-6 text-center md:w-[340px]">
          <PlateGauge status={m.status} daysLeft={m.days_left} totalDays={totalDays} />
          <div>
            <div className="h-display text-[30px] font-bold leading-tight">{m.name}</div>
            <div className="text-sm text-muted">{m.code}, member since {fmtDate(m.joined_on)}</div>
          </div>
          {m.is_active ? <StatusPill m={m} /> : <span className="text-sm font-semibold text-[#a51f30]">Account disabled</span>}
          <div className="flex w-full flex-col gap-2">
            {staff && <Button onClick={() => setRenew(true)}>Renew or add plan</Button>}
            {staff && <Button variant="line" onClick={checkIn} disabled={inToday}>{inToday ? "Checked in today" : "Check in now"}</Button>}
            {gym && <a className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-[#cfd3ce] bg-white px-4 font-semibold text-ink hover:border-ink hover:text-ink"
              href={whatsappLink(m.phone, m.status === "active" ? `Hi ${m.name.split(" ")[0]}, ` : reminderText(m, gym.gym_name))} target="_blank" rel="noopener">Message on WhatsApp</a>}
            {staff && <Button variant="ghost" onClick={() => setEditing(true)}>Edit details</Button>}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 basis-[420px] flex-col gap-5">
          <Panel title="Details">
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-3.5">
              {[
                ["Phone", m.phone], ["Current plan", planLabel], ["Paid till", m.end_date ? fmtDate(m.end_date) : "—"],
                ["Trainer", m.trainer_name ?? "Not assigned"], ["Visits this month", `${monthVisits}${inToday ? ", in today" : ""}`],
                ["Emergency contact", m.emergency_contact || "Not added"],
                ["Fingerprint machine", `User ID ${m.id}, ${m.has_fingerprint ? "fingerprint saved" : "fingerprint not enrolled yet"}`],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-[13px] text-muted">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {m.notes && <p className="mt-4 rounded-md bg-chalk px-3 py-2 text-sm">{m.notes}</p>}
          </Panel>

          {staff && (
            <Panel title="Payments" pad={false}>
              {!payments?.length ? <p className="px-6 py-5 text-muted">No payments yet.</p> : payments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#eceeea] px-6 py-3 last:border-b-0">
                  <div className="min-w-[200px] flex-1">
                    <div className="font-semibold">{p.plan_name} plan</div>
                    <div className="text-[13px] text-muted">
                      {fmtDate(p.verified_at ?? p.created_at)}, {p.method === "upi" ? "UPI" : "Cash"}
                      {p.status === "pending" && ", waiting to be confirmed"}{p.status === "rejected" && `, not received`}
                      {p.discount > 0 && `, ${p.discount_note} saved ${inr(p.discount)}`}
                    </div>
                  </div>
                  <span className="text-[13px] text-muted">{p.receipt_no}</span>
                  <span className="h-display tabular text-[22px] font-semibold">{inr(p.amount)}</span>
                </div>
              ))}
            </Panel>
          )}

          <Panel title="Workout and diet plan" aside={<Link to={`/workouts?member=${m.id}`}>Edit plan</Link>}>
            <p className="whitespace-pre-line leading-relaxed text-[#1f4255]">{workout?.workout || "No plan yet."}</p>
            {workout?.diet && <p className="mt-3 whitespace-pre-line text-sm text-muted">Diet: {workout.diet}</p>}
          </Panel>
        </div>
      </div>

      {renew && <RenewModal member={m} onClose={() => setRenew(false)}
        onDone={(msg) => { setRenew(false); toast(msg); reload(); reloadMs(); reloadPay(); }} />}
      {editing && <EditMember m={m} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); toast("Details saved."); }} />}
    </div>
  );
}

function EditMember({ m, onClose, onSaved }: { m: Member; onClose: () => void; onSaved: () => void }) {
  const { data: trainers } = useApi<User[]>("/api/users?role=trainer");
  const [f, setF] = useState({
    name: m.name, phone: m.phone, emergency_contact: m.emergency_contact ?? "", address: m.address ?? "",
    trainer_id: m.trainer_id ? String(m.trainer_id) : "", notes: m.notes ?? "", is_active: m.is_active, password: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api(`/api/members/${m.id}`, {
        method: "PATCH",
        body: { ...f, trainer_id: f.trainer_id ? Number(f.trainer_id) : null, password: f.password || undefined },
      });
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Edit ${m.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name"><input className="input" value={f.name} onChange={set("name")} /></Field>
          <Field label="Mobile number"><input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
        </div>
        <Field label="Emergency contact"><input className="input" value={f.emergency_contact} onChange={set("emergency_contact")} placeholder="Name and number" /></Field>
        <Field label="Address"><input className="input" value={f.address} onChange={set("address")} /></Field>
        <Field label="Trainer">
          <select className="input" value={f.trainer_id} onChange={set("trainer_id")}>
            <option value="">No trainer</option>
            {trainers?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Notes for staff"><textarea className="input" rows={2} value={f.notes} onChange={set("notes")} /></Field>
        <Field label="Reset password" hint="Leave empty to keep their current password."><input className="input" value={f.password} onChange={set("password")} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!f.is_active} onChange={(e) => setF({ ...f, is_active: !e.target.checked })} />
          Disable account (blocks login, check-in and the fingerprint machine)
        </label>
        <ErrorText>{err}</ErrorText>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save details</Button></div>
      </form>
    </Modal>
  );
}
