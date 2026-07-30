import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";

// Private S3-compatible object storage. Works with any S3 API provider
// (Backblaze B2, Cloudflare R2, AWS S3, MinIO). The bucket is PRIVATE: no object
// is publicly reachable. Reads happen server-side or via short-lived signed URLs.
//
// Config (S3_* preferred; R2_* kept for backward compatibility):
//   S3_ENDPOINT           full endpoint URL, e.g. https://s3.us-east-005.backblazeb2.com
//   S3_REGION             signing region, e.g. us-east-005 (parsed from B2 endpoint if omitted)
//   S3_ACCESS_KEY_ID      access key id  (B2: keyID)
//   S3_SECRET_ACCESS_KEY  secret key     (B2: applicationKey)
//   S3_BUCKET             bucket name
//   R2_ACCOUNT_ID         (R2 only) builds endpoint https://<id>.r2.cloudflarestorage.com

export const R2_BUCKET = process.env.S3_BUCKET ?? process.env.R2_BUCKET ?? "sfm-docs";
const DOWNLOAD_TTL = 15 * 60; // 15 minutes
const UPLOAD_TTL = 15 * 60;

let client: S3Client | null = null;

/** Derive the signing region from an S3 endpoint (e.g. Backblaze `s3.us-east-005.backblazeb2.com`). */
function regionFromEndpoint(endpoint: string): string {
  const m = endpoint.match(/s3[.-]([a-z0-9-]+)\.backblazeb2\.com/i);
  return m ? m[1] : "auto";
}

function resolveEndpoint(): string | null {
  if (process.env.S3_ENDPOINT) return process.env.S3_ENDPOINT.replace(/\/+$/, "");
  if (process.env.R2_ACCOUNT_ID) return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return null;
}

function r2(): S3Client {
  if (client) return client;
  const endpoint = resolveEndpoint();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Storage credentials missing (S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY, or R2_* equivalents)"
    );
  }
  const region = process.env.S3_REGION ?? regionFromEndpoint(endpoint);
  client = new S3Client({ region, endpoint, credentials: { accessKeyId, secretAccessKey } });
  return client;
}

export interface R2Object {
  key: string;
  size: number;
}

/** Upload bytes (server-side). Used for small system objects (manifest, enc stores). */
export async function uploadObject(
  key: string,
  body: Uint8Array | string,
  contentType?: string
): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/** Fetch an object body as a Node stream plus basic metadata. Returns null if absent. */
export async function getObjectStream(
  key: string
): Promise<{ body: Readable; contentType: string; contentLength: number | null } | null> {
  try {
    const res = await r2().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    if (!res.Body) return null;
    return {
      body: res.Body as Readable,
      contentType: res.ContentType ?? "application/octet-stream",
      contentLength: typeof res.ContentLength === "number" ? res.ContentLength : null,
    };
  } catch {
    return null;
  }
}

/** Read a whole object into a string (small system objects only). Null if absent. */
export async function getObjectText(key: string): Promise<string | null> {
  try {
    const res = await r2().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    if (!res.Body) return null;
    return await res.Body.transformToString();
  } catch {
    return null;
  }
}

/**
 * Presigned GET URL (15-min). Defaults to forcing an attachment download with
 * the given filename; pass `inline` to view in-browser (e.g. image thumbnails).
 */
export async function getSignedDownloadUrl(
  key: string,
  filename?: string,
  inline = false
): Promise<string> {
  const safe = filename ? filename.replace(/[^\w.\- ]+/g, "_") : undefined;
  const disposition = inline
    ? safe
      ? `inline; filename="${safe}"`
      : "inline"
    : safe
      ? `attachment; filename="${safe}"`
      : "attachment";
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ResponseContentDisposition: disposition,
    }),
    { expiresIn: DOWNLOAD_TTL }
  );
}

/** Presigned PUT URL (15-min) so large files upload straight to R2 (no server buffering). */
export async function getSignedUploadUrl(key: string, contentType?: string): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_TTL }
  );
}

export async function deleteObject(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

/** HEAD an object; returns its size or null when it does not exist. */
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return typeof res.ContentLength === "number" ? res.ContentLength : 0;
  } catch {
    return null;
  }
}

/** List every object, transparently following pagination cursors. */
export async function listObjects(prefix?: string): Promise<R2Object[]> {
  const out: R2Object[] = [];
  let token: string | undefined;
  do {
    const res = await r2().send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    for (const o of res.Contents ?? []) {
      if (typeof o.Key === "string") out.push({ key: o.Key, size: o.Size ?? 0 });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}
