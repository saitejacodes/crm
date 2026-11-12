import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IS_DEMO } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks";
import { Button, ErrorText, Field, PlateMark } from "../ui";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: gym } = useApi<{ gym_name: string; phone: string; address: string; timings: string }>("/api/public/gym");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(phone, password);
      const next = params.get("next");
      nav(next && next.startsWith("/") && !next.startsWith("/login") ? next : "/", { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-rubber md:flex-row">
      <div className="flex flex-col justify-between gap-10 px-6 py-8 text-chalk md:w-[46%] md:px-14 md:py-12">
        <div className="flex items-center gap-3">
          <PlateMark size={44} />
          <span className="h-display text-[26px] font-bold">{gym?.gym_name ?? "Gym"}</span>
        </div>
        <h1 className="h-display text-[56px] font-bold leading-[0.95] md:text-[84px]">Train.<br />Check in.<br />Renew.</h1>
        <div className="hidden max-w-[40ch] space-y-1 text-[#a3abaf] md:block">
          {gym?.timings && <p className="text-chalk">{gym.timings}</p>}
          {gym?.address && <p>{gym.address}</p>}
          {gym?.phone && <p>Call {gym.phone}</p>}
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center rounded-t-3xl bg-chalk px-6 py-10 md:items-center md:rounded-none">
        <form onSubmit={submit} className="w-full max-w-[380px] space-y-4">
          <h2 className="h-display text-[32px] font-bold">Sign in</h2>
          <Field label="Mobile number">
            <input className="input" inputMode="tel" autoComplete="username" value={phone}
              onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" required />
          </Field>
          <Field label="Password" hint="New members: your first password is your mobile number.">
            <input className="input" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <ErrorText>{err}</ErrorText>
          <Button type="submit" size="lg" busy={busy}>Sign in</Button>
          {IS_DEMO && (
            <div className="rounded-lg bg-plate-yellow-soft px-3.5 py-3 text-sm text-[#6b5100]">
              <div className="font-semibold">Demo logins</div>
              Owner 9000000000 / owner123<br />Desk staff 9111111111 / pass123<br />Trainer 9222222222 / pass123<br />Member 9845012345 / 9845012345
              <div className="mt-1">Or tap the yellow Demo button in the corner.</div>
            </div>
          )}
          {gym?.phone && <p className="text-sm text-muted">Forgot your password? Call the front desk on {gym.phone}.</p>}
        </form>
      </div>
    </div>
  );
}
