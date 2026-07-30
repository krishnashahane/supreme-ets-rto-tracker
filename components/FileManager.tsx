"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileEntry } from "@/lib/types";
import { formatSize, categoryStyle, isImage } from "@/lib/format";

interface Listing {
  folder: string;
  subfolders: string[];
  files: FileEntry[];
}

export function FileManager() {
  const [folder, setFolder] = useState("");
  const [data, setData] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files?folder=${encodeURIComponent(f)}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setMsg({ kind: "err", text: "Failed to load folder." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(folder);
  }, [folder, load]);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3500);
  }

  const crumbs = folder ? folder.split("/") : [];

  async function createFolder() {
    const name = prompt(folder ? `New subfolder inside "${folder}"` : "New top-level folder (category)");
    if (!name) return;
    setBusy("folder");
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent: folder, name }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      flash("ok", "Folder created.");
      load(folder);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Could not create folder.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteFolder(f: string) {
    if (!confirm(`Delete folder "${f}" and ALL files inside it? This cannot be undone.`)) return;
    setBusy("del:" + f);
    try {
      const res = await fetch("/api/folders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: f }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      flash("ok", `Deleted ${j.deleted} file(s).`);
      load(folder);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Could not delete folder.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteFile(file: FileEntry) {
    if (!confirm(`Delete "${file.name}"?`)) return;
    setBusy("del:" + file.id);
    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id }),
      });
      if (!res.ok) throw new Error();
      flash("ok", "File deleted.");
      load(folder);
    } catch {
      flash("err", "Could not delete file.");
    } finally {
      setBusy(null);
    }
  }

  async function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    if (!folder) {
      flash("err", "Open a category/folder before uploading.");
      return;
    }
    let done = 0;
    let ok = 0;
    for (const file of files) {
      setBusy(`up:${++done}/${files.length}`);
      try {
        // 1) Ask the server for a short-lived presigned PUT URL (staff-gated).
        const signRes = await fetch("/api/files/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder, name: file.name, contentType: file.type }),
        });
        if (!signRes.ok) throw new Error((await signRes.json()).error ?? "sign failed");
        const { uploadUrl } = (await signRes.json()) as { uploadUrl: string };

        // 2) Stream the file straight to R2 (no server buffering).
        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: file.type ? { "Content-Type": file.type } : undefined,
          body: file,
        });
        if (!put.ok) throw new Error(`upload failed (${put.status})`);

        // 3) Register it in the manifest (server HEAD-verifies + records size).
        const res = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder, name: file.name }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        ok++;
      } catch (err) {
        flash("err", `${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
      }
    }
    setBusy(null);
    const failed = files.length - ok;
    if (ok) flash("ok", `Uploaded ${ok} file(s)${failed ? `, ${failed} failed` : ""}.`);
    else flash("err", `Upload failed for all ${files.length} file(s).`);
    await load(folder);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Document Library</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create folders, upload, and delete RTO documents.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={createFolder} disabled={busy === "folder"}>
            + New folder
          </button>
          <button
            className="btn-primary"
            onClick={() => fileInput.current?.click()}
            disabled={!folder || (busy?.startsWith("up:") ?? false)}
            title={folder ? "" : "Open a folder first"}
          >
            {busy?.startsWith("up:") ? `Uploading ${busy.slice(3)}…` : "↑ Upload files"}
          </button>
          <input ref={fileInput} type="file" multiple hidden onChange={onFilesPicked} />
        </div>
      </div>

      {msg && (
        <div
          className={`mt-4 rounded-xl px-4 py-2.5 text-sm ${
            msg.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* breadcrumbs */}
      <nav className="mt-5 flex flex-wrap items-center gap-1 text-sm">
        <button
          onClick={() => setFolder("")}
          className={`rounded-lg px-2 py-1 font-medium ${folder === "" ? "text-slate-900 dark:text-white" : "text-brand-600 hover:underline"}`}
        >
          Home
        </button>
        {crumbs.map((c, i) => {
          const path = crumbs.slice(0, i + 1).join("/");
          const last = i === crumbs.length - 1;
          return (
            <span key={path} className="flex items-center gap-1">
              <span className="text-slate-400">/</span>
              <button
                onClick={() => setFolder(path)}
                className={`rounded-lg px-2 py-1 font-medium ${last ? "text-slate-900 dark:text-white" : "text-brand-600 hover:underline"}`}
              >
                {c}
              </button>
            </span>
          );
        })}
      </nav>

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {/* folders */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Folders</h2>
            {data && data.subfolders.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.subfolders.map((f) => {
                  const name = f.split("/").pop()!;
                  return (
                    <div key={f} className="card flex items-center gap-3 p-3">
                      <button className="flex flex-1 items-center gap-3 text-left" onClick={() => setFolder(f)}>
                        <span className="text-2xl">📁</span>
                        <span className="truncate font-medium">{name}</span>
                      </button>
                      <button
                        className="btn-danger !px-2.5 !py-1.5 text-xs"
                        onClick={() => deleteFolder(f)}
                        disabled={busy === "del:" + f}
                      >
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No subfolders.</p>
            )}
          </section>

          {/* files */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Files {data?.files.length ? `(${data.files.length})` : ""}
            </h2>
            {data && data.files.length ? (
              <div className="card divide-y divide-slate-100 dark:divide-slate-800">
                {data.files.map((file) => (
                  <div key={file.id} className="flex items-center gap-3 p-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                      {isImage(file.ext) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/download/${file.id}?view=1`} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-400">
                          {file.ext.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="flex items-center gap-2 text-xs text-slate-400">
                        {file.vehicle && (
                          <span className={`chip !px-2 !py-0.5 ${categoryStyle(file.category)}`}>{file.vehicle}</span>
                        )}
                        {formatSize(file.size)}
                      </p>
                    </div>
                    <a href={`/api/download/${file.id}?view=1`} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-1.5 text-xs">
                      View
                    </a>
                    <button
                      className="btn-danger !px-2.5 !py-1.5 text-xs"
                      onClick={() => deleteFile(file)}
                      disabled={busy === "del:" + file.id}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No files here. {folder ? "Use “Upload files”." : "Open a folder to upload."}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
