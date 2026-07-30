/**
 * Configure CORS on the private Backblaze B2 bucket so the app's browser-side
 * presigned PUT uploads (and inline image GETs) are allowed cross-origin.
 *
 * Without these rules the browser blocks the direct-to-B2 PUT and in-app RTO
 * document uploads silently fail. Bucket stays private — CORS only governs which
 * web origins may use already-signed URLs; it grants no unauthenticated access.
 *
 * Requires a NON-master B2 application key with the `writeBuckets` capability
 * (the same S3_* creds the app uses). Run: node scripts/set-b2-cors.mjs
 *
 * Origins allowed are taken from APP_ORIGINS (comma-separated) or default to the
 * production site plus localhost for dev.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const txt = await fs.readFile(path.join(ROOT, file), "utf8");
      for (const line of txt.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
}

await loadEnv();

const keyId = process.env.S3_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
const appKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.S3_BUCKET ?? process.env.R2_BUCKET ?? "sfm-docs";
if (!keyId || !appKey) throw new Error("Missing S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY");

const origins = (process.env.APP_ORIGINS ??
  "https://supreme-ets.vercel.app,http://localhost:3000")
  .split(",").map((s) => s.trim()).filter(Boolean);

const authRes = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
  headers: { Authorization: "Basic " + Buffer.from(`${keyId}:${appKey}`).toString("base64") },
});
const auth = await authRes.json();
if (!authRes.ok) throw new Error("B2 auth failed: " + JSON.stringify(auth));
const apiUrl = auth.apiInfo.storageApi.apiUrl;
const token = auth.authorizationToken;

const listRes = await fetch(`${apiUrl}/b2api/v3/b2_list_buckets`, {
  method: "POST",
  headers: { Authorization: token, "Content-Type": "application/json" },
  body: JSON.stringify({ accountId: auth.accountId, bucketName }),
});
const list = await listRes.json();
if (!listRes.ok) throw new Error("list_buckets failed: " + JSON.stringify(list));
const bucket = list.buckets?.[0];
if (!bucket) throw new Error(`Bucket ${bucketName} not found`);

const corsRules = [
  {
    corsRuleName: "app-uploads",
    allowedOrigins: origins,
    allowedOperations: ["s3_put", "s3_get", "s3_head"],
    allowedHeaders: ["*"],
    exposeHeaders: ["etag"],
    maxAgeSeconds: 3600,
  },
];

const updRes = await fetch(`${apiUrl}/b2api/v3/b2_update_bucket`, {
  method: "POST",
  headers: { Authorization: token, "Content-Type": "application/json" },
  body: JSON.stringify({
    accountId: auth.accountId,
    bucketId: bucket.bucketId,
    corsRules,
  }),
});
const upd = await updRes.json();
if (!updRes.ok) throw new Error("update_bucket failed: " + JSON.stringify(upd));

console.log(`CORS set on ${bucketName} for: ${origins.join(", ")}`);
console.log(JSON.stringify(upd.corsRules, null, 2));
