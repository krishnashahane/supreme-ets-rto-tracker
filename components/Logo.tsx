import Image from "next/image";
import Link from "next/link";

export function Logo({ href = "/", subtitle }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3">
      <Image
        src="/logo.png"
        alt="Supreme ETS"
        width={44}
        height={44}
        priority
        className="h-11 w-11 rounded-xl object-contain"
      />
      <span className="leading-tight">
        <span className="block text-base font-extrabold tracking-tight">SUPREME ETS</span>
        <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          {subtitle ?? "RTO Document Tracker"}
        </span>
      </span>
    </Link>
  );
}
