import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fmtDate, type Member } from "../api";
import { useAuth } from "../auth";
import AddMemberModal from "../components/AddMemberModal";
import { useApi } from "../hooks";
import { Button, Empty, PageTitle, Segmented, Spinner, StatusPill, useToast } from "../ui";

type F = "all" | "active" | "expiring" | "expired" | "new" | "inactive";

export default function Members() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, reload } = useApi<Member[]>("/api/members");
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>("all");
  const [adding, setAdding] = useState(false);
  const canEdit = user?.role !== "trainer";

  const counts = useMemo(() => {
    const c: Record<F, number> = { all: 0, active: 0, expiring: 0, expired: 0, new: 0, inactive: 0 };
    for (const m of data ?? []) {
      if (!m.is_active) { c.inactive++; continue; }
      c.all++; c[m.status]++;
    }
    return c;
  }, [data]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (data ?? []).filter((m) => {
      if (ql && !`${m.name} ${m.phone} ${m.code}`.toLowerCase().includes(ql)) return false;
      if (f === "inactive") return !m.is_active;
      if (!m.is_active) return false;
      return f === "all" || m.status === f;
    });
  }, [data, q, f]);

  const opts: { value: F; label: string }[] = [
    { value: "all", label: `All ${counts.all}` }, { value: "active", label: `Active ${counts.active}` },
    { value: "expiring", label: `Ending soon ${counts.expiring}` }, { value: "expired", label: `Expired ${counts.expired}` },
    { value: "new", label: `No plan ${counts.new}` },
    ...(counts.inactive ? [{ value: "inactive" as F, label: `Disabled ${counts.inactive}` }] : []),
  ];

  return (
    <div>
      <PageTitle actions={canEdit && <Button onClick={() => setAdding(true)}>Add member</Button>}>
        {user?.role === "trainer" ? "My members" : "Members"}
      </PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-[380px]">
          <label htmlFor="msearch" className="sr-only">Search members</label>
          <input id="msearch" className="input" placeholder="Search by name, phone or member ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented label="Filter by status" value={f} onChange={setF} options={opts} />
      </div>

      {!data ? <Spinner /> : (
        <div className="overflow-x-auto rounded-[10px] border border-line bg-white">
          <table className="w-full min-w-[780px] border-collapse text-[15px]">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th className="px-5 py-3 font-medium">Member</th><th className="p-3 font-medium">Phone</th>
                <th className="p-3 font-medium">Plan</th><th className="p-3 font-medium">Valid till</th>
                <th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Trainer</th>
                <th className="p-3 font-medium">Finger</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="cursor-pointer border-t border-[#eceeea] hover:bg-[#fafbf9]" onClick={() => nav(`/members/${m.id}`)}>
                  <td className="px-5 py-3">
                    <Link to={`/members/${m.id}`} className="font-semibold text-ink hover:text-plate-blue" onClick={(e) => e.stopPropagation()}>{m.name}</Link>
                    <div className="text-[13px] text-muted">{m.code}</div>
                  </td>
                  <td className="tabular p-3">{m.phone}</td>
                  <td className="p-3">{m.plan ?? "None"}</td>
                  <td className="tabular p-3">{m.end_date ? fmtDate(m.end_date) : "—"}</td>
                  <td className="p-3">{m.is_active ? <StatusPill m={m} /> : <span className="text-sm text-muted">Disabled</span>}</td>
                  <td className="p-3 text-muted">{m.trainer_name ?? "Not assigned"}</td>
                  <td className="p-3 text-sm text-muted">{m.has_fingerprint ? "Saved" : "Not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty>{data.length ? "No members match. Clear the search or pick another filter." : "No members yet. Add your first member to get started."}</Empty>}
        </div>
      )}
      {adding && <AddMemberModal onClose={() => setAdding(false)} onAdded={(m) => { setAdding(false); reload(); toast(`${m.name} added as ${m.code}.`); nav(`/members/${m.id}`); }} />}
    </div>
  );
}
