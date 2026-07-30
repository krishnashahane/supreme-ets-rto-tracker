// One-off: push storage + auth env vars to Vercel (prod/preview/dev) via REST API.
// Idempotent: removes any existing entry for each key, then recreates it.
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = "prj_o2Ntqj3yN7dQydNQIwltAmaynQ5u";
const TEAM = "team_pFw1J1M4UePduUWFqA0EigXy";
const TARGETS = ["production", "preview", "development"];
const KEYS = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "SUPERADMIN_PASSWORD_HASH",
  "USER_PASSWORD_HASH",
];

async function loadEnvLocal() {
  const txt = await fs.readFile(path.join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function token() {
  const p = path.join(os.homedir(), "Library/Application Support/com.vercel.cli/auth.json");
  return JSON.parse(await fs.readFile(p, "utf8")).token;
}

async function api(tok, method, url, body) {
  const res = await fetch(`https://api.vercel.com${url}${url.includes("?") ? "&" : "?"}teamId=${TEAM}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text}`);
  return json;
}

async function main() {
  const tok = await token();
  const env = await loadEnvLocal();

  // list existing
  const list = await api(tok, "GET", `/v9/projects/${PROJECT}/env`);
  const existing = list.envs ?? [];

  for (const key of KEYS) {
    const value = env[key];
    if (value === undefined || value === "") {
      console.log(`SKIP ${key} (empty locally)`);
      continue;
    }
    // delete every existing entry for this key
    for (const e of existing.filter((x) => x.key === key)) {
      await api(tok, "DELETE", `/v9/projects/${PROJECT}/env/${e.id}`);
      console.log(`  deleted old ${key} (${e.id})`);
    }
    await api(tok, "POST", `/v10/projects/${PROJECT}/env`, {
      key,
      value,
      type: "encrypted",
      target: TARGETS,
    });
    console.log(`SET ${key} (len ${value.length}) -> ${TARGETS.join(",")}`);
  }
  console.log("DONE push-env");
}

main().catch((e) => {
  console.error("PUSH_ENV_FAILED", e.message);
  process.exit(1);
});
