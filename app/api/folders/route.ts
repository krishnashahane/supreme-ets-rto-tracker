import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { addFolder, removeFolder } from "@/lib/manifest";
import { cleanFolder } from "@/lib/paths";
import { deleteObject } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a folder.
export async function POST(req: NextRequest) {
  const user = await getStaffSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parent = cleanFolder(body?.parent ?? "");
  const name = cleanFolder(body?.name ?? "");
  if (parent === null || name === null || !name || name.includes("/")) {
    return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
  }
  const folder = parent ? `${parent}/${name}` : name;
  await addFolder(folder);
  return NextResponse.json({ ok: true, folder });
}

// Delete a folder and everything inside it.
export async function DELETE(req: NextRequest) {
  const user = await getStaffSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const folder = cleanFolder(body?.folder ?? "");
  if (folder === null || !folder) {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }

  const removed = await removeFolder(folder);
  await Promise.allSettled(
    removed.filter((f) => f.key).map((f) => deleteObject(f.key))
  );
  return NextResponse.json({ ok: true, deleted: removed.length });
}
