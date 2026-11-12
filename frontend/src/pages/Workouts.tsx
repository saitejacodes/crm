import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, fmtDate, type Member, type Workout } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { Button, Empty, Field, PageTitle, Spinner, useToast } from "../ui";

export default function Workouts() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data: members } = useApi<Member[]>("/api/members");
  const [q, setQ] = useState("");
  const pool = useMemo(() => (members ?? []).filter((m) => m.is_active && m.status !== "new"), [members]);
  const selId = Number(params.get("member")) || pool[0]?.id || null;
  const sel = members?.find((m) => m.id === selId) ?? null;
  const { data: w } = useApi<Workout>(selId ? `/api/members/${selId}/workout` : null);
  const [draft, setDraft] = useState({ workout: "", diet: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (w) setDraft({ workout: w.workout, diet: w.diet }); }, [w]);

  const list = pool.filter((m) => !q || `${m.name} ${m.code}`.toLowerCase().includes(q.toLowerCase()));

  async function save() {
    if (!selId) return;
    setBusy(true);
    try {
      await api(`/api/members/${selId}/workout`, { method: "PUT", body: draft });
      toast(`Plan saved for ${sel?.name}. They see it in their app now.`);
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }

  if (!members) return <Spinner />;
  return (
    <div>
      <PageTitle>Workout and diet plans</PageTitle>
      {!pool.length ? <Empty>{user?.role === "trainer" ? "No members are assigned to you yet." : "No members with a plan yet."}</Empty> : (
        <div className="flex flex-wrap items-start gap-6">
          <div className="w-full overflow-hidden rounded-[10px] border border-line bg-white md:w-[300px]">
            <div className="border-b border-[#eceeea] p-3">
              <label htmlFor="wsearch" className="sr-only">Find member</label>
              <input id="wsearch" className="input" placeholder={user?.role === "trainer" ? "Your members" : "Find a member"} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {list.map((m) => (
                <button key={m.id} onClick={() => setParams({ member: String(m.id) })} aria-current={m.id === selId}
                  className={`block w-full border-b border-[#eceeea] px-4 py-2.5 text-left last:border-b-0 ${m.id === selId ? "bg-plate-blue-soft shadow-[inset_3px_0_0_#22679a]" : "hover:bg-[#fafbf9]"}`}>
                  <span className="block font-semibold">{m.name}</span>
                  <span className="block text-[13px] text-muted">{m.code}{m.trainer_name ? `, ${m.trainer_name}` : ""}</span>
                </button>
              ))}
            </div>
          </div>
          {sel && (
            <div className="flex min-w-0 flex-1 basis-[420px] flex-col gap-4 rounded-[10px] border border-line bg-white p-6">
              <div>
                <div className="h-display text-[28px] font-bold">{sel.name}</div>
                <div className="text-sm text-muted">
                  {sel.code}, trainer {sel.trainer_name ?? "not assigned"}
                  {w?.updated_at && `, last updated ${fmtDate(w.updated_at)}${w.trainer_name ? ` by ${w.trainer_name}` : ""}`}
                </div>
              </div>
              <Field label="Workout, one day per line">
                <textarea className="input leading-relaxed" rows={8} value={draft.workout} placeholder={"Mon: Chest and triceps\nTue: Back and biceps"}
                  onChange={(e) => setDraft({ ...draft, workout: e.target.value })} />
              </Field>
              <Field label="Diet notes">
                <textarea className="input leading-relaxed" rows={4} value={draft.diet} onChange={(e) => setDraft({ ...draft, diet: e.target.value })} />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={save} busy={busy}>Save plan</Button>
                <span className="text-sm text-muted">The member sees it in their app right away.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
