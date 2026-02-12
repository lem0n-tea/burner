let activeHost = null;
let activeStart = null;
let timeByHost = {};

const STORAGE_KEY = "time_tracking_state";

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
      timeByHost
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
  return true;
}

/* -----------------------------
   Time Finalization
----------------------------- */

function finalizeActiveHost() {
  if (!activeHost || !activeStart) return;

  const elapsed = Date.now() - activeStart;
  timeByHost[activeHost] =
    (timeByHost[activeHost] || 0) + elapsed;

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
   Filters (tracking mode)
----------------------------- */

async function loadFilters() {
  const result = await browser.storage.local.get(FILTERS_KEY);
  const filters = result[FILTERS_KEY];

  if (filters?.mode) {
    trackingMode = filters.mode;
  }
}

/* -----------------------------
   Initialization
----------------------------- */

async function initFromActiveTab() {
  await loadFilters();

  const restored = await loadState();
  if (restored && activeHost && activeStart) return;

  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab || !tab.url) return;

  await switchToHost(getHostFromUrl(tab.url));
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
    console.log("Background - Tracking mode updated:", trackingMode);

    // Re-evaluate current host under new rules
    await switchToHost(activeHost);
  }
});
