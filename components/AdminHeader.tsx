"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import type { Role } from "@/lib/types";

export function AdminHeader({ role, username }: { role: Role; username: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const isSuper = role === "superadmin";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const nav = [
    { href: "/admin", label: "Library" },
    ...(isSuper ? [{ href: "/admin/admins", label: "Users & Admins" }] : []),
    { href: "/admin/account", label: "Account" },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/80">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Logo href="/admin" subtitle="Control Center" />
        <nav className="flex items-center gap-1">
          {nav.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <span
            className={`chip ${
              isSuper
                ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300"
            }`}
          >
            {isSuper ? "Super Admin" : "Admin"} · {username}
          </span>
          <ThemeToggle />
          <button onClick={logout} className="btn-ghost text-sm">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
