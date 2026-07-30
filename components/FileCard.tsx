import type { FileEntry } from "@/lib/types";
import { categoryStyle, extLabel, formatSize, isImage } from "@/lib/format";

function FileGlyph({ ext }: { ext: string }) {
  const label = extLabel(ext);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
      <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-slate-400">
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span className="text-[11px] font-bold tracking-wide text-slate-500">{label}</span>
    </div>
  );
}

export function FileCard({ file, children }: { file: FileEntry; children?: React.ReactNode }) {
  return (
    <div className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-slate-100 dark:border-slate-800">
        {isImage(file.ext) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/download/${file.id}?view=1`}
            alt={file.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <FileGlyph ext={file.ext} />
        )}
        <span className={`chip absolute left-2 top-2 backdrop-blur ${categoryStyle(file.category)}`}>
          {file.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {file.vehicle && (
          <span className="font-mono text-sm font-bold tracking-wide text-brand-700 dark:text-brand-300">
            {file.vehicle}
          </span>
        )}
        <p className="line-clamp-2 text-sm font-medium text-slate-700 dark:text-slate-200" title={file.name}>
          {file.name}
        </p>
        <p className="mt-auto flex items-center justify-between pt-1 text-xs text-slate-400">
          <span className="truncate" title={file.folder}>
            {file.folder}
          </span>
          <span className="shrink-0 pl-2">{formatSize(file.size)}</span>
        </p>
        {children}
      </div>
    </div>
  );
}
