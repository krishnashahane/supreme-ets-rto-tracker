import { NextRequest, NextResponse } from "next/server";
import { getManifest, searchFiles } from "@/lib/manifest";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").slice(0, 120);
  const category = (sp.get("category") ?? "").slice(0, 80);
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(60, Math.max(6, parseInt(sp.get("pageSize") ?? "30", 10) || 30));

  const manifest = await getManifest();
  const result = searchFiles(manifest.files, { q, category, page, pageSize });

  return NextResponse.json(
    { ...result, categories: manifest.categories, totalAll: manifest.count },
    { headers: { "Cache-Control": "no-store" } }
  );
}
