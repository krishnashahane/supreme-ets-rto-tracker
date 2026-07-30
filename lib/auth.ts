import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role, SessionUser } from "./types";

const COOKIE = "ets_session";
const ALG = "HS256";
const MAX_AGE = 60 * 60 * 8; // 8 hours

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET is missing or too short (need >=32 chars)");
  }
  return new TextEncoder().encode(s);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    if (!payload.sub || !payload.role) return null;
    return {
      id: String(payload.sub),
      username: String(payload.username ?? ""),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

// Returns the session only if the caller is staff (admin or superadmin).
export async function getStaffSession(): Promise<SessionUser | null> {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) return null;
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getSession();
  if (!user || !roles.includes(user.role)) {
    throw new AuthError();
  }
  return user;
}

export class AuthError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "AuthError";
  }
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(pw, hash);
}

// Constant-time-ish string compare for usernames.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function getSuperAdmin(): { id: string; username: string; passwordHash: string } | null {
  const username = process.env.SUPERADMIN_USERNAME;
  const passwordHash = process.env.SUPERADMIN_PASSWORD_HASH;
  if (!username || !passwordHash) return null;
  return { id: process.env.SUPERADMIN_ID || "superadmin", username, passwordHash };
}

export function getBasicUser(): { id: string; username: string; passwordHash: string } | null {
  const username = process.env.USER_USERNAME;
  const passwordHash = process.env.USER_PASSWORD_HASH;
  if (!username || !passwordHash) return null;
  return { id: process.env.USER_ID || "user", username, passwordHash };
}