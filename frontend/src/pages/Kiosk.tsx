import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api, fmtTime, IS_DEMO, type Attendance } from "../api";
import { PlateMark } from "../ui";

/** Full-screen page for a tablet / old phone at the entrance. Rotates the code every minute. */
export default function Kiosk() {
  const [tok, setTok] = useState<{ token: string; gym_name: string } | null>(null);
  const [left, setLeft] = useState(60);
  const [recent, setRecent] = useState<Attendance[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => {
      api<{ token: string; gym_name: string }>("/api/attendance/kiosk-token")
        .then((t) => { if (alive) { setTok(t); setErr(""); } })
        .catch((e) => alive && setErr(e.message));
      api<Attendance[]>("/api/attendance").then((a) => alive && setRecent(a.slice(0, 5))).catch(() => {});
    };
    load();
    const poll = window.setInterval(load, 15000);
    const tick = window.setInterval(() => setLeft(60 - (Math.floor(Date.now() / 1000) % 60)), 500);
    return () => { alive = false; window.clearInterval(poll); window.clearInterval(tick); };
  }, []);

  const url = !tok ? "" : IS_DEMO ? `${window.location.origin}${window.location.pathname}#/checkin?t=${tok.token}` : `${window.location.origin}/checkin?t=${tok.token}`;

  return (
    <div className="relative flex min-h-screen flex-col gap-10 bg-rubber px-8 py-10 text-chalk lg:flex-row lg:items-stretch lg:gap-16 lg:px-16 lg:py-14">
      <div className="flex flex-1 flex-col justify-between gap-8">
        <div className="flex items-center gap-3.5">
          <PlateMark size={48} />
          <span className="h-display text-[32px] font-bold">{tok?.gym_name ?? ""}</span>
          <Link to="/attendance" className="absolute right-6 top-5 text-sm text-[#a9c4f0] hover:text-white">Exit</Link>
        </div>
        <div>
          <h1 className="h-display text-[72px] font-bold leading-[0.95] lg:text-[104px]">Scan to<br />check in</h1>
          <p className="mt-5 max-w-[26ch] text-[22px] leading-snug text-[#c4cacd]">Open your phone camera and point it at the code. Or use your fingerprint.</p>
        </div>
        <div>
          <div className="mb-2.5 text-[#a3abaf]">Just checked in</div>
          <div className="flex flex-wrap gap-2.5">
            {recent.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-2 rounded-full bg-rubber-2 py-2 pl-2.5 pr-3.5">
                <span className="h-2.5 w-2.5 rounded-full bg-plate-green" />{r.member_name.split(" ")[0]} <span className="text-[#a3abaf]">{fmtTime(r.check_in_at)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-5">
        <div className="rounded-3xl bg-white p-7 shadow-[0_0_0_10px_#14303f]">
          {url ? <QRCodeSVG value={url} size={400} level="M" /> : <div className="h-[400px] w-[400px]" />}
        </div>
        <div className="w-[456px] max-w-full">
          <div className="h-1.5 overflow-hidden rounded bg-rubber-3"><div className="h-full bg-plate-blue transition-[width] duration-500" style={{ width: `${(left / 60) * 100}%` }} /></div>
          <div className="mt-2 flex justify-between text-[#a3abaf]"><span>New code in {left} seconds</span><span>Screenshots won't work</span></div>
          {err && <p role="alert" className="mt-2 text-[#f19aa6]">{err}</p>}
        </div>
      </div>
    </div>
  );
}
