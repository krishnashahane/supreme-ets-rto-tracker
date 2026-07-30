export type Role = "superadmin" | "admin" | "user";

export interface SessionUser {
  id: string;
  username: string;
  role: Role;
}

export interface AdminRecord {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  createdBy: string;
}

export interface FileEntry {
  id: string;
  name: string;
  category: string;
  path: string[];
  folder: string;
  folderKey: string;
  ext: string;
  size: number;
  vehicle: string | null;
  key: string;
  /** Legacy Vercel Blob URL. Retained for backward-compat; R2 uses `key`. */
  url?: string;
}

export interface Manifest {
  generatedAt: string;
  count: number;
  categories: string[];
  folders: string[];
  files: FileEntry[];
}
