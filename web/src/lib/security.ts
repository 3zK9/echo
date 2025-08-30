export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser or same-origin navigation
  try {
    const reqOrigin = new URL(req.url).origin;
    const headerOrigin = new URL(origin).origin;
    return reqOrigin === headerOrigin;
  } catch {
    return false;
  }
}

export function isSafeFetchSite(req: Request): boolean {
  const sfs = req.headers.get("sec-fetch-site");
  return !sfs || sfs === "same-origin" || sfs === "none";
}

export function isAllowedMutationRequest(req: Request): boolean {
  return isSameOrigin(req) && isSafeFetchSite(req);
}

