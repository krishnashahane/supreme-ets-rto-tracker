# SOP — Supreme ETS / RTO Document Tracker

Operational runbook. Live: **https://supreme-ets.vercel.app**

Stack: Next.js 16 (App Router, TS) · Tailwind · private S3-compatible bucket
(Backblaze B2) · JWT sessions (`jose`) · bcrypt · Vercel hosting.

---

## 1. Setup / Install

**Prereqs**
- Node.js 20 or 22 LTS. **Avoid Node 25** — local `next dev` crashes with
  `MODULE_NOT_FOUND` (`next-test` require hook). Use `nvm use 22`.
- `vercel` CLI installed globally (not `npx`): `npm i -g vercel`.

**Steps**
```bash
nvm use 22
npm install            # if this hangs/errors, install from tarball (see §5)
cp .env.example .env.local   # fill values (see §2)
npm run dev            # http://localhost:3000
```

**First-run credentials**
- Super admin + basic user come from env vars. Hash a password first:
  ```bash
  npm run hash "your-password"   # prints bcrypt hash → paste into env
  ```
- Regular admins live in the encrypted store (`system/admins.enc`) in the bucket,
  managed at runtime by the super admin via **Admin → Admins**. Optional CLI seed:
  ```bash
  npm run seed:admin
  ```

**Key scripts** (`package.json`)
| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next dev / prod build / serve |
| `npm run hash "pw"` | bcrypt-hash a password for env vars |
| `npm run seed:admin` | seed an admin into the encrypted store |
| `npm run upload:docs` | bulk upload local docs → bucket + manifest (`tsx`) |
| `npm run set:cors` | set B2 bucket CORS so in-app browser uploads work |

---

## 2. Environment variables

Source of truth: `.env.example`. Set all on Vercel for **Production + Preview +
Development**. Never commit `.env.local`.

**Storage (S3_* preferred; R2_* legacy fallback)**
| Var | Purpose |
|---|---|
| `S3_ENDPOINT` | Full endpoint, e.g. `https://s3.us-east-005.backblazeb2.com` |
| `S3_REGION` | Signing region; auto-derived from a B2 endpoint if omitted |
| `S3_ACCESS_KEY_ID` | B2 keyID / access key |
| `S3_SECRET_ACCESS_KEY` | B2 applicationKey / secret |
| `S3_BUCKET` | Bucket name (default `sfm-docs`) |

> B2 requires a **non-master** application key. Master keys fail signing.

**Auth / crypto**
| Var | Purpose | Generate |
|---|---|---|
| `SESSION_SECRET` | JWT HS256 signing key (≥32 chars) | `openssl rand -base64 48` |
| `ADMIN_STORE_KEY` | AES-256-GCM key, **64 hex chars** | `openssl rand -hex 32` |
| `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD_HASH` | Hidden super admin | `npm run hash` |
| `USER_USERNAME` / `USER_PASSWORD_HASH` | Basic search+download user | `npm run hash` |
| `SUPERADMIN_ID` / `USER_ID` | Optional stable IDs | — |

**Optional**
- `UPLOAD_CONCURRENCY` — parallel uploads for `upload:docs` (default 10).
- `BLOB_READ_WRITE_TOKEN` — only for the legacy migration scripts. Not used at runtime.

Sync helpers:
```bash
vercel env pull .env.local     # pull current Vercel env locally
```

---

## 3. Deploy

Deploys are Vercel Git-linked; a push to `main` auto-deploys. Manual deploy:

```bash
vercel --prod --yes            # production → supreme-ets.vercel.app
vercel                         # preview URL only
```

**Notes**
- Use the **globally installed** `vercel`, not `npx vercel`.
- CLI output is buffered when piped; the final block prints
  `Production: …` + `Aliased: https://supreme-ets.vercel.app` on success.
- After deploy, smoke-test: load `/login`, sign in as user, run a search,
  download one file, sign in as admin, confirm CRUD.
- **No redeploy needed** for content or admin changes — the manifest and
  encrypted admin store live in the bucket and update live (30s manifest cache).
