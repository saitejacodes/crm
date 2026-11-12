import { useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadFile, fmtDate, inr, type Payment } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { Button, Empty, PageTitle, Segmented, Spinner, useToast } from "../ui";

type Tab = "pending" | "verified" | "rejected";

export default function Payments() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("pending");
  const { data, reload } = useApi<Payment[]>(`/api/payments?status=${tab}`);
  const [busy, setBusy] = useState<number | null>(null);

  async function act(p: Payment, ok: boolean) {
    setBusy(p.id);
    try {
      await api(`/api/payments/${p.id}/${ok ? "verify" : "reject"}`, { method: "POST", body: ok ? undefined : { note: "Payment not received" } });
      toast(ok ? `Confirmed. ${p.member_name}'s membership is updated.` : "Marked as not received.");
      reload();
    } catch (e) { toast((e as Error).message); } finally { setBusy(null); }
  }

  const total = (data ?? []).reduce((a, p) => a + p.amount, 0);

  return (
    <div>
      <PageTitle actions={user?.role === "owner" && (
        <Button variant="line" onClick={() => downloadFile("/api/payments/export.csv", "payments.csv").catch((e) => toast(e.message))}>
          Download for Excel (CSV)
        </Button>
      )}>Payments</PageTitle>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Payment status" value={tab} onChange={setTab}
          options={[{ value: "pending", label: "To confirm" }, { value: "verified", label: "Confirmed" }, { value: "rejected", label: "Not received" }]} />
        {tab === "verified" && data && <span className="text-sm text-muted">Showing {data.length}, total {inr(total)}</span>}
      </div>
      {tab === "pending" && (
        <p className="mb-4 max-w-[70ch] text-sm text-muted">
          Members who paid by UPI wait here. Open your bank or UPI app, find the UTR, then confirm. Their plan and fingerprint access update straight away.
        </p>
      )}
      {!data ? <Spinner /> : (
        <div className="overflow-x-auto rounded-[10px] border border-line bg-white">
          <table className="w-full min-w-[820px] border-collapse text-[15px]">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th className="px-5 py-3 font-medium">Member</th><th className="p-3 font-medium">Plan</th>
                <th className="p-3 font-medium">Amount</th><th className="p-3 font-medium">Paid by</th>
                <th className="p-3 font-medium">UTR / receipt</th><th className="p-3 font-medium">Date</th><th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-[#eceeea] hover:bg-[#fafbf9]">
                  <td className="px-5 py-3">
                    <Link to={`/members/${p.member_id}`} className="font-semibold text-ink hover:text-plate-blue">{p.member_name}</Link>
                    <div className="text-[13px] text-muted">{p.member_code}</div>
                  </td>
                  <td className="p-3">{p.plan_name}</td>
                  <td className="p-3">
                    <span className="tabular font-semibold">{inr(p.amount)}</span>
                    {p.discount > 0 && <div className="text-[13px] text-plate-green">{p.discount_note}, {inr(p.discount)} off</div>}
                  </td>
                  <td className="p-3">{p.method === "upi" ? "UPI" : "Cash"}</td>
                  <td className="tabular p-3 text-muted">{[p.receipt_no, p.utr].filter(Boolean).join(", ") || "—"}{p.status === "rejected" && p.note ? ` (${p.note})` : ""}</td>
                  <td className="p-3 text-muted">{fmtDate(p.verified_at ?? p.created_at)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    {p.status === "pending" && (<>
                      <Button size="sm" variant="red" disabled={busy === p.id} onClick={() => act(p, false)}>Not received</Button>{" "}
                      <Button size="sm" busy={busy === p.id} onClick={() => act(p, true)}>Confirm</Button>
                    </>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.length && <Empty>{tab === "pending" ? "All caught up. Nothing waiting for you." : "Nothing here yet."}</Empty>}
        </div>
      )}
    </div>
  );
}
