/**
 * Burner Sync Module
 *
 * Handles periodic sync of unsent sessions to backend with
 * exponential backoff, error handling, and retry logic.
 */

import { browserAPI } from "../lib/browser-api.js";
import { getUnsentSessions, markSessionsSynced, deleteSessions, getMeta, setMeta } from "../lib/storage.js";
import { postSessions, NetworkError } from "../lib/network.js";

// Configuration
const SYNC_INTERVAL_MINUTES = 2;
const MAX_BACKOFF_MINUTES = 60; // Cap backoff at 60 minutes
const SYNC_ALARM_NAME = "burner-sync-alarm";

/**
 * Initialize sync scheduler
 * Sets up periodic alarm and triggers initial sync
 */
export async function initSync() {
  console.log("Sync: Initializing sync scheduler");

  // Create alarm for periodic sync
  await browserAPI.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES,
  });

  console.log(`Sync: Alarm created - runs every ${SYNC_INTERVAL_MINUTES} minutes`);

  // Trigger sync on startup
  await runSync();
}

/**
 * Handle alarm events
 * @param {Object} alarm - Alarm object from alarms API
 */
export async function handleAlarm(alarm) {
  if (alarm.name === SYNC_ALARM_NAME) {
    console.log("Sync: Alarm triggered");
    await runSync();
  }
}

/**
 * Main sync function
 * Fetches unsent sessions, POSTs to backend, handles results
 */
export async function runSync() {
  try {
    console.log("Sync: Starting sync run");

    // Get unsent sessions from storage
    const unsentSessions = await getUnsentSessions();

    if (unsentSessions.length === 0) {
      console.log("Sync: No unsent sessions");
      await clearBackoff();
      return;
    }

    console.log(`Sync: Found ${unsentSessions.length} unsent sessions`);

    // Get timezone from metadata
    const meta = await getMeta();
    const timezone = meta.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // POST sessions to backend
    const result = await postSessions(unsentSessions, timezone);

    if (result.success) {
      console.log(`Sync: Successfully synced ${result.accepted} sessions`);

      // Mark synced sessions
      const syncedIds = unsentSessions
        .filter((s) => !result.rejectedSessionIds.includes(s.id))
        .map((s) => s.id);

      if (syncedIds.length > 0) {
        await markSessionsSynced(syncedIds);
      }

      // Delete rejected sessions (invalid data)
      if (result.rejectedSessionIds.length > 0) {
        console.log(`Sync: Deleting ${result.rejectedSessionIds.length} rejected sessions`);
        await deleteSessions(result.rejectedSessionIds);
      }

      // Clear backoff on success
      await clearBackoff();

      // Prune old synced sessions
      await pruneOldSyncedSessions();
    }
  } catch (error) {
    console.error("Sync: Sync failed:", error.message);

    if (error instanceof NetworkError) {
      await handleSyncError(error);
    } else {
      console.error("Sync: Unexpected error:", error);
    }
  }
}

/**
 * Handle sync errors with exponential backoff
 * @param {NetworkError} error - Network error that occurred
 */
async function handleSyncError(error) {
  const meta = await getMeta();
  const currentBackoff = meta.syncBackoffMinutes || 1;

  if (error.isClientError()) {
    // 4xx error - inspect and potentially drop invalid sessions
    console.log(`Sync: Client error ${error.status} - will inspect payload`);

    // 422 Unprocessable Entity means payload validation failed
    // This indicates corrupted/invalid session data - drop all unsent sessions
    if (error.status === 422) {
      console.error("Sync: Validation error (422) - dropping all unsent sessions");
      await dropAllUnsentSessions();
      return;
    }

    // For 400 Bad Request, the backend already returned rejected_session_ids
    // which were handled in runSync. If we got here, it's a different 4xx.
    // Don't increase backoff for client errors - they won't self-heal.
    if (error.status === 400) {
      // Bad request - may need to clear corrupted data
      console.error("Sync: Bad request - check session data integrity");
    }
  } else if (error.isServerError() || error.isNetworkError()) {
    // 5xx or network error - apply exponential backoff
    const nextBackoff = Math.min(currentBackoff * 2, MAX_BACKOFF_MINUTES);
    await setBackoff(nextBackoff);

    console.log(`Sync: Backoff increased to ${nextBackoff} minutes`);

    // Reschedule alarm with temporary backoff
    await browserAPI.alarms.create(SYNC_ALARM_NAME, {
      delayInMinutes: nextBackoff,
    });
  }
}

/**
 * Set sync backoff in metadata
 * @param {number} minutes - Backoff duration in minutes
 */
async function setBackoff(minutes) {
  await setMeta({ syncBackoffMinutes: minutes, lastSyncError: new Date().toISOString() });
}

/**
 * Clear sync backoff (called on success)
 */
async function clearBackoff() {
  await setMeta({ syncBackoffMinutes: null, lastSyncError: null });

  // Restore normal sync interval
  await browserAPI.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES,
  });
}

/**
 * Get current backoff state
 * @returns {Promise<number|null>} Current backoff in minutes or null
 */
export async function getBackoff() {
  const meta = await getMeta();
  return meta.syncBackoffMinutes || null;
}

/**
 * Prune old synced sessions to free storage
 * Removes synced sessions older than 30 days
 */
async function pruneOldSyncedSessions() {
  try {
    const RETENTION_DAYS = 30;
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const unsentSessions = await getUnsentSessions();
    const unsentIds = new Set(unsentSessions.map((s) => s.id));

    // Get all sessions to find old synced ones
    const result = await browserAPI.storage.local.get({ sessions: {} });
    const sessions = result.sessions || {};

    const toDelete = [];
    for (const [id, session] of Object.entries(sessions)) {
      // Skip unsent sessions
      if (!unsentIds.has(id) && session.synced) {
        const sessionEnd = new Date(session.end);
        if (sessionEnd < cutoffDate) {
          toDelete.push(id);
        }
      }
    }

    if (toDelete.length > 0) {
      await deleteSessions(toDelete);
      console.log(`Sync: Pruned ${toDelete.length} old synced sessions`);
    }
  } catch (e) {
    console.error("Sync: Failed to prune old sessions:", e);
  }
}

/**
 * Drop all unsent sessions (used when payload validation fails)
 * Called when backend returns 422 - indicates corrupted/invalid data
 */
async function dropAllUnsentSessions() {
  try {
    const unsentSessions = await getUnsentSessions();
    const idsToDelete = unsentSessions.map((s) => s.id);

    if (idsToDelete.length > 0) {
      await deleteSessions(idsToDelete);
      console.log(`Sync: Dropped ${idsToDelete.length} unsent sessions due to validation error`);
    }
  } catch (e) {
    console.error("Sync: Failed to drop unsent sessions:", e);
  }
}

/**
 * Force trigger a sync run (for debugging/manual sync)
 */
export async function forceSync() {
  console.log("Sync: Manual sync triggered");
  await runSync();
}

/**
 * Get sync statistics
 * @returns {Promise<Object>} Sync stats
 */
export async function getSyncStats() {
  const unsentSessions = await getUnsentSessions();
  const meta = await getMeta();

  return {
    unsentCount: unsentSessions.length,
    backoffMinutes: meta.syncBackoffMinutes,
    lastSyncError: meta.lastSyncError,
    lastSyncAt: meta.lastSyncAt,
  };
}
