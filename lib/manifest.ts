import "server-only";
import { getObjectText, uploadObject } from "./r2";
import type { FileEntry, Manifest } from "./types";

// The manifest (file listing + storage keys) lives in the private R2 bucket so
// that admin create/update/delete operations are reflected live without a
// redeploy. It is read server-side only; contents are never publicly exposed.
const MANIFEST_PATH = "system/manifest.json";
const TTL_MS = 30_000;

let cache: { data: Manifest; at: number } | null = null;

const EMPTY: Manifest = {
  generatedAt: new Date(0).toISOString(),
  count: 0,
  categories: [],
  folders: [],
  files: [],
};

async function loadRaw(): Promise<Manifest> {
  const text = await getObjectText(MANIFEST_PATH);
  if (!text) return { ...EMPTY };
  try {
    const data = JSON.parse(text) as Manifest;
    return {
      ...EMPTY,
      ...data,
      folders: data.folders ?? [],
      files: data.files ?? [],
      categories: data.categories ?? [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function getManifest(force = false): Promise<Manifest> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = await loadRaw();
  cache = { data, at: Date.now() };
  return data;
}

export async function saveManifest(m: Manifest): Promise<void> {
  const categories = deriveCategories(m.folders, m.files);
  const next: Manifest = { ...m, categories, count: m.files.length, generatedAt: new Date().toISOString() };
  await uploadObject(MANIFEST_PATH, JSON.stringify(next), "application/json");
  cache = { data: next, at: Date.now() };
}

export async function mutateManifest(fn: (m: Manifest) => void | Promise<void>): Promise<Manifest> {
  const m = await getManifest(true);
  const copy: Manifest = JSON.parse(JSON.stringify(m));
  await fn(copy);
  await saveManifest(copy);
  return cache!.data;
}

export async function addOrUpdateFile(entry: FileEntry): Promise<void> {
  await mutateManifest((m) => {
    m.files = m.files.filter((f) => f.key !== entry.key);
    m.files.push(entry);
    m.files.sort((a, b) => a.key.localeCompare(b.key));
    ensureFolder(m, entry.category ? [entry.category, ...entry.path].join("/") : "");
  });
}

export async function removeFileById(id: string): Promise<FileEntry | null> {
  let removed: FileEntry | null = null;
  await mutateManifest((m) => {
    const idx = m.files.findIndex((f) => f.id === id);
    if (idx >= 0) {
      removed = m.files[idx];
      m.files.splice(idx, 1);
    }
  });
  return removed;
}

export async function addFolder(folder: string): Promise<void> {
  await mutateManifest((m) => ensureFolder(m, folder));
}

export async function removeFolder(folder: string): Promise<FileEntry[]> {
  let removed: FileEntry[] = [];
  await mutateManifest((m) => {
    const prefix = folder + "/";
    removed = m.files.filter((f) => f.folderKey === folder || f.folderKey?.startsWith(prefix));
    m.files = m.files.filter((f) => !(f.folderKey === folder || f.folderKey?.startsWith(prefix)));
    m.folders = m.folders.filter((d) => !(d === folder || d.startsWith(prefix)));
  });
  return removed;
}

function ensureFolder(m: Manifest, folder: string): void {
  if (!folder) return;
  const parts = folder.split("/").filter(Boolean);
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    if (!m.folders.includes(acc)) m.folders.push(acc);
  }
  m.folders.sort();
}

function deriveCategories(folders: string[], files: FileEntry[]): string[] {
  const set = new Set<string>();
  for (const f of folders) set.add(f.split("/")[0]);
  for (const f of files) set.add(f.category);
  return [...set].filter(Boolean).sort();
}

// ---- search ----

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s-]+/g, "");
}

export interface SearchParams {
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  items: FileEntry[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export function searchFiles(files: FileEntry[], { q = "", category = "", page = 1, pageSize = 30 }: SearchParams): SearchResult {
  const query = q.trim();
  const nq = norm(query);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  let items = files;
  if (category) items = items.filter((f) => f.category === category);

  if (query) {
    items = items.filter((f) => {
      const hayName = f.name.toLowerCase();
      const hayFolder = f.folder.toLowerCase();
      const hayVehicle = f.vehicle ? norm(f.vehicle) : "";
      if (nq && hayVehicle.includes(nq)) return true;
      if (nq && norm(f.name).includes(nq)) return true;
      return terms.every((t) => hayName.includes(t) || hayFolder.includes(t));
    });
  }

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page: p, pageSize, pages };
}
