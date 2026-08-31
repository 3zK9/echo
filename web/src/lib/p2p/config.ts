export const P2P_SESSION_TTL_MS = 10 * 60 * 1000;
export const P2P_PRESENCE_TTL_MS = 45 * 1000;
export const P2P_CONTROL_MAX_AGE_MS = 5 * 60 * 1000;
export const P2P_CONTROL_MAX_FUTURE_SKEW_MS = 30 * 1000;

export const MAX_SIGNAL_REQUEST_BYTES = 64 * 1024;
export const MAX_CONTROL_REQUEST_BYTES = 16 * 1024;

/**
 * The proof is fail-closed in every environment. Set the flag explicitly in
 * local development, previews, and production only after the matching schema
 * migration has been applied.
 */
export function isP2PMessagingEnabled(
  value: string | undefined = process.env.P2P_MESSAGES_ENABLED,
): boolean {
  return value === "true";
}
