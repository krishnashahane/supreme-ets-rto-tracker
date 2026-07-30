import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div>
        <p className="text-6xl font-extrabold text-brand-600">404</p>
        <p className="mt-2 text-lg font-semibold">Page not found</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          The page you’re looking for doesn’t exist.
        </p>
      </div>
      <Link href="/" className="btn-primary">
        Back to search
      </Link>
    </div>
  );
}
