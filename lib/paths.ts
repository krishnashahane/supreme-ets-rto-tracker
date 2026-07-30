// Validation + sanitisation for user-supplied folder paths and file names.
// Blob keys are built from these, so we strictly forbid traversal and control chars.

const SEG_RE = /^[A-Za-z0-9 _\-&().]+$/;
const UNSAFE_NAME = new Set(['<', '>', ':', '"', '|', '?', '*', '/', '\\']);

export function cleanFolder(input: string): string | null {
  if (typeof input !== "string") return null;
  const raw = input.replace(/\\/g, "/").trim();
  if (raw === "") return ""; // root
  const segments = raw.split("/").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return "";
  if (segments.length > 8) return null;
  for (const s of segments) {
    if (s === "." || s === "..") return null;
    if (s.length > 80) return null;
    if (!SEG_RE.test(s)) return null;
  }
  return segments.join("/");
}

export function cleanFileName(input: string): string | null {
  if (typeof input !== "string") return null;
  const name = input.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (!name || name === "." || name === "..") return null;
  if (name.length > 200) return null;
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 0x20 || UNSAFE_NAME.has(name[i])) return null;
  }
  return name;
}

export function buildKey(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

export function folderParts(folder: string): { category: string; path: string[] } {
  const parts = folder.split("/").filter(Boolean);
  return { category: parts[0] ?? "", path: parts.slice(1) };
}
