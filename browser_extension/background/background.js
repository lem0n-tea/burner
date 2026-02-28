let activeHost = null;
let activeStart = null;
let timeByHost = {};

let unsentSessions = [];

const STORAGE_KEY = "time_tracking_state";

const FLUSH_INTERVAL_MS = 1 * 30 * 1000; // 0.5 minutes
const MAX_SESSION_MS = 15 * 60 * 1000; // 15 minutes
let flushInterval = null;
let isFlushing = false;

const FILTERS_KEY = "tracking_filters";
let trackingMode = "WHITELIST"; // "ALL" | "WHITELIST"
let whitelist = new Set();


let popupPort = null;
let tickInterval = null;

/* -----------------------------
   Utilities
----------------------------- */

function normalizeHostname(hostname) {
  if (!hostname) return null;
  const parts = hostname.replace(/^www\./, "").split(".");
  return parts.length <= 2 ? hostname : parts.slice(-2).join(".");
}

function getHostFromUrl(url) {
  try {
    return normalizeHostname(new URL(url).hostname);
  } catch {
    return null;
  }
}

function isHostTracked(host) {
  if (!host) return false;
  if (trackingMode === "ALL") return true;
  if (trackingMode === "WHITELIST") {
    return whitelist.has(host);
  }
  return false;
}

/* -----------------------------
   Persistence
----------------------------- */

async function saveState() {
  await browser.storage.local.set({
    [STORAGE_KEY]: {
      activeHost,
      activeStart,
      timeByHost,
      unsentSessions
    }
  });
}

async function loadState() {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const state = result[STORAGE_KEY];
  if (!state) return false;

  activeHost = state.activeHost;
  activeStart = state.activeStart;
  timeByHost = state.timeByHost || {};
  unsentSessions = state.unsentSessions || [];
  return true;
}

/* -----------------------------
   Time Finalization
----------------------------- */

function finalizeActiveHost() {
  if (!activeHost || !activeStart) return;

  const start = activeStart;
  const end = Date.now();
  
  const rawElapsed = end - start;
  const elapsed = Math.min(rawElapsed, MAX_SESSION_MS);

  // Ignore micro sessions
  if (elapsed < 1000) {
    activeStart = null;
    return;
  }

  timeByHost[activeHost] =
    (timeByHost[activeHost] || 0) + elapsed;

  unsentSessions.push({
    id: crypto.randomUUID(),
    host: activeHost,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString()
  });

  activeStart = null;
}

/* -----------------------------
   Focus Switching Logic
----------------------------- */

async function switchToHost(newHost) {
  const wasTracking = isHostTracked(activeHost);
  const willTrack = isHostTracked(newHost);

  // Same host and still tracking → nothing to do
  if (
    newHost === activeHost &&
    activeStart &&
    willTrack
  ) {
    return;
  }

  // Finalize previous only if it was tracked
  if (wasTracking) {
    finalizeActiveHost();
  } else {
    activeStart = null;
  }

  activeHost = newHost;

  // Start timer only if new host is tracked
  activeStart = willTrack ? Date.now() : null;

  await saveState();
  sendUpdate();
}

/* -----------------------------
   Session flushing
----------------------------- */

