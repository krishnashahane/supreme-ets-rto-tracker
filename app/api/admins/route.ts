import { NextRequest, NextResponse } from "next/server";
import { getBasicUser, getSession, getSuperAdmin, hashPassword } from "@/lib/auth";
import {
  getAdmins,
  saveAdmins,
  saveUserPasswordOverride,
  updateAdminPassword,
} from "@/lib/store";
import type { AdminRecord } from "@/lib/types";
import { rateLimit } from "@/lib/ratelimit";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

async function requireSuper() {
  const user = await getSession();
  if (!user || user.role !== "superadmin") return null;
  return user;
}

// Per-super-admin write throttle: defence against runaway scripts / abuse.
function writeGuard(id: string) {
  const rl = rateLimit(`admins:${id}`, 40, 5 * 60_000);
  return rl.ok
    ? null
    : NextResponse.json(
        { error: "Too many changes. Slow down and retry shortly." },
        { status: 429, headers: NO_STORE }
      );
}

function publicView(a: AdminRecord) {
  return { id: a.id, username: a.username, createdAt: a.createdAt };
}

// Full identity roster for the super admin: the super admin (self), the shared
// basic user, and every provisioned admin. Always served live (no-store).
export async function GET() {
  const su = await requireSuper();
  if (!su) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });

  const sa = getSuperAdmin();
  const bu = getBasicUser();
  const admins = await getAdmins();

  return NextResponse.json(
    {
      superAdmin: sa ? { id: sa.id, username: sa.username } : null,
      basicUser: bu ? { id: bu.id, username: bu.username } : null,
      admins: admins.map(publicView),
    },
    { headers: NO_STORE }
  );
}

export async function POST(req: NextRequest) {
  const su = await requireSuper();
  if (!su) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const throttled = writeGuard(su.id);
  if (throttled) return throttled;

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3–40 chars (letters, numbers, . _ -)" },
      { status: 400, headers: NO_STORE }
    );
  }
  if (password.length < 8 || password.length > 200) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400, headers: NO_STORE }
    );
  }

  const sa = getSuperAdmin();
  const bu = getBasicUser();
  const taken = [sa?.username, bu?.username].filter(Boolean).map((u) => u!.toLowerCase());
  if (taken.includes(username.toLowerCase())) {
    return NextResponse.json({ error: "Username unavailable" }, { status: 409, headers: NO_STORE });
  }

  const admins = await getAdmins();
  if (admins.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
    return NextResponse.json({ error: "Admin already exists" }, { status: 409, headers: NO_STORE });
  }

  const record: AdminRecord = {
    id: crypto.randomUUID(),
    username,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
    createdBy: su.username,
  };
  admins.push(record);
  await saveAdmins(admins);
  return NextResponse.json({ ok: true, admin: publicView(record) }, { headers: NO_STORE });
}

// Super admin sets a password for the shared basic user or any admin.
export async function PATCH(req: NextRequest) {
  const su = await requireSuper();
  if (!su) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const throttled = writeGuard(su.id);
  if (throttled) return throttled;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  const password = typeof body?.password === "string" ? body.password : "";
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Missing id" }, { status: 400, headers: NO_STORE });
  }
  if (password.length < 8 || password.length > 200) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400, headers: NO_STORE }
    );
  }

  const sa = getSuperAdmin();
  if (sa && id === sa.id) {
    return NextResponse.json(
      { error: "Change the super admin password from Account." },
      { status: 400, headers: NO_STORE }
    );
  }

  const bu = getBasicUser();
  if (bu && id === bu.id) {
    await saveUserPasswordOverride(await hashPassword(password));
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  const ok = await updateAdminPassword(id, await hashPassword(password));
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  const su = await requireSuper();
  if (!su) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const throttled = writeGuard(su.id);
  if (throttled) return throttled;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Missing id" }, { status: 400, headers: NO_STORE });
  }

  const sa = getSuperAdmin();
  const bu = getBasicUser();
  if ((sa && id === sa.id) || (bu && id === bu.id)) {
    return NextResponse.json(
      { error: "Built-in accounts cannot be removed." },
      { status: 400, headers: NO_STORE }
    );
  }

  const admins = await getAdmins();
  const next = admins.filter((a) => a.id !== id);
  if (next.length === admins.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  }
  await saveAdmins(next);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
