import { NextResponse, type NextRequest } from "next/server";

const isDev = process.env.NODE_ENV !== "production";

const VA = "https://va.vercel-scripts.com";
const INSIGHTS = "https://*.vercel-insights.com";

// Storage host for signed GET (thumbnails) + presigned PUT (uploads). Derived
// from the configured S3 endpoint so it works with any provider (Backblaze B2,
// R2, S3). Both the base host and its wildcard are allowed to cover path-style
// and virtual-hosted-style (bucket-as-subdomain) signed URLs.
const STORAGE = (() => {
  let endpoint = process.env.S3_ENDPOINT;
  if (!endpoint && process.env.R2_ACCOUNT_ID) {
    endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  try {
    const host = new URL(endpoint ?? "https://s3.us-east-005.backblazeb2.com").host;
    return `https://${host} https://*.${host}`;
  } catch {
    return "https://*.backblazeb2.com https://*.r2.cloudflarestorage.com";
  }
})();

function csp(): string {
  const script = isDev
    ? `'self' 'unsafe-inline' 'unsafe-eval' ${VA}`
    : `'self' 'unsafe-inline' ${VA}`;
  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    // Signed storage URLs (thumbnails / inline views) resolve on the storage host.
    `img-src 'self' data: blob: ${STORAGE}`,
    `script-src ${script}`,
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self' data:`,
    // Presigned PUT uploads stream directly to the storage host.
    `connect-src 'self' ${STORAGE} ${VA} ${INSIGHTS}`,
    `worker-src 'self' blob:`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(req: NextRequest) {
  // CSRF defense-in-depth: reject cross-site state-changing API requests.
  // (SameSite=Lax already blocks cookie on cross-site POST; this is belt-and-braces.)
  if (MUTATING.has(req.method) && req.nextUrl.pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");
    if (origin) {
      let ok = false;
      try {
        ok = new URL(origin).host === req.headers.get("host");
      } catch {
        ok = false;
      }
      if (!ok) {
        return new NextResponse(JSON.stringify({ error: "Cross-origin request blocked" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  }

  const res = NextResponse.next();
  const h = res.headers;
  h.set("Content-Security-Policy", csp());
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  h.set("X-DNS-Prefetch-Control", "off");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  h.set("X-Permitted-Cross-Domain-Policies", "none");
  h.set("Origin-Agent-Cluster", "?1");
  if (!isDev) {
    h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return res;
}

export const config = {
  // apply to everything except Next internals & static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|icon.png|apple-icon.png).*)"],
};
