const NONCE_PATTERN = /^[A-Za-z0-9+/_=-]+$/;

/**
 * Build the request-scoped CSP used by middleware. Keeping this pure makes the
 * policy independently testable and prevents a static header from drifting
 * away from the nonce Next.js applies to its rendered scripts and styles.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  isDevelopment: boolean,
): string {
  if (!NONCE_PATTERN.test(nonce)) {
    throw new TypeError("CSP nonce contains unsupported characters.");
  }

  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];
  const connectSources = [
    "'self'",
    "https://vitals.vercel-insights.com",
    ...(isDevelopment ? ["ws:", "wss:"] : []),
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'none'",
    "img-src 'self' data: https://avatars.githubusercontent.com https://api.dicebear.com",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
