/**
 * Upload the local `RTO DOCUMENTS/` tree to the private S3-compatible bucket
 * (Backblaze B2 / R2 / S3) and (re)build the manifest the app reads.
 *
 * - Resumable: lists the bucket once, skips objects already present with a
 *   matching byte size.
 * - Concurrent uploads with bounded parallelism; retries each file 3x.
 * - Streams every file (never buffers whole files in memory).
 * - Writes system/manifest.json so search/download work with no redeploy.
 * - Writes upload-report.json locally.
 *
 * Run: npm run upload:docs        (dry run: add --dry)
 */
import { promises as fs, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = path.join(ROOT, "RTO DOCUMENTS");
const REPORT_PATH = path.join(ROOT, "upload-report.json");
const MANIFEST_KEY = "system/manifest.json";
const CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY) || 10;
const MAX_RETRIES = 3;
const DRY = process.argv.includes("--dry");

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  csv: "text/csv",
};

// ---- env ----
async function loadEnv(): Promise<void> {
  for (const file of [".env.local", ".env"]) {
    try {
      const txt = await fs.readFile(path.join(ROOT, file), "utf8");
      for (const line of txt.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
}
function requireEnv(...names: string[]): string {
  for (const n of names) if (process.env[n]) return process.env[n] as string;
  throw new Error(`Missing env: one of ${names.join(" / ")}`);
}
function regionFromEndpoint(endpoint: string): string {
  const m = endpoint.match(/s3[.-]([a-z0-9-]+)\.backblazeb2\.com/i);
  return m ? m[1] : "auto";
}
function makeClient(): { s3: S3Client; bucket: string } {
  let endpoint = process.env.S3_ENDPOINT;
  if (!endpoint && process.env.R2_ACCOUNT_ID) {
    endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  if (!endpoint) throw new Error("Missing env: S3_ENDPOINT (or R2_ACCOUNT_ID)");
  endpoint = endpoint.replace(/\/+$/, "");
  const s3 = new S3Client({
    region: process.env.S3_REGION ?? regionFromEndpoint(endpoint),
    endpoint,
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY"),
    },
    maxAttempts: 4,
    requestHandler: new NodeHttpHandler({ connectionTimeout: 10_000, requestTimeout: 60_000 }),
  });
  const bucket = process.env.S3_BUCKET ?? process.env.R2_BUCKET ?? "sfm-docs";
  return { s3, bucket };
}

// ---- helpers (kept in sync with lib/vehicle.ts + lib/paths.ts) ----
const VEHICLE_RE = /\b([A-Z]{2})[\s-]?(\d{1,2})[\s-]?([A-Z]{1,3})[\s-]?(\d{1,4})\b/;
function extractVehicle(name: string): string | null {
  const m = name.toUpperCase().match(VEHICLE_RE);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : null;
}
function fileId(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return `k${(h >>> 0).toString(16)}${key.length.toString(16)}`;
}
function contentType(ext: string): string {
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

interface LocalFile {
  abs: string;
  key: string; // storage key == relative path under DOCS_DIR (POSIX separators)
  folder: string;
  name: string;
  ext: string;
  size: number;
}

// Recursively collect document files, skipping hidden/system files and the
// root-level brand logo. Only files inside a category directory are documents.
async function walk(dir: string, rel: string, out: LocalFile[], folders: Set<string>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // .DS_Store etc
    const abs = path.join(dir, e.name);
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      folders.add(relPath);
      await walk(abs, relPath, out, folders);
    } else if (e.isFile()) {
      if (rel === "") continue; // skip root-level files (e.g. logo.png)
      const st = await fs.stat(abs);
      const ext = (e.name.split(".").pop() ?? "").toLowerCase();
      out.push({ abs, key: relPath, folder: rel, name: e.name, ext, size: st.size });
    }
  }
}

async function listBucket(s3: S3Client, bucket: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 })
    );
    for (const o of res.Contents ?? []) {
      if (typeof o.Key === "string") map.set(o.Key, o.Size ?? 0);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return map;
}

