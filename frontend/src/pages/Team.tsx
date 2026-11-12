import { useState, type FormEvent } from "react";
import { api, type User } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { Button, ErrorText, Field, PageTitle, Panel, Spinner, useToast } from "../ui";

const ROLE: Record<string, string> = { owner: "Owner", staff: "Desk staff", trainer: "Trainer" };

export default function Team() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, reload } = useApi<User[]>("/api/users");
  const [f, setF] = useState({ name: "", phone: "", password: "", role: "trainer" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api("/api/users", { body: f });
      toast(`${f.name} added. They sign in with ${f.phone}.`);
      setF({ name: "", phone: "", password: "", role: "trainer" });
      reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function toggle(u: User) {
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { is_active: !u.is_active } });
      toast(u.is_active ? `${u.name} can no longer sign in.` : `${u.name} can sign in again.`);
      reload();
    } catch (e) { toast((e as Error).message); }
  }

  return (
    <div className="max-w-[900px] space-y-6">
      <PageTitle>Staff and trainers</PageTitle>
      <Panel pad={false}>
        {!data ? <Spinner /> : data.map((u) => (
          <div key={u.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#eceeea] px-5 py-3.5 last:border-b-0 ${u.is_active ? "" : "opacity-60"}`}>
            <div className="min-w-[200px] flex-1"><div className="font-semibold">{u.name}</div><div className="tabular text-[13px] text-muted">{u.phone}</div></div>
            <span className="w-[110px] text-sm">{ROLE[u.role]}</span>
            {u.id !== me?.id && <Button size="sm" variant="ghost" onClick={() => toggle(u)}>{u.is_active ? "Remove access" : "Give access back"}</Button>}
          </div>
        ))}
      </Panel>
      <Panel title="Add a person">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Mobile number"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required /></Field>
          <Field label="First password" hint="At least 6 characters. They can change it later."><input className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
          <Field label="Role" hint="Desk staff handle members, payments and check-ins. Trainers see only their members.">
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="trainer">Trainer</option><option value="staff">Desk staff</option>
            </select>
          </Field>
          <div className="sm:col-span-2"><ErrorText>{err}</ErrorText></div>
          <div><Button type="submit" busy={busy}>Add to team</Button></div>
        </form>
      </Panel>
    </div>
  );
}
