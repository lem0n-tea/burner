/**
 * Burner Background Script
 * 
 * Orchestrates tracking, session lifecycle, storage, and sync.
 */

import { browserAPI } from "../lib/browser-api.js";
import { normalizeHost, generateUUID } from "../lib/utils.js";
import { saveSession, getMeta, setMeta, getAllSessions } from "../lib/storage.js";

// Configuration
const INACTIVITY_TIMEOUT_MS = 60000; // 60 seconds

// In-memory state
const activeSessions = new Map(); // tabId -> session object
const inactivityTimers = new Map(); // tabId -> timeout ID

// Log extension installation
browserAPI.runtime.onInstalled.addListener((details) => {
  console.log("Burner extension installed", {
    reason: details.reason,
    previousVersion: details.previousVersion
  });

  // Handle extension restart - close any orphaned sessions
  closeOrphanedSessions();
  
  // Initialize metadata with timezone
  initializeMeta();
});

// Log extension startup
console.log("Burner background service worker started");

// Initialize metadata on startup (for non-install loads)
initializeMeta();

/**
 * Initialize metadata with user timezone
 */
async function initializeMeta() {
  try {
    const meta = await getMeta();
    if (!meta.timezone) {
      // Get browser's timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await setMeta({ timezone });
      console.log(`Storage: Initialized timezone to ${timezone}`);
    }
  } catch (e) {
    console.error("Failed to initialize metadata:", e);
  }
}

/**
 * Start a new session for a tab
 */
function startSession(tabId, hostname) {
  const normalizedHost = normalizeHost(hostname);
  
  if (!normalizedHost) {
    console.log("Cannot start session: invalid hostname");
    return;
  }
  
  // Don't start if session already exists for this tab
  if (activeSessions.has(tabId)) {
    console.log(`Session already active for tab ${tabId}`);
    return;
  }
  
  const session = {
    id: generateUUID(),
    host: normalizedHost,
    start: new Date().toISOString(),
    end: null,
    tabId: tabId
  };
  
  activeSessions.set(tabId, session);
  console.log(`Session started: ${session.id} for ${normalizedHost} on tab ${tabId}`);
  
  // Start inactivity timer
  startInactivityTimer(tabId);
}

/**
 * Close a session for a tab
 */
async function closeSession(tabId, reason = "unknown") {
  const session = activeSessions.get(tabId);
  
  if (!session) {
    return;
  }
  
  // Set end time
  session.end = new Date().toISOString();

  console.log(`Session closed: ${session.id} for ${session.host} on tab ${tabId} (reason: ${reason})`);

  // Persist to storage
  await saveSession(session);

  // Remove from active sessions
  activeSessions.delete(tabId);

  // Clear inactivity timer
  clearInactivityTimer(tabId);
}

/**
 * Close orphaned sessions on extension startup
 */
async function closeOrphanedSessions() {
  try {
    const sessions = await getAllSessions();
    
    // Find any sessions without end time (shouldn't happen, but safety check)
    const orphans = [];
    for (const [id, session] of Object.entries(sessions)) {
      if (!session.end) {
        session.end = new Date().toISOString();
        orphans.push(session);
      }
    }
    
    if (orphans.length > 0) {
      // Save the corrected sessions
      for (const session of orphans) {
        await saveSession(session);
      }
      console.log(`Closed ${orphans.length} orphaned sessions`);
    }
  } catch (e) {
    console.error("Failed to close orphaned sessions:", e);
  }
}

/**
 * Start inactivity timer for a tab
 */
function startInactivityTimer(tabId) {
  clearInactivityTimer(tabId);
  
  const timerId = setTimeout(async () => {
    console.log(`Inactivity timeout for tab ${tabId}`);
    await closeSession(tabId, "inactivity");
  }, INACTIVITY_TIMEOUT_MS);
  
  inactivityTimers.set(tabId, timerId);
}

/**
 * Clear inactivity timer for a tab
 */
