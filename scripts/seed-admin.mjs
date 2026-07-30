// Seeds the encrypted admin store (system/admins.enc) in Cloudflare R2 with the
// default administrator. Idempotent: keeps existing admins, adds if absent.
// Requires R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + ADMIN_STORE_KEY.
// Admin creds are read from .creds.tmp.json or ADMIN_USERNAME/ADMIN_PASSWORD_HASH.
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STORE_PATH = "system/admins.enc";

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

function enc(plain, keyHex) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const c = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), c]).toString("base64");
}
function dec(b64, keyHex) {
  const raw = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

function r2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  return {
    bucket: process.env.R2_BUCKET ?? "sfm-docs",
    s3: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    }),
  };
}

async function readText(s3, bucket, key) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await res.Body.transformToString();
  } catch {
    return null;
  }
}

async function main() {
  await loadEnv();
  const key = process.env.ADMIN_STORE_KEY;
  if (!key || !process.env.R2_ACCOUNT_ID) {
    console.error("Missing ADMIN_STORE_KEY or R2 credentials.");
    process.exit(1);
  }

  let username = process.env.ADMIN_USERNAME;
  let passwordHash = process.env.ADMIN_PASSWORD_HASH;
  try {
    const c = JSON.parse(await fs.readFile(path.join(ROOT, ".creds.tmp.json"), "utf8"));
    username ??= c.ADMIN_USERNAME;
    passwordHash ??= c.ADMIN_PASSWORD_HASH;
  } catch {}
  if (!username || !passwordHash) {
    console.error("Provide ADMIN_USERNAME + ADMIN_PASSWORD_HASH (or .creds.tmp.json).");
    process.exit(1);
  }

  const { s3, bucket } = r2();
  let admins = [];
  const raw = await readText(s3, bucket, STORE_PATH);
  if (raw) {
    try {
      admins = JSON.parse(dec(raw, key));
    } catch {}
  }

  if (admins.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
    console.log(`Admin "${username}" already exists. Nothing to do.`);
    return;
  }

  admins.push({
    id: crypto.randomUUID(),
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
    createdBy: "seed",
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: STORE_PATH,
      Body: enc(JSON.stringify(admins), key),
      ContentType: "text/plain",
    })
  );
  console.log(`Seeded admin "${username}". Total admins: ${admins.length}`);
}

main();
