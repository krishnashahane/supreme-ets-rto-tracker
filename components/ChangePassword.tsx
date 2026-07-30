"use client";

import { useState } from "react";

export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ kind: "err", text: "New passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not change password");
      setMsg({ kind: "ok", text: "Password updated successfully." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card max-w-md space-y-4 p-6">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Current password
        </label>
        <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">
          New password
        </label>
        <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Confirm new password
        </label>
        <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
      </div>
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
          {msg.text}
        </p>
      )}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
