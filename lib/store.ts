import "server-only";
import crypto from "node:crypto";
import { getObjectText, uploadObject } from "./r2";
import type { AdminRecord } from "./types";

// Admins are persisted as an AES-256-GCM encrypted object in the private R2
// bucket. Encryption is defence-in-depth: even with bucket access, credentials
// stay confidential without the ADMIN_STORE_KEY.
const STORE_PATH = "system/admins.enc";
const SUPER_PATH = "system/super.enc";
const USER_PATH = "system/user.enc";

function key(): Buffer {
  const k = process.env.ADMIN_STORE_KEY;
  if (!k || k.length < 64) {
    throw new Error("ADMIN_STORE_KEY missing or too short (need 64 hex chars)");
  }
  return Buffer.from(k, "hex");
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(b64: string): string {
  const raw = Buffer.from(b64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export async function getAdmins(): Promise<AdminRecord[]> {
  const raw = await getObjectText(STORE_PATH);
  if (!raw) return [];
  try {
    const data = JSON.parse(decrypt(raw));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function saveAdmins(admins: AdminRecord[]): Promise<void> {
  await uploadObject(STORE_PATH, encrypt(JSON.stringify(admins)), "text/plain");
}

export async function findAdminByUsername(username: string): Promise<AdminRecord | null> {
  const admins = await getAdmins();
  const u = username.trim().toLowerCase();
  return admins.find((a) => a.username.toLowerCase() === u) ?? null;
}

export async function findAdminById(id: string): Promise<AdminRecord | null> {
  const admins = await getAdmins();
  return admins.find((a) => a.id === id) ?? null;
}

// Updates one admin's password hash. Returns true if the admin existed.
export async function updateAdminPassword(id: string, passwordHash: string): Promise<boolean> {
  const admins = await getAdmins();
  const admin = admins.find((a) => a.id === id);
  if (!admin) return false;
  admin.passwordHash = passwordHash;
  await saveAdmins(admins);
  return true;
}

// Super admin password can be rotated at runtime via an encrypted override
// object, so it need not depend on redeploying the env var. Falls back to env.
async function getOverride(path: string): Promise<string | null> {
  const raw = await getObjectText(path);
  if (!raw) return null;
  try {
    const data = JSON.parse(decrypt(raw));
    return typeof data.passwordHash === "string" ? data.passwordHash : null;
  } catch {
    return null;
  }
}

async function saveOverride(path: string, passwordHash: string): Promise<void> {
  await uploadObject(
    path,
    encrypt(JSON.stringify({ passwordHash, updatedAt: new Date().toISOString() })),
    "text/plain"
  );
}

export function getSuperPasswordOverride(): Promise<string | null> {
  return getOverride(SUPER_PATH);
}
export function saveSuperPasswordOverride(passwordHash: string): Promise<void> {
  return saveOverride(SUPER_PATH, passwordHash);
}

// Basic user password can likewise be rotated at runtime via an encrypted
// override, falling back to the USER_PASSWORD_HASH env var when absent.
export function getUserPasswordOverride(): Promise<string | null> {
  return getOverride(USER_PATH);
}
export function saveUserPasswordOverride(passwordHash: string): Promise<void> {
  return saveOverride(USER_PATH, passwordHash);
}
