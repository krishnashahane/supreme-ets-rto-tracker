// One-off: rotate super/user overrides + admin store password in Cloudflare R2.
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPER_PATH = "system/super.enc";
const USER_PATH = "system/user.enc";
const STORE_PATH = "system/admins.enc";

const SUPER_HASH = "$2a$12$EBgKfcRVm9ZzINbEcqeLgeOfFtWtRvdBjNxcf3E1lCFKp8jR1.RkS";
const USER_HASH = "$2a$12$WhXF14Vu./jULbOhT7LRfO5HBY2pkD/oF49RqOngjM9fKeec80uqG";
const ADMIN_USERNAME = "supreme.admin";
const ADMIN_HASH = "$2a$12$Z8z4hyy2NLWTG6pRnmjB3uKbO2fG2j2fb2gFeunPLL2ArUeT3xRX2";

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
const enc = (plain, keyHex) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const out = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), out]).toString("base64");
};
const dec = (b64, keyHex) => {
  const raw = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
};

function regionFromEndpoint(endpoint) {
  const m = endpoint.match(/s3[.-]([a-z0-9-]+)\.backblazeb2\.com/i);
  return m ? m[1] : "auto";
}
function r2() {
  let endpoint = process.env.S3_ENDPOINT;
  if (!endpoint && process.env.R2_ACCOUNT_ID) {
    endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  if (!endpoint) throw new Error("Missing S3_ENDPOINT (or R2_ACCOUNT_ID)");
  endpoint = endpoint.replace(/\/+$/, "");
  return {
    bucket: process.env.S3_BUCKET ?? process.env.R2_BUCKET ?? "sfm-docs",
    s3: new S3Client({
      region: process.env.S3_REGION ?? regionFromEndpoint(endpoint),
      endpoint,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY,
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
const write = (s3, bucket, key, body) =>
  s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" }));

async function main() {
  await loadEnv();
  const key = process.env.ADMIN_STORE_KEY;
  if (!key) throw new Error("Missing ADMIN_STORE_KEY");
  const { s3, bucket } = r2();

  const now = new Date().toISOString();
  await write(s3, bucket, SUPER_PATH, enc(JSON.stringify({ passwordHash: SUPER_HASH, updatedAt: now }), key));
  await write(s3, bucket, USER_PATH, enc(JSON.stringify({ passwordHash: USER_HASH, updatedAt: now }), key));
  console.log("super + user overrides updated");

  let admins = [];
  const raw = await readText(s3, bucket, STORE_PATH);
  if (raw) {
    try {
      admins = JSON.parse(dec(raw, key));
    } catch {}
  }
  const a = admins.find((x) => x.username.toLowerCase() === ADMIN_USERNAME.toLowerCase());
  if (a) a.passwordHash = ADMIN_HASH;
  else
    admins.push({
      id: crypto.randomUUID(),
      username: ADMIN_USERNAME,
      passwordHash: ADMIN_HASH,
      createdAt: now,
      createdBy: "seed",
    });
  await write(s3, bucket, STORE_PATH, enc(JSON.stringify(admins), key));
  console.log(`admin "${ADMIN_USERNAME}" password updated. total admins: ${admins.length}`);
}
main();
