"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileEntry } from "@/lib/types";
import { FileCard } from "./FileCard";

interface ApiResult {
  items: FileEntry[];
  total: number;
  page: number;
  pages: number;
  categories: string[];
  totalAll: number;
}

export function SearchApp({ initialCategories }: { initialCategories: string[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (query: string, cat: string, pg: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query, category: cat, page: String(pg) });
      const res = await fetch(`/api/search?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Search failed");
      setData(await res.json());
    } catch {
      setError("Could not load documents. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(q, category, page), 220);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, category, page, load]);

  const categories = data?.categories ?? initialCategories;

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      {/* search bar */}
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search by vehicle number, document name or folder…  e.g. MH 14 JV 101"
          className="input !rounded-2xl !py-4 !pl-12 text-base shadow-soft"
          aria-label="Search documents"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* category chips */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setCategory("");
            setPage(1);
          }}
          className={`chip ${
            category === ""
              ? "border-brand-500 bg-brand-600 text-white"
              : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => {
              setCategory(c === category ? "" : c);
              setPage(1);
            }}
            className={`chip ${
              category === c
                ? "border-brand-500 bg-brand-600 text-white"
                : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* status */}
      <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
        {loading
          ? "Searching…"
          : data && (q || category)
            ? `${data.total.toLocaleString()} document${data.total === 1 ? "" : "s"} found`
            : ""}
      </p>

      {/* results */}
      {error ? (
        <div className="card mt-6 p-8 text-center text-red-600">{error}</div>
      ) : !loading && data && data.items.length === 0 ? (
        <div className="card mt-6 p-12 text-center">
          <p className="text-lg font-semibold">No documents found</p>
          <p className="mt-1 text-sm text-slate-500">Try a different vehicle number or clear the filters.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(data?.items ?? []).map((file) => (
            <FileCard key={file.id} file={file}>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href={`/api/download/${file.id}?view=1`} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-2 text-xs">
                  View
                </a>
                <a href={`/api/download/${file.id}`} className="btn-primary !py-2 text-xs">
                  Download
                </a>
              </div>
            </FileCard>
          ))}
          {loading &&
            !data &&
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card aspect-[4/3] animate-pulse bg-slate-100 dark:bg-slate-800" />
            ))}
        </div>
      )}

      {/* pagination */}
      {data && data.pages > 1 && (
        <div className="my-10 flex items-center justify-center gap-3">
          <button
            className="btn-ghost"
            disabled={data.page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <span className="text-sm text-slate-500">
            Page {data.page} of {data.pages}
          </span>
          <button
            className="btn-ghost"
            disabled={data.page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
