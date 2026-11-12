import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Button, ErrorText, Field, PageTitle, Panel, useToast } from "../ui";

export default function ChangePassword() {
  const toast = useToast();
  const [oldPw, setOld] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return setErr("Use at least 6 characters.");
    setBusy(true);
    setErr("");
    try {
      await api("/api/auth/password", { body: { old_password: oldPw, new_password: pw } });
      setOld(""); setPw("");
      toast("Password changed.");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="max-w-md">
      <PageTitle>Change password</PageTitle>
      <Panel>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Current password"><input className="input" type="password" value={oldPw} onChange={(e) => setOld(e.target.value)} required /></Field>
          <Field label="New password" hint="At least 6 characters."><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
          <ErrorText>{err}</ErrorText>
          <Button type="submit" busy={busy}>Change password</Button>
        </form>
      </Panel>
    </div>
  );
}
