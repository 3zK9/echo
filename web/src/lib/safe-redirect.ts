const INVALID_REDIRECT_CHARACTERS = /[\\\u0000-\u001f\u007f]/;
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;
const VALIDATION_ORIGIN = "https://echo.invalid";

/**
 * Return a canonical app-relative callback path. Network-path references,
 * backslashes, control characters, and encoded path separators are rejected
 * before URL normalization can turn them into a cross-origin redirect.
 */
export function safeCallbackPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (INVALID_REDIRECT_CHARACTERS.test(value)) return fallback;

  const pathOnly = value.split(/[?#]/, 1)[0];
  if (ENCODED_PATH_SEPARATOR.test(pathOnly)) return fallback;

  try {
    const base = new URL(VALIDATION_ORIGIN);
    const target = new URL(value, base);
    if (target.origin !== base.origin || target.pathname.startsWith("//")) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

/** Resolve an OAuth callback to an absolute URL on the configured app origin. */
export function safeSameOriginRedirectUrl(value: string, baseUrl: string): string {
  const base = new URL(baseUrl);
  const fallback = new URL("/", base).toString();
  if (INVALID_REDIRECT_CHARACTERS.test(value)) return fallback;

  try {
    const target = new URL(value, base);
    if (target.origin !== base.origin) return fallback;

    const safePath = safeCallbackPath(
      `${target.pathname}${target.search}${target.hash}`,
      "/",
    );
    return new URL(safePath, base).toString();
  } catch {
    return fallback;
  }
}
