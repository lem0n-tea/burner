/**
 * Burner Storage Module
 * 
 * Provides organized API for session CRUD, metadata management,
 * unsent queue derivation, and pruning of old synced sessions.
 */

import { browserAPI } from "./browser-api.js";

// Configuration
const RETENTION_DAYS = 30;

// Storage keys
const SESSIONS_KEY = "sessions";
const META_KEY = "meta";

/**
 * Save a session to storage
 * @param {Object} session - Session object with id, host, start, end
 * @returns {Promise<void>}
 */
export async function saveSession(session) {
  try {
    const result = await browserAPI.storage.local.get({ [SESSIONS_KEY]: {} });
    const sessions = result[SESSIONS_KEY] || {};
    sessions[session.id] = {
      id: session.id,
      host: session.host,
      start: session.start,
      end: session.end,
      synced: false
    };
    await browserAPI.storage.local.set({ [SESSIONS_KEY]: sessions });
    console.log(`Storage: Session ${session.id} saved`);
  } catch (e) {
    console.error("Storage: Failed to save session:", e);
    throw e;
  }
}

/**
 * Get a session by ID
 * @param {string} id - Session UUID
 * @returns {Promise<Object|null>} Session object or null if not found
 */
export async function getSession(id) {
  try {
    const result = await browserAPI.storage.local.get({ [SESSIONS_KEY]: {} });
    const sessions = result[SESSIONS_KEY] || {};
    return sessions[id] || null;
  } catch (e) {
    console.error("Storage: Failed to get session:", e);
    return null;
  }
}

/**
 * Get all sessions
 * @returns {Promise<Object>} Object mapping session IDs to session objects
 */
export async function getAllSessions() {
  try {
    const result = await browserAPI.storage.local.get({ [SESSIONS_KEY]: {} });
    return result[SESSIONS_KEY] || {};
  } catch (e) {
    console.error("Storage: Failed to get all sessions:", e);
    return {};
  }
}

/**
 * Get unsent (not synced) sessions
 * @returns {Promise<Array>} Array of unsent session objects
 */
export async function getUnsentSessions() {
  try {
    const sessions = await getAllSessions();
    return Object.values(sessions).filter(s => !s.synced);
  } catch (e) {
    console.error("Storage: Failed to get unsent sessions:", e);
    return [];
  }
}

/**
 * Mark sessions as synced
 * @param {Array<string>} ids - Array of session UUIDs to mark as synced
 * @returns {Promise<void>}
 */
export async function markSessionsSynced(ids) {
  try {
    const result = await browserAPI.storage.local.get({ [SESSIONS_KEY]: {} });
    const sessions = result[SESSIONS_KEY] || {};
    
    let updated = false;
    for (const id of ids) {
      if (sessions[id]) {
        sessions[id].synced = true;
        updated = true;
      }
    }
    
    if (updated) {
      await browserAPI.storage.local.set({ [SESSIONS_KEY]: sessions });
      console.log(`Storage: Marked ${ids.length} sessions as synced`);
    }
  } catch (e) {
    console.error("Storage: Failed to mark sessions as synced:", e);
    throw e;
  }
}

/**
 * Delete sessions by IDs
 * @param {Array<string>} ids - Array of session UUIDs to delete
 * @returns {Promise<void>}
 */
export async function deleteSessions(ids) {
  try {
    const result = await browserAPI.storage.local.get({ [SESSIONS_KEY]: {} });
    const sessions = result[SESSIONS_KEY] || {};
    
    let deleted = 0;
    for (const id of ids) {
      if (sessions[id]) {
        delete sessions[id];
        deleted++;
      }
    }
    
    if (deleted > 0) {
      await browserAPI.storage.local.set({ [SESSIONS_KEY]: sessions });
      console.log(`Storage: Deleted ${deleted} sessions`);
    }
  } catch (e) {
    console.error("Storage: Failed to delete sessions:", e);
    throw e;
  }
}

/**
 * Get metadata
 * @returns {Promise<Object>} Metadata object
 */
export async function getMeta() {
  try {
    const result = await browserAPI.storage.local.get({ [META_KEY]: {} });
    return result[META_KEY] || {};
  } catch (e) {
    console.error("Storage: Failed to get meta:", e);
    return {};
  }
}

/**
 * Update metadata (partial update)
 * @param {Object} partial - Partial metadata object to merge
 * @returns {Promise<void>}
 */
