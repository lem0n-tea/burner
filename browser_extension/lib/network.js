/**
 * Burner Network Module
 *
 * Provides centralized fetch wrapper with error handling,
 * exponential backoff, and proper payload construction.
 */

import { browserAPI } from "./browser-api.js";

// Configuration
const DEFAULT_BACKEND_URL = "http://localhost:8000";
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Get backend API URL from storage or use default
 * @returns {Promise<string>} Backend API base URL
 */
async function getBackendUrl() {
  try {
    const result = await browserAPI.storage.local.get({ [META_KEY]: {} });
    const meta = result[META_KEY] || {};
    return meta.backendUrl || DEFAULT_BACKEND_URL;
  } catch (e) {
    console.error("Network: Failed to get backend URL:", e);
    return DEFAULT_BACKEND_URL;
  }
}

/**
 * Set backend API URL in storage
 * @param {string} url - Backend API base URL
 * @returns {Promise<void>}
 */
export async function setBackendUrl(url) {
  try {
    const meta = await getMeta();
    await setMeta({ ...meta, backendUrl: url });
    console.log(`Network: Backend URL set to ${url}`);
  } catch (e) {
    console.error("Network: Failed to set backend URL:", e);
    throw e;
  }
}

/**
 * Build sync payload per API contract
 * @param {Array<Object>} sessions - Array of session objects
 * @param {string} timezone - User's IANA timezone
 * @returns {Object} Payload with total, timezone, sessions
 */
export function buildSyncPayload(sessions, timezone) {
  return {
    total: sessions.length, // count of sessions, NOT sum of seconds
    timezone: timezone,
    sessions: sessions.map((s) => ({
      id: s.id,
      host: s.host,
      start: s.start, // UTC ISO string
      end: s.end, // UTC ISO string
    })),
  };
}

/**
 * Fetch wrapper with timeout and error handling
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * POST sessions to backend /time/flush endpoint
 * @param {Array<Object>} sessions - Array of session objects to sync
 * @param {string} timezone - User's IANA timezone
 * @returns {Promise<Object>} Result with success, accepted, rejectedSessionIds
 */
export async function postSessions(sessions, timezone) {
  const baseUrl = await getBackendUrl();
  const url = `${baseUrl}/time/flush`;

  const payload = buildSyncPayload(sessions, timezone);

  console.log(`Network: POST ${url} with ${payload.total} sessions`);

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      // Server error (5xx) or client error (4xx)
      throw new NetworkError(
        `POST /time/flush failed: ${response.status}`,
        response.status,
        data
      );
    }

    console.log(`Network: Sync successful - ${data.accepted}/${data.received} accepted`);

    return {
      success: true,
      accepted: data.accepted,
      rejectedSessionIds: data.rejected_session_ids || [],
    };
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("Network: Request timeout");
      throw new NetworkError("Request timeout", 0, null);
    }

    if (error instanceof NetworkError) {
      throw error;
    }

    // Network-level error (offline, DNS, etc.)
    console.error("Network: Request failed:", error.message);
    throw new NetworkError(`Network error: ${error.message}`, 0, null);
  }
}

/**
 * GET statistics from backend /time/stats endpoint
 * @param {string} period - Period type ("week" or "month")
 * @param {string} timezone - User's IANA timezone
 * @returns {Promise<Object>} Statistics data
 */
export async function getStats(period, timezone) {
  const baseUrl = await getBackendUrl();
  const url = new URL(`${baseUrl}/time/stats`);
  url.searchParams.set("period", period);
  url.searchParams.set("timezone", timezone);

  console.log(`Network: GET ${url.toString()}`);

  try {
    const response = await fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new NetworkError(
        `GET /time/stats failed: ${response.status}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("Network: Request timeout");
      throw new NetworkError("Request timeout", 0, null);
    }

    if (error instanceof NetworkError) {
      throw error;
    }

    console.error("Network: Request failed:", error.message);
    throw new NetworkError(`Network error: ${error.message}`, 0, null);
  }
}

/**
 * Custom error class for network errors with status code
 */
export class NetworkError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "NetworkError";
    this.status = status;
    this.data = data;
  }

  /**
   * Check if error is a client error (4xx)
   * @returns {boolean}
   */
  isClientError() {
    return this.status >= 400 && this.status < 500;
  }

  /**
   * Check if error is a server error (5xx)
   * @returns {boolean}
   */
  isServerError() {
    return this.status >= 500 && this.status < 600;
  }

  /**
   * Check if error is a network-level error (no status)
   * @returns {boolean}
   */
  isNetworkError() {
    return this.status === 0;
  }
}

// Storage helpers (inline to avoid circular dependency)
const META_KEY = "meta";

async function getMeta() {
  try {
    const result = await browserAPI.storage.local.get({ [META_KEY]: {} });
    return result[META_KEY] || {};
  } catch (e) {
    console.error("Network: Failed to get meta:", e);
    return {};
  }
}

async function setMeta(partial) {
  const current = await getMeta();
  const updated = { ...current, ...partial };
  await browserAPI.storage.local.set({ [META_KEY]: updated });
}