function clearInactivityTimer(tabId) {
  const timerId = inactivityTimers.get(tabId);
  if (timerId) {
    clearTimeout(timerId);
    inactivityTimers.delete(tabId);
  }
}

/**
 * Reset inactivity timer (called on activity ping)
 */
function resetInactivityTimer(tabId) {
  if (activeSessions.has(tabId)) {
    startInactivityTimer(tabId);
  }
}

/**
 * Handle activity ping from content script
 */
async function handleActivityPing(message, sender) {
  const tabId = sender.tab?.id;
  const hostname = message.hostname;
  
  if (!tabId) {
    console.log("Activity ping: no tab ID");
    return;
  }
  
  // Check if window is focused (get window info)
  try {
    const window = await browserAPI.windows.get(sender.tab.windowId);
    if (!window.focused) {
      // Window not focused, don't track
      return;
    }
  } catch (e) {
    console.log("Could not get window info:", e);
    return;
  }
  
  // Check if tab is active
  if (!sender.tab.active) {
    console.log("Activity ping from inactive tab, ignoring");
    return;
  }
  
  // Start or continue session
  if (!activeSessions.has(tabId)) {
    startSession(tabId, hostname);
  } else {
    // Reset inactivity timer for existing session
    resetInactivityTimer(tabId);
  }
}

/**
 * Handle visibility change from content script
 */
async function handleVisibilityChange(message, sender) {
  const tabId = sender.tab?.id;
  
  if (!tabId) return;
  
  if (!message.visible) {
    // Tab became hidden, close session
    await closeSession(tabId, "tab_hidden");
  }
}

/**
 * Handle tab activation
 */
async function handleTabActivated(activeInfo) {
  const { tabId, windowId } = activeInfo;
  
  // Close session on previous tab (if any) - it's no longer active
  // The new active tab will start its own session when it sends activity ping
  
  // Check if window is focused
  try {
    const window = await browserAPI.windows.get(windowId);
    if (!window.focused) {
      // Window not focused, don't start tracking yet
      return;
    }
  } catch (e) {
    console.log("Could not get window info:", e);
  }
  
  console.log(`Tab activated: ${tabId} in window ${windowId}`);
}

/**
 * Handle tab closed
 */
async function handleTabRemoved(tabId, removeInfo) {
  console.log(`Tab removed: ${tabId}`);
  await closeSession(tabId, "tab_closed");
}

/**
 * Handle tab URL change
 */
async function handleTabUpdated(tabId, changeInfo, tabInfo) {
  // If URL changed and we have an active session, check if host changed
  if (changeInfo.url && activeSessions.has(tabId)) {
    const session = activeSessions.get(tabId);
    const newHost = normalizeHost(new URL(changeInfo.url).hostname);
    
    if (newHost !== session.host) {
      // Host changed, close old session
      console.log(`Host changed from ${session.host} to ${newHost}`);
      await closeSession(tabId, "host_changed");
      // New session will start when activity ping comes from new host
    }
  }
}

/**
 * Handle window focus change
 */
async function handleWindowFocusChanged(windowId) {
  if (windowId === browserAPI.windows.WINDOW_ID_NONE) {
    // All windows lost focus - close all active sessions
    console.log("Window lost focus, closing all sessions");
    const tabIds = Array.from(activeSessions.keys());
    for (const tabId of tabIds) {
      await closeSession(tabId, "window_blur");
    }
  }
}

// Register message listener
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);
  
  switch (message.type) {
    case "ACTIVITY_PING":
      handleActivityPing(message, sender);
      break;
      
    case "VISIBILITY_CHANGE":
      handleVisibilityChange(message, sender);
      break;
      
    default:
      console.log("Unknown message type:", message.type);
  }
  
  sendResponse({ received: true });
  return false;
});

// Register event listeners
browserAPI.tabs.onActivated.addListener(handleTabActivated);
browserAPI.tabs.onRemoved.addListener(handleTabRemoved);
browserAPI.tabs.onUpdated.addListener(handleTabUpdated);
browserAPI.windows.onFocusChanged.addListener(handleWindowFocusChanged);
