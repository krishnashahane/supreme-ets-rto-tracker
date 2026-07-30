"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/types";

export function SessionActions({ role, username }: { role: Role; username: string }) {
  const router = useRouter();
  const privileged = role === "admin" || role === "superadmin";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <span className="chip hidden border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300 sm:inline-flex">
        {username}
      </span>
      {privileged && (
        <Link href="/admin" className="btn-ghost text-sm">
          Manage
        </Link>
      )}
      <button onClick={logout} className="btn-ghost text-sm">
        Sign out
      </button>
    </div>
  );
}