- Env var changes **do** require a redeploy to take effect.

---

## 4. Architecture (know before you touch)

- **`proxy.ts`** (Next 16's middleware) — enforces login on all routes, CSP +
  HSTS + security headers, CSRF origin check on state-changing requests. CSP
  storage host is derived from `S3_ENDPOINT`; **update it when changing provider**.
- **`lib/r2.ts`** — provider-agnostic S3 client. All object I/O + presigned URLs
  (15-min TTL). Downloads/uploads never touch the server body — signed URLs only.
- **`lib/manifest.ts`** — `system/manifest.json` is the search index. Admin
  mutations rewrite it via `mutateManifest`. 30s in-memory cache.
- **`lib/store.ts`** — AES-256-GCM encrypted admin/super/user records in the
  bucket (`system/*.enc`). Passwords rotatable at runtime, no redeploy.
- **`lib/auth.ts`** — JWT session (8h, httpOnly cookie), bcrypt (cost 12),
  `getSession` / `getStaffSession` / `requireRole`.
- **Roles**: `user` (search+download) · `admin` (doc CRUD + own password) ·
  `superadmin` (admins CRUD, hidden from everyone).

---

## 5. Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `MODULE_NOT_FOUND` on `next dev` | Node 25 | `nvm use 22` |
| `npm install` hangs / errors | env quirk | install Next from tarball, retry |
| Uploads fail buffering large/iCloud files | iCloud-offloaded docs | download locally first (remove offload), then upload |
| `Storage credentials missing` | S3_* / R2_* unset | set all storage env vars, redeploy |
| B2 `SignatureDoesNotMatch` / 403 | master app key used | issue a **non-master** B2 key |
| `SESSION_SECRET missing or too short` | secret < 32 chars | regenerate `openssl rand -base64 48` |
| `ADMIN_STORE_KEY missing or too short` | not 64 hex chars | `openssl rand -hex 32` |
| In-app uploads fail / nothing appears after upload | B2 bucket has no CORS rules → browser presigned PUT blocked | `npm run set:cors` (needs a B2 key with `writeBuckets`) |
| Thumbnails/downloads blocked in browser | CSP storage host mismatch | update `STORAGE` derivation in `proxy.ts` |
| Search stale after admin edit | 30s manifest cache | wait 30s or hard refresh |
| Env change not applied | env only loads at build | redeploy after `vercel env` changes |
| `vercel: command not found` in scripts | using `npx` | use global `vercel` |

**Credential rotation** — rotate any leaked key immediately. B2 key: create new
non-master key, update `S3_*` on Vercel, redeploy, delete old key. Passwords:
rotate in-app (super admin) or via `npm run hash` + env update + redeploy.

---

## 6. Adding a new feature safely

1. **Branch** off `main`. Never build on `main` directly.
2. **Reuse first** — check `lib/` (r2, auth, manifest, store, paths, types)
   before adding code. Match existing patterns and naming.
3. **New API route** (`app/api/...`):
   - `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`.
   - Gate access: `getSession()` for read, `getStaffSession()` / `requireRole()`
     for writes. Never trust client role.
   - Validate & sanitize all paths via `lib/paths.ts` (`cleanFolder`,
     `cleanFileName`, `buildKey`) — path traversal is the main risk.
   - Object access only through `lib/r2.ts`; never expose the bucket publicly.
4. **Content changes** go through `mutateManifest` so the index stays consistent.
5. **Security**: keep CSP intact; if you add an external host or storage
   provider, update `proxy.ts`. No inline secrets. Preserve rate limits
   (`lib/ratelimit.ts`) on auth/mutation endpoints.
6. **Validate**:
   ```bash
   npm run lint
   npm run build          # must pass clean
   ```
   Then manually test all three roles + the flow you changed.
7. **Deploy to preview first** (`vercel`), smoke-test the preview URL, then
   `vercel --prod`.
8. **Don't break**: login gating, download signing, manifest shape
   (`lib/types.ts`), and the hidden super admin (must stay invisible in UI/APIs).

---

_Last updated: 2026-07-19._
