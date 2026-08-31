export class AdminConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminConfigurationError";
  }
}

/**
 * Parse the immutable, numeric GitHub account IDs allowed to view /admin.
 * Invalid configuration fails closed instead of silently weakening access.
 */
export function parseAdminGithubAccountIds(rawValue: string | undefined): string[] {
  if (!rawValue?.trim()) return [];

  const ids = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (ids.some((id) => !/^\d+$/.test(id))) {
    throw new AdminConfigurationError(
      "ADMIN_GITHUB_ACCOUNT_IDS must contain only comma-separated numeric GitHub account IDs.",
    );
  }

  return [...new Set(ids)];
}