export async function setMeta(partial) {
  try {
    const current = await getMeta();
    const updated = { ...current, ...partial };
    await browserAPI.storage.local.set({ [META_KEY]: updated });
    console.log("Storage: Meta updated");
  } catch (e) {
    console.error("Storage: Failed to set meta:", e);
    throw e;
  }
}

/**
 * Prune old synced sessions
 * Removes synced sessions older than RETENTION_DAYS
 * @returns {Promise<number>} Number of sessions pruned
 */
export async function pruneOldSessions() {
  try {
    const sessions = await getAllSessions();
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (RETENTION_DAYS * 24 * 60 * 60 * 1000));
    
    const toDelete = [];
    for (const [id, session] of Object.entries(sessions)) {
      // Only prune synced sessions
      if (!session.synced) continue;
      
      // Check if session end date is older than cutoff
      const sessionEnd = new Date(session.end);
      if (sessionEnd < cutoffDate) {
        toDelete.push(id);
      }
    }
    
    if (toDelete.length > 0) {
      await deleteSessions(toDelete);
      console.log(`Storage: Pruned ${toDelete.length} old sessions`);
    }
    
    return toDelete.length;
  } catch (e) {
    console.error("Storage: Failed to prune old sessions:", e);
    return 0;
  }
}

/**
 * Get storage statistics
 * @returns {Promise<Object>} Stats about stored data
 */
export async function getStorageStats() {
  try {
    const sessions = await getAllSessions();
    const sessionArray = Object.values(sessions);
    
    const syncedCount = sessionArray.filter(s => s.synced).length;
    const unsentCount = sessionArray.filter(s => !s.synced).length;
    
    return {
      totalSessions: sessionArray.length,
      syncedSessions: syncedCount,
      unsentSessions: unsentCount,
      oldestSession: sessionArray.length > 0 
        ? Math.min(...sessionArray.map(s => new Date(s.start).getTime()))
        : null,
      newestSession: sessionArray.length > 0
        ? Math.max(...sessionArray.map(s => new Date(s.start).getTime()))
        : null
    };
  } catch (e) {
    console.error("Storage: Failed to get stats:", e);
    return {
      totalSessions: 0,
      syncedSessions: 0,
      unsentSessions: 0,
      oldestSession: null,
      newestSession: null
    };
  }
}

/**
 * Clear all storage (for debugging/reset)
 * @returns {Promise<void>}
 */
export async function clearAllStorage() {
  try {
    await browserAPI.storage.local.clear();
    console.log("Storage: All data cleared");
  } catch (e) {
    console.error("Storage: Failed to clear storage:", e);
    throw e;
  }
}

/**
 * Cache stats response for a period and timezone
 * @param {string} period - "week" or "month"
 * @param {string} timezone - IANA timezone name
 * @param {Object} stats - Stats data to cache
 * @returns {Promise<void>}
 */
export async function setCachedStats(period, timezone, stats) {
  try {
    const meta = await getMeta();
    const cacheKey = `stats_${period}_${timezone}`;
    const statsCache = meta.statsCache || {};
    
    statsCache[cacheKey] = {
      data: stats,
      cachedAt: new Date().toISOString()
    };
    
    await setMeta({ ...meta, statsCache });
    console.log(`Storage: Cached stats for ${period}/${timezone}`);
  } catch (e) {
    console.error("Storage: Failed to cache stats:", e);
  }
}

/**
 * Get cached stats for a period and timezone
 * @param {string} period - "week" or "month"
 * @param {string} timezone - IANA timezone name
 * @returns {Promise<Object|null>} Cached stats or null
 */
export async function getCachedStats(period, timezone) {
  try {
    const meta = await getMeta();
    const cacheKey = `stats_${period}_${timezone}`;
    const statsCache = meta.statsCache || {};
    return statsCache[cacheKey]?.data || null;
  } catch (e) {
    console.error("Storage: Failed to get cached stats:", e);
    return null;
  }
}

/**
 * Get active session from storage (sessions without end time)
 * @returns {Promise<Object|null>} Active session or null
 */
export async function getActiveSession() {
  try {
    const sessions = await getAllSessions();
    // Find session without end time (active session)
    for (const session of Object.values(sessions)) {
      if (!session.end) {
        return session;
      }
    }
    return null;
  } catch (e) {
    console.error("Storage: Failed to get active session:", e);
    return null;
  }
}