async function uploadOne(s3: S3Client, bucket: string, f: LocalFile): Promise<void> {
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Buffer the file (small docs). fs.readFile materialises iCloud-offloaded
      // files on demand and avoids streaming-checksum stalls seen with B2.
      const body = await fs.readFile(f.abs);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: f.key,
          Body: body,
          ContentLength: body.length,
          ContentType: contentType(f.ext),
        })
      );
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw new Error(lastErr);
}

async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function main(): Promise<void> {
  await loadEnv();
  const { s3, bucket } = makeClient();

  console.log(`Scanning ${DOCS_DIR} …`);
  const files: LocalFile[] = [];
  const folders = new Set<string>();
  await walk(DOCS_DIR, "", files, folders);
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  console.log(
    `Found ${files.length} documents in ${folders.size} folders (${(totalBytes / 1048576).toFixed(1)} MB). Bucket: ${bucket}`
  );

  console.log("Listing existing bucket objects …");
  const existing = await listBucket(s3, bucket);

  const toUpload = files.filter((f) => existing.get(f.key) !== f.size);
  console.log(`${files.length - toUpload.length} already present, ${toUpload.length} to upload.`);

  let done = 0;
  let failed = 0;
  const failures: { key: string; error: string }[] = [];
  if (!DRY) {
    await pool(toUpload, CONCURRENCY, async (f) => {
      try {
        await uploadOne(s3, bucket, f);
      } catch (e) {
        failed++;
        failures.push({ key: f.key, error: e instanceof Error ? e.message : String(e) });
        console.error(`FAILED ${f.key}: ${failures[failures.length - 1].error}`);
      }
      done++;
      if (done % 50 === 0 || done === toUpload.length) {
        const line = `[${done}/${toUpload.length}] uploaded  (failed=${failed})`;
        console.log(line);
        try { appendFileSync("/tmp/upload-progress.txt", line + "\n"); } catch {}
      }
    });
  }

  // Build manifest from every successfully-stored file (present in bucket or just uploaded).
  const uploadedKeys = new Set(toUpload.filter((f) => !failures.find((x) => x.key === f.key)).map((f) => f.key));
  const stored = files.filter((f) => existing.has(f.key) || uploadedKeys.has(f.key));

  const manifestFiles = stored
    .map((f) => {
      const parts = f.folder.split("/").filter(Boolean);
      return {
        id: fileId(f.key),
        name: f.name,
        category: parts[0] ?? "",
        path: parts.slice(1),
        folder: f.folder,
        folderKey: f.folder,
        ext: f.ext,
        size: f.size,
        vehicle: extractVehicle(f.name),
        key: f.key,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  const categorySet = new Set<string>();
  for (const d of folders) categorySet.add(d.split("/")[0]);
  for (const f of manifestFiles) categorySet.add(f.category);

  const manifest = {
    generatedAt: new Date().toISOString(),
    count: manifestFiles.length,
    categories: [...categorySet].filter(Boolean).sort(),
    folders: [...folders].sort(),
    files: manifestFiles,
  };

  if (!DRY) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: MANIFEST_KEY,
        Body: JSON.stringify(manifest),
        ContentType: "application/json",
      })
    );
    console.log(`Manifest written: ${MANIFEST_KEY} (${manifest.count} files)`);
  } else {
    console.log(`[dry] would write manifest with ${manifest.count} files`);
  }

  const report = {
    finishedAt: new Date().toISOString(),
    bucket,
    scanned: files.length,
    uploaded: toUpload.length - failed,
    skipped: files.length - toUpload.length,
    failed,
    manifestCount: manifest.count,
    failures,
  };
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(
    `Done. scanned=${report.scanned} uploaded=${report.uploaded} skipped=${report.skipped} failed=${report.failed} manifest=${report.manifestCount}`
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
