import { NextRequest, NextResponse } from "next/server";
import { getSession, getSuperAdmin, hashPassword, verifyPassword } from "@/lib/auth";
import {
  findAdminById,
  getSuperPasswordOverride,
  saveSuperPasswordOverride,
  updateAdminPassword,
} from "@/lib/store";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// Self-service password change for staff only (admin + super admin).
// Basic users cannot change their own password; a super admin manages it.
export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user || user.role === "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  const rl = rateLimit(`pwchange:${user.id}`, 5, 15 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: NO_STORE }
    );
  }

  const body = await req.json().catch(() => null);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (newPassword.length < 8 || newPassword.length > 200) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400, headers: NO_STORE }
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must differ from the current one" },
      { status: 400, headers: NO_STORE }
    );
  }

  if (user.role === "superadmin") {
    const sa = getSuperAdmin();
    const override = await getSuperPasswordOverride();
    const currentHash = override ?? sa?.passwordHash ?? "";
    if (!(await verifyPassword(currentPassword, currentHash))) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401, headers: NO_STORE }
      );
    }
    await saveSuperPasswordOverride(await hashPassword(newPassword));
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  // admin
  const admin = await findAdminById(user.id);
  if (!admin) {
    return NextResponse.json({ error: "Account not found" }, { status: 404, headers: NO_STORE });
  }
  if (!(await verifyPassword(currentPassword, admin.passwordHash))) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 401, headers: NO_STORE }
    );
  }
  await updateAdminPassword(admin.id, await hashPassword(newPassword));
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
