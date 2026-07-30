"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Admin {
  id: string;
  username: string;
  createdAt: string;
}
interface Identity {
  id: string;
  username: string;
}
interface Roster {
  superAdmin: Identity | null;
  basicUser: Identity | null;
  admins: Admin[];
}

// Keep the super admin's roster continuously in sync.
const REFRESH_MS = 15_000;

export function AdminManager() {
  const [roster, setRoster] = useState<Roster>({ superAdmin: null, basicUser: null, admins: [] });
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const first = useRef(true);

  const load = useCallback(async () => {
    if (first.current) setLoading(true);
    try {
      const res = await fetch("/api/admins", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as Roster;
      setRoster({ superAdmin: j.superAdmin, basicUser: j.basicUser, admins: j.admins ?? [] });
      setSyncedAt(new Date());
    } finally {
      first.current = false;
      setLoading(false);
    }
  }, []);

  // Poll on an interval and refresh whenever the tab regains focus, so the
  // super admin always sees the current set of users and admins.
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setUsername("");
      setPassword("");
      flash("ok", "Administrator added.");
      load();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Could not add admin.");
    } finally {
      setBusy(false);
    }
  }

  async function setPasswordFor(id: string, label: string) {
    const pw = prompt(`Set a new password for "${label}" (min 8 characters):`);
    if (pw == null) return;
    if (pw.length < 8) {
      flash("err", "Password must be at least 8 characters.");
      return;
    }
    try {
      const res = await fetch("/api/admins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password: pw }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      flash("ok", `Password updated for ${label}.`);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Could not update password.");
    }
  }

  async function remove(a: Admin) {
    if (!confirm(`Remove administrator "${a.username}"?`)) return;
    try {
      const res = await fetch("/api/admins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id }),
      });
      if (!res.ok) throw new Error();
      flash("ok", "Administrator removed.");
      load();
    } catch {
      flash("err", "Could not remove admin.");
    }
  }

  const total =
    (roster.superAdmin ? 1 : 0) + (roster.basicUser ? 1 : 0) + roster.admins.length;

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
      <div>
        <h1 className="text-2xl font-bold">Users &amp; Administrators</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Create or revoke admin accounts and reset any password. Admins can manage the document
          library but cannot manage other users.
        </p>
        <form onSubmit={add} className="card mt-5 space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. rto.staff"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Temporary password
            </label>
            <input
              className="input"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 8 characters"
              required
            />
          </div>
          {msg && (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                msg.kind === "ok"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {msg.text}
            </p>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Adding…" : "Add administrator"}
          </button>
        </form>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            All accounts {total ? `(${total})` : ""}
          </h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Live{syncedAt ? ` · ${syncedAt.toLocaleTimeString()}` : ""}
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card h-16 animate-pulse bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : (
          <div className="card divide-y divide-slate-100 dark:divide-slate-800">
            {roster.superAdmin && (
              <Row
                letter={roster.superAdmin.username}
                title={roster.superAdmin.username}
                subtitle="Super Admin · you"
                tone="amber"
              />
            )}
            {roster.basicUser && (
              <Row
                letter={roster.basicUser.username}
                title={roster.basicUser.username}
                subtitle="Standard User · shared access"
                tone="slate"
                actions={
                  <button
                    className="btn-ghost !px-3 !py-1.5 text-xs"
                    onClick={() => setPasswordFor(roster.basicUser!.id, roster.basicUser!.username)}
                  >
                    Set password
                  </button>
                }
              />
            )}
            {roster.admins.map((a) => (
              <Row
                key={a.id}
                letter={a.username}
                title={a.username}
                subtitle={`Admin · added ${new Date(a.createdAt).toLocaleDateString()}`}
                tone="brand"
                actions={
                  <>
                    <button
                      className="btn-ghost !px-3 !py-1.5 text-xs"
                      onClick={() => setPasswordFor(a.id, a.username)}
                    >
                      Set password
                    </button>
                    <button className="btn-danger !px-3 !py-1.5 text-xs" onClick={() => remove(a)}>
                      Remove
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  letter,
  title,
  subtitle,
  tone,
  actions,
}: {
  letter: string;
  title: string;
  subtitle: string;
  tone: "amber" | "brand" | "slate";
  actions?: React.ReactNode;
}) {
  const avatar =
    tone === "amber"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
      : tone === "brand"
        ? "bg-brand-500/10 text-brand-600 dark:text-brand-300"
        : "bg-slate-500/10 text-slate-600 dark:text-slate-300";
  return (
    <div className="flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${avatar}`}>
        {letter.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      {actions}
    </div>
  );
}
