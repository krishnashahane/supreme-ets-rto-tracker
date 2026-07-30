import { NextRequest, NextResponse } from "next/server";
import { createSession, getBasicUser, getSuperAdmin, safeEqual, verifyPassword } from "@/lib/auth";
import { findAdminByUsername, getSuperPasswordOverride, getUserPasswordOverride } from "@/lib/store";
import { rateLimit, sweep } from "@/lib/ratelimit";
import type { SessionUser } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}

// A dummy hash so failed lookups still spend ~equal time (mitigates user enumeration).
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO0000000000000000000000000000000000";

export async function POST(req: NextRequest) {
  sweep();
  const ip = clientIp(req);
  const rl = rateLimit(`login:${ip}`, 8, 15 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || username.length > 100 || password.length > 200) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  let user: SessionUser | null = null;

  const sa = getSuperAdmin();
  const bu = getBasicUser();
  const uname = username.toLowerCase();

  if (sa && safeEqual(uname, sa.username.toLowerCase())) {
    const override = await getSuperPasswordOverride();
    if (await verifyPassword(password, override ?? sa.passwordHash)) {
      user = { id: sa.id, username: sa.username, role: "superadmin" };
    }
  } else if (bu && safeEqual(uname, bu.username.toLowerCase())) {
    const override = await getUserPasswordOverride();
    if (await verifyPassword(password, override ?? bu.passwordHash)) {
      user = { id: bu.id, username: bu.username, role: "user" };
    }
  } else {
    const admin = await findAdminByUsername(username);
    if (admin) {
      if (await verifyPassword(password, admin.passwordHash)) {
        user = { id: admin.id, username: admin.username, role: "admin" };
      }
    } else {
      await verifyPassword(password, DUMMY_HASH); // equalize timing
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await createSession(user);
  return NextResponse.json({ ok: true, role: user.role });
}
