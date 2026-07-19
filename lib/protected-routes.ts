const PROTECTED_RETURN_PATHS = new Set(["/dashboard", "/watchlist", "/settings", "/voice-actors"]);

/** Validates a `returnTo` query value against the protected-route allowlist before it can be handed to Auth.js. */
export function sanitizeReturnTo(value: string | undefined | null): string | null {
  if (!value) return null;
  return PROTECTED_RETURN_PATHS.has(value) ? value : null;
}
