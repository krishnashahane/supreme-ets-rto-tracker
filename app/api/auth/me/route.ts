import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ user: null }, { status: 200, headers: NO_STORE });
  return NextResponse.json(
    { user: { username: user.username, role: user.role } },
    { headers: NO_STORE }
  );
}
