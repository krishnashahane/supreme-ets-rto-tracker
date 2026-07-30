import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchApp } from "@/components/SearchApp";
import { SessionActions } from "@/components/SessionActions";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SessionActions role={user.role} username={user.username} />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 pb-6 pt-10 text-center sm:pt-14">
          <span className="chip mx-auto border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300">
            Supreme Fleet · RTO Records
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
            Find any vehicle document <span className="text-brand-600">in seconds</span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-500 dark:text-slate-400">
            Search RC, Insurance, PUC, Permit, Fitness Certificates and Road Tax across the entire fleet — then
            view or download instantly.
          </p>
        </section>

        <div className="animate-fade-in pb-16">
          <SearchApp initialCategories={[]} />
        </div>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-slate-800">
        <p>© {new Date().getFullYear()} Supreme ETS · RTO Document Tracker</p>
      </footer>
    </div>
  );
}
