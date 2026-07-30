# Supreme ETS — RTO Document Tracker

A secure, production-grade document library for the Supreme fleet's RTO records
(RC, Insurance, PUC, Permit, Fitness Certificates, Road Tax). Anyone can search
and download; authenticated staff manage the library.

Live: **https://supreme-ets.vercel.app**

## Features

- 🔒 **Login-gated** — no anonymous access. Every visitor must sign in first;
  the app, search API and downloads all require a valid session.
- 🔎 **Search & download** — instant search by vehicle number, filename or
  folder, with category filters, image previews and one-click download.
- 🗂️ **Live document management** — admins create/delete folders and
  upload/delete files; changes appear immediately (no redeploy).
- 🔐 **Three-tier access**
  - **User** (`supreme.user`) — search & download only.
  - **Admin** — full document CRUD; can change their own password.
  - **Super Admin** — everything an admin can do **plus** add/remove admins and
    reset any admin's password; can change their own password too.
    The super admin is invisible to admins and users (no UI reveals its
    existence; it authenticates through the same sign-in).
- 🌗 **Light / dark theme** toggle (system-aware, no flash).
- 📈 **Vercel Analytics** built in.

## Security

- Session JWTs (`jose`, HS256) in `httpOnly`, `secure`, `sameSite=lax` cookies (8h).
- Passwords hashed with **bcrypt** (cost 12); constant-time username compare and
  timing-equalised login to resist user enumeration.
- Admin credentials stored **AES-256-GCM encrypted** in the private B2 bucket (`ADMIN_STORE_KEY`).
- Super-admin credentials live only in environment variables.
- Login **rate limiting** (8 / 15 min per IP); password-change rate limiting (5 / 15 min).
- **CSRF defense-in-depth**: cross-origin state-changing API requests rejected in middleware (on top of SameSite=Lax cookies).
- Super-admin password is **rotatable at runtime** (encrypted override blob), no redeploy needed.
- Strict **CSP** + HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, COOP (see `middleware.ts`).
- Path-traversal-safe folder/file handling (`lib/paths.ts`); uploads validated
  server-side and restricted to the private B2 bucket (short-lived presigned PUT URLs).
- `noindex` (private records).
- **0 known dependency vulnerabilities** (`npm audit`).

## Architecture

- **Next.js 16** (App Router, TypeScript) + **Tailwind CSS**.
- **Backblaze B2** (private, S3-compatible bucket via `@aws-sdk/client-s3`) stores
  every document plus the search manifest (`system/manifest.json`) and the encrypted
  admin store (`system/admins.enc`). The storage layer (`lib/r2.ts`) is provider-agnostic
  — any S3 API (B2 / R2 / S3 / MinIO) works via the `S3_*` env vars.
- The bucket is **private**: documents are served only through short-lived (15 min)
  presigned URLs; nothing is publicly reachable.
- The manifest is the search index; admin mutations rewrite it live (30s cache).
- **Vercel Blob is not used at runtime** — it appears only in the one-off
  `scripts/migrate-blob-to-r2.ts` migration tool (dev dependency).

## Environment variables

See `.env.example`. Set on Vercel (Production/Preview/Development):

| Var | Purpose |
|-----|---------|
| `S3_ENDPOINT` | Backblaze B2 S3 endpoint, e.g. `https://s3.us-east-005.backblazeb2.com` |
| `S3_ACCESS_KEY_ID` | B2 `keyID` (use a **non-master** application key) |
| `S3_SECRET_ACCESS_KEY` | B2 `applicationKey` |
| `S3_BUCKET` | Private bucket name (`sfm-docs`) |
| `SESSION_SECRET` | JWT signing key (`openssl rand -base64 48`) |
| `ADMIN_STORE_KEY` | AES-256 key, 64 hex chars (`openssl rand -hex 32`) |
| `SUPERADMIN_USERNAME` | Hidden super-admin login |
| `SUPERADMIN_PASSWORD_HASH` | bcrypt hash (`npm run hash "password"`) |
| `USER_USERNAME` | Basic user login (search + download) |
| `USER_PASSWORD_HASH` | bcrypt hash (`npm run hash "password"`) |

## Scripts

```bash
npm run dev              # local dev
npm run build            # production build
npm run upload:docs      # upload the "RTO DOCUMENTS" tree to B2 + publish the manifest
npm run seed:admin       # seed the default admin into the encrypted B2 store
npm run hash "pw"        # print a bcrypt hash for a password
npm run migrate          # one-off: copy legacy Vercel Blob objects into B2 (does NOT delete Blob)
npm run verify:migration # verify every Blob object exists in B2 with a matching size
```

## First-time setup

1. Create a **private** Backblaze B2 bucket + a non-master application key; set the `S3_*` env vars above.
2. `npm install`
3. `npm run upload:docs`  (uploads the `RTO DOCUMENTS/` tree to B2 and publishes the manifest)
4. `npm run seed:admin`  (creates the first admin)
5. `vercel --prod`

The `RTO DOCUMENTS/` source tree is **not** committed or deployed
(`.gitignore` / `.vercelignore`); it lives only in the private B2 bucket.
