import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate, fmtTime, type Device, type Punch } from "../api";
import { useApi } from "../hooks";
import { Button, Empty, ErrorText, Field, PageTitle, Panel, Spinner, useToast } from "../ui";

interface Attention { cannot_block: { id: number; code: string; name: string; pin: string }[]; not_enrolled: { id: number; code: string; name: string; pin: string }[] }

const RESULT: Record<Punch["result"], { label: string; color: string }> = {
  ok: { label: "Checked in", color: "#14663b" },
  expired: { label: "Plan expired", color: "#a51f30" },
  disabled: { label: "Account disabled", color: "#a51f30" },
  unknown: { label: "Not a member", color: "#646d72" },
};

export default function Machine() {
  const toast = useToast();
  const { data: devices, reload } = useApi<Device[]>("/api/devices");
  const { data: punches } = useApi<Punch[]>("/api/devices/punches?limit=30");
  const { data: att } = useApi<Attention>("/api/devices/attention");
  const [serial, setSerial] = useState("");
  const [name, setName] = useState("Entrance");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const host = window.location.host;

  async function add(s: string) {
    setBusy(true); setErr("");
    try {
      await api("/api/devices", { body: { serial: s.trim(), name } });
      setSerial("");
      toast("Machine added. Paid-up members are being loaded onto it.");
      reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function sync() {
    try {
      const r = await api<Record<string, number>>("/api/devices/sync", { method: "POST" });
      toast(`Checked every member. ${r.enabled ?? 0} added, ${r.disabled ?? 0} removed.`);
      reload();
    } catch (e) { toast((e as Error).message); }
  }
  async function remove(d: Device) {
    if (!window.confirm(`Stop syncing ${d.name}? Members already on it stay on it.`)) return;
    await api(`/api/devices/${d.id}`, { method: "DELETE" });
    reload();
  }

  const active = devices?.filter((d) => d.is_active) ?? [];
  const waiting = devices?.filter((d) => !d.is_active && d.last_seen) ?? [];

  return (
    <div className="space-y-6">
      <PageTitle actions={active.length > 0 && <Button variant="line" onClick={sync}>Check all members now</Button>}>Fingerprint machine</PageTitle>
      <p className="max-w-[70ch] text-muted">
        When a payment is confirmed, the member is added to the machine. When their plan ends, they are removed and their thumb stops working. Their fingerprint is saved here, so after renewing they don't need to enrol again. This also runs by itself every hour.
      </p>

      {!devices ? <Spinner /> : (<>
        {active.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-4 rounded-[10px] border border-line bg-white px-5 py-4">
            <span aria-hidden className="h-3.5 w-3.5 rounded-full" style={{ background: d.online ? "#1b8a4f" : "#c8283b" }} />
            <div className="min-w-[200px] flex-1">
              <div className="font-semibold">{d.name} <span className="font-normal text-muted">serial {d.serial}</span></div>
              <div className="text-sm text-muted">{d.online ? "Online" : d.last_seen ? `Offline, last seen ${fmtDate(d.last_seen)} ${fmtTime(d.last_seen)}` : "Waiting for the machine to connect"}
                {d.pending_commands > 0 && `, ${d.pending_commands} changes waiting to reach it`}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => remove(d)}>Stop syncing</Button>
          </div>
        ))}

        {waiting.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-4 rounded-[10px] bg-plate-yellow-soft px-5 py-4 text-[#6b5100]">
            <div className="flex-1">A machine with serial <strong>{d.serial}</strong> is trying to connect. Add it if it's yours.</div>
            <Button size="sm" onClick={() => add(d.serial)}>Add this machine</Button>
          </div>
        ))}

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Panel title={active.length ? "Add another machine" : "Connect your machine"}>
            <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-[15px]">
              <li>Connect the machine to the gym Wi-Fi or a LAN cable.</li>
              <li>On the machine: Menu, then Comm, then Cloud Server Setting (some models call it ADMS).</li>
              <li>Server address: <code className="rounded bg-chalk px-1.5 py-0.5">{host}</code>, port 80, HTTPS off. (If the machine has an HTTPS option, port 443 with HTTPS on also works.)</li>
              <li>Find the serial number under Menu, System Info, Device Info, and enter it below.</li>
            </ol>
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); add(serial); }} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Field label="Serial number"><input className="input" value={serial} onChange={(e) => setSerial(e.target.value)} required /></Field>
              <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Button type="submit" busy={busy}>Add</Button>
            </form>
            <div className="mt-2"><ErrorText>{err}</ErrorText></div>
          </Panel>

          <Panel title="Needs your attention" pad={false}>
            {!att ? <Spinner /> : !att.cannot_block.length && !att.not_enrolled.length ? <Empty>Everything is in order.</Empty> : (<>
              {att.cannot_block.map((m) => (
                <div key={m.id} className="border-b border-[#eceeea] px-5 py-3 last:border-b-0">
                  <Link to={`/members/${m.id}`} className="font-semibold text-ink">{m.name}</Link>
                  <div className="text-sm text-[#a51f30]">Plan ended, but their fingerprint isn't saved here yet, so the app can't remove them safely. Delete user ID {m.pin} on the machine by hand, or ask them to re-enrol once.</div>
                </div>
              ))}
              {att.not_enrolled.map((m) => (
                <div key={m.id} className="border-b border-[#eceeea] px-5 py-3 last:border-b-0">
                  <Link to={`/members/${m.id}`} className="font-semibold text-ink">{m.name}</Link>
                  <div className="text-sm text-muted">Paid, no fingerprint yet. On the machine, enrol a finger for user ID <strong>{m.pin}</strong>.</div>
                </div>
              ))}
            </>)}
          </Panel>
        </div>

        <Panel title="Latest punches" pad={false}>
          {!punches?.length ? <Empty>No punches yet. They appear here as members use the machine.</Empty> : punches.map((p) => (
            <div key={p.id} className="flex items-center gap-4 border-b border-[#eceeea] px-5 py-2.5 last:border-b-0">
              <span className="h-display tabular w-[120px] text-lg font-semibold">{fmtDate(p.punched_at).replace(/ \d{4}$/, "")}, {fmtTime(p.punched_at)}</span>
              <span className="flex-1">{p.member_id ? <Link to={`/members/${p.member_id}`} className="font-semibold text-ink">{p.member_name}</Link> : `User ID ${p.pin}`}</span>
              <span className="text-sm font-semibold" style={{ color: RESULT[p.result].color }}>{RESULT[p.result].label}</span>
            </div>
          ))}
        </Panel>
      </>)}
    </div>
  );
}
