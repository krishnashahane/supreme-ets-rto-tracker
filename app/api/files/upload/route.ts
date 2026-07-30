import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { cleanFileName, cleanFolder, buildKey } from "@/lib/paths";
import { getSignedUploadUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Issues a short-lived presigned PUT URL (only to authenticated staff) so large
// files stream straight to R2, bypassing the serverless request body limit.
// The bucket is private; this URL is the only write path and expires in 15 min.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getStaffSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const folder = cleanFolder(body?.folder ?? "");
  const name = cleanFileName(body?.name ?? "");
  if (folder === null || !folder || name === null) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const contentType = typeof body?.contentType === "string" ? body.contentType : undefined;
  const key = buildKey(folder, name);
  const uploadUrl = await getSignedUploadUrl(key, contentType);
  return NextResponse.json({ key, uploadUrl });
}
