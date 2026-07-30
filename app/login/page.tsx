import { redirect } from "next/navigation";
import Image from "next/image";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect(user.role === "user" ? "/" : "/admin");

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* soft decorative backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900" />
        <div className="absolute -top-32 left-1/2 h-80 w-[42rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-brand-400/20 blur-3xl dark:bg-brand-600/20" />
        <div className="absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-brand-300/20 blur-3xl dark:bg-brand-700/10" />
      </div>

      <header className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 py-4">
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md animate-fade-in">
          {/* brand mark */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-28 w-44 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-soft dark:border-slate-800 dark:bg-slate-900">
              <Image
                src="/logo.png"
                alt="Supreme ETS"
                width={176}
                height={131}
                priority
                className="h-auto w-full object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sign in to <span className="font-semibold text-slate-700 dark:text-slate-200">Supreme ETS</span>
            </p>
          </div>

          <div className="card p-8 shadow-lg">
            <LoginForm />
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} Supreme ETS · RTO Document Tracker
          </p>
        </div>
      </main>
    </div>
  );
}
