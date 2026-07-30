import { NextRequest, NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest";
import { getSession } from "@/lib/auth";
import { getSignedDownloadUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authenticated gateway to a document. The R2 bucket is private, so we mint a
// short-lived (15-min) signed URL that forces an attachment download with the
// original filename, then redirect the browser to it. No public bucket access.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const manifest = await getManifest();
  const file = manifest.files.find((f) => f.id === id);
  if (!file || !file.key) {
    return new NextResponse("Not found", { status: 404 });
  }

  const inline = req.nextUrl.searchParams.get("view") === "1";
  const signed = await getSignedDownloadUrl(file.key, file.name, inline);
  return NextResponse.redirect(signed, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
