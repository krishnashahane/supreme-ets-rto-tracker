export function formatSize(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

const CATEGORY_STYLES: Record<string, string> = {
  RC: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
  "INSURANCE SFM": "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
  PUC: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
  PERMIT: "bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400",
  "FITNESS CERTIFICATES": "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400",
  "ROAD TAX": "bg-cyan-500/10 text-cyan-600 border-cyan-500/20 dark:text-cyan-400",
};

export function categoryStyle(category: string): string {
  return CATEGORY_STYLES[category] ?? "bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-300";
}

export function extLabel(ext: string): string {
  return ext.toUpperCase();
}

export function isImage(ext: string): boolean {
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext.toLowerCase());
}