async function flushSessions() {
  if (isFlushing) {
    return;
  }
  isFlushing = true;

  // If currently tracking, temporarily finalize
  let hadActive = false;

  if (activeHost && activeStart && isHostTracked(activeHost)) {
    hadActive = true;
    finalizeActiveHost();
  }

  if (unsentSessions.length > 0) {
    const payload = {
      total: unsentSessions.length,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sessions: unsentSessions
    };

    try {
      const response = await fetch("http://127.0.0.1:8000/time/flush", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      // Clear only if successful
      if (response.ok) {
        unsentSessions = [];
        await saveState();
      }

      if (response.headers.get("content-type")?.includes("application/json")) {
        const result = await response.json();
        console.log(result);
      }

    } catch (err) {
      console.error("Flush failed:", err);
    } finally {
      isFlushing = false;
    }
  }

  // Resume tracking immediately
  if (hadActive) {
    activeStart = Date.now();
    await saveState();
  }

  isFlushing = false;
}

async function recoverInterruptedSession() {
  if (activeHost && activeStart) {
    const now = Date.now();

    const elapsed = now - activeStart;

    const safeElapsed = Math.min(elapsed, MAX_SESSION_MS);

    if (safeElapsed > 1000) {
      unsentSessions.push({
        id: crypto.randomUUID(),
        host: activeHost,
        start: new Date(activeStart).toISOString(),
        end: new Date(activeStart + safeElapsed).toISOString()
      });

      timeByHost[activeHost] =
        (timeByHost[activeHost] || 0) + safeElapsed;
    }

    activeStart = null;
    await saveState();
  }
}

/* -----------------------------
   Filters (tracking mode)
----------------------------- */

async function loadFilters() {
  const result = await browser.storage.local.get(FILTERS_KEY);
  const filters = result[FILTERS_KEY];

  if (filters) {
    if (filters.mode) trackingMode = filters.mode;
    if (filters.list) {
      whitelist = new Set(filters.list); 
    }
  }
}

/* -----------------------------
   Initialization
----------------------------- */

async function initFromActiveTab() {
  const restored = await loadState();
  if (restored && activeHost && activeStart) return;

  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab || !tab.url) return;

  await switchToHost(getHostFromUrl(tab.url));
}

function startFlushLoop() {
  if (flushInterval) return;

  flushInterval = setInterval(async () => {
    await flushSessions();
  }, FLUSH_INTERVAL_MS);
}

/* -----------------------------
   Popup Updates
----------------------------- */

function sendUpdate() {
  if (!popupPort || !activeHost) return;

  const baseTime = timeByHost[activeHost] || 0;

  const elapsedMs = activeStart
    ? baseTime + (Date.now() - activeStart)
    : baseTime;

  popupPort.postMessage({
    site: activeHost,
    elapsedMs,
    isTracked: isHostTracked(activeHost)
  });
}

function startTicking() {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    if (activeStart) {
      sendUpdate();
    }
  }, 1000);
}

function stopTicking() {
  clearInterval(tickInterval);
  tickInterval = null;
}

/* -----------------------------
   Popup Connection
----------------------------- */

browser.runtime.onConnect.addListener(async (port) => {
  if (port.name !== "popup") return;

  popupPort = port;
  await initFromActiveTab();
  sendUpdate();
  startTicking();

  port.onDisconnect.addListener(() => {
    popupPort = null;
    stopTicking();
  });
});

/* -----------------------------
   Browser Events
----------------------------- */

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await browser.tabs.get(tabId);
  await switchToHost(tab?.url ? getHostFromUrl(tab.url) : null);
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url || !tab.active) return;
  await switchToHost(getHostFromUrl(changeInfo.url));
});

browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    finalizeActiveHost();
    await saveState();
  } else {
    await initFromActiveTab();
  }
});

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;

  if (changes[FILTERS_KEY]?.newValue?.mode) {
    // Finalize current session using OLD mode
    if (activeStart) {
      finalizeActiveHost();
    }

    trackingMode = changes[FILTERS_KEY].newValue.mode;

    // Re-evaluate current host under new rules
    await switchToHost(activeHost);
  }
});

// Save active session on browser shutdown
browser.runtime.onSuspend.addListener(() => {
  finalizeActiveHost();
  saveState();
});


// Start
(async function bootstrap() {
  // 1. Load the rules
  await loadFilters();

  // 2. Load the previous state
  await loadState();

  // 3. Process any leftovers from the last time the browser was open
  await recoverInterruptedSession();
  
  // 4. Try to send anything pending immediately
  await flushSessions();

  // 5. Figure out what the user is looking at right now
  await initFromActiveTab();
  
  // 6. Start the background loops
  startFlushLoop();
})();

