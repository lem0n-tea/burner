/**
 * Burner Utility Functions
 */

/**
 * Normalize hostname: lowercase, strip www. prefix
 */
export function normalizeHost(hostname) {
  if (!hostname) return "";
  return hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Generate UUID for session ID
 */
export function generateUUID() {
  return crypto.randomUUID();
}
