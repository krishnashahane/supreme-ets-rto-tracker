import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { addOrUpdateFile, getManifest, removeFileById } from "@/lib/manifest";
import { cleanFileName, cleanFolder, buildKey, folderParts } from "@/lib/paths";
import { extractVehicle, fileId } from "@/lib/vehicle";
import { deleteObject, headObjectSize } from "@/lib/r2";
import type { FileEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List files + immediate subfolders within a folder (admin browser).
export async function GET(req: NextRequest) {
  const user = await getStaffSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const folder = cleanFolder(req.nextUrl.searchParams.get("folder") ?? "");
  if (folder === null) return NextResponse.json({ error: "Invalid folder" }, { status: 400 });

  const m = await getManifest(true);
  const prefix = folder ? folder + "/" : "";
  const depth = folder ? folder.split("/").length : 0;

  const sub = new Set<string>();
  for (const d of m.folders) {
    if (folder ? d.startsWith(prefix) : true) {
      const segs = d.split("/");
      if (segs.length === depth + 1) sub.add(d);
    }
  }
  const files = m.files.filter((f) => f.folderKey === folder);

  return NextResponse.json(
    {
      folder,
      subfolders: [...sub].sort(),
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Register an uploaded blob into the manifest.
export async function POST(req: NextRequest) {
  const user = await getStaffSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const folder = cleanFolder(body.folder ?? "");
  const name = cleanFileName(body.name ?? "");
  if (folder === null || !folder || name === null) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const key = buildKey(folder, name);

  // Confirm the object actually landed in R2 before recording it, and trust the
  // storage-reported size over the client's claim.
  const size = await headObjectSize(key);
  if (size === null) {
    return NextResponse.json({ error: "Upload not found in storage" }, { status: 400 });
  }

  const { category, path } = folderParts(folder);
  const ext = (name.split(".").pop() ?? "").toLowerCase();

  const entry: FileEntry = {
    id: fileId(key),
    name,
    category,
    path,
    folder: path.length ? `${category} / ${path.join(" / ")}` : category,
    folderKey: folder,
    ext,
    size,
    vehicle: extractVehicle(name),
    key,
  };

  await addOrUpdateFile(entry);
  return NextResponse.json({ ok: true, file: entry });
}

// Delete a file (blob + manifest entry).
export async function DELETE(req: NextRequest) {
  const user = await getStaffSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const removed = await removeFileById(id);
  if (removed?.key) {
    try {
      await deleteObject(removed.key);
    } catch {
      /* object already gone — manifest is source of truth */
    }
  }
  return NextResponse.json({ ok: true });
}
