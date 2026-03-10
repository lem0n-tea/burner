let activeHost = null;
let activeStart = null;
let timeByHost = {};

let unsentSessions = [];

const STORAGE_KEY = "time_tracking_state";
const BACKEND_STATS_KEY = "backend_time_stats";

const FLUSH_INTERVAL_MS = 1 * 30 * 1000; // 0.5 minutes
const MAX_SESSION_MS = 15 * 60 * 1000; // 15 minutes
let flushInterval = null;
let isFlushing = false;

const API_BASE = "http://127.0.0.1:8000";

const FILTERS_KEY = "tracking_filters";
let trackingMode = "WHITELIST"; // "ALL" | "WHITELIST"
let whitelist = new Set();


let popupPort = null;
let tickInterval = null;

/* -----------------------------
   Utilities
----------------------------- */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatLocalDateYYYYMMDD(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  // en-CA yields YYYY-MM-DD for just y/m/d
  return dtf.format(date);
}

function getLocalYMDParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day)
  };
}

function getTimeZoneOffsetMs(timeZone, date) {
  // Offset = (time interpreted in tz as UTC) - (actual UTC time)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );

  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );

  return asUTC - date.getTime();
}

function zonedTimeToUtcMs({ year, month, day, hour, minute, second }, timeZone) {
  // Convert a wall-clock time in `timeZone` into a UTC instant (ms).
  // Uses a 2-pass offset refinement to handle DST changes.
  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = getTimeZoneOffsetMs(timeZone, new Date(utcGuess));
  let utc = utcGuess - offset;
  let offset2 = getTimeZoneOffsetMs(timeZone, new Date(utc));
  if (offset2 !== offset) {
    utc = utcGuess - offset2;
  }
  return utc;
}

function splitIntoDailyBucketsUtcToLocalDate(startUtcMs, endUtcMs, timeZone) {
  // Mirrors backend/app/time_splitting.py: split UTC session into local calendar days.
  if (!Number.isFinite(startUtcMs) || !Number.isFinite(endUtcMs)) return [];
  if (endUtcMs <= startUtcMs) return [];

  const buckets = [];
  let currentUtcMs = startUtcMs;

  while (currentUtcMs < endUtcMs) {
    const currentDate = new Date(currentUtcMs);
    const { year, month, day } = getLocalYMDParts(currentDate, timeZone);
    const localDateStr = `${year}-${pad2(month)}-${pad2(day)}`;

    const nextDayUtcMs = Date.UTC(year, month - 1, day) + 24 * 60 * 60 * 1000;
    const nextDay = new Date(nextDayUtcMs);
    const nextLocal = {
      year: nextDay.getUTCFullYear(),
      month: nextDay.getUTCMonth() + 1,
      day: nextDay.getUTCDate()
    };

    const nextMidnightUtcMs = zonedTimeToUtcMs(
      { ...nextLocal, hour: 0, minute: 0, second: 0 },
      timeZone
    );

    const segmentEndUtcMs = Math.min(nextMidnightUtcMs, endUtcMs);
    const durationSeconds = Math.floor((segmentEndUtcMs - currentUtcMs) / 1000);

    if (durationSeconds > 0) {
      buckets.push([localDateStr, durationSeconds]);
    }

    currentUtcMs = segmentEndUtcMs;
  }

  return buckets;
}

function mergeStatisticsWithLocalOverlay(stats, sessions, timeZone) {
  if (!stats || !sessions || sessions.length === 0) return stats;

  const merged = structuredClone(stats);

  const rangeStart = merged.range_start; // YYYY-MM-DD
  const rangeEnd = merged.range_end; // YYYY-MM-DD

  const graphByDate = new Map(
    (merged.graph?.records || []).map((r) => [r.date, r])
  );
  const heatmapByDate = new Map(
    (merged.heatmap?.records || []).map((r) => [r.date, r])
  );

  const overlayGraphTotal = { seconds: 0 };
  const overlayHeatmapTotal = { seconds: 0 };
  const overlayTopHosts = new Map(); // host -> seconds in graph range

  for (const s of sessions) {
    const startMs = Date.parse(s.start);
    const endMs = Date.parse(s.end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      continue;
    }

    const buckets = splitIntoDailyBucketsUtcToLocalDate(startMs, endMs, timeZone);
    for (const [dateStr, seconds] of buckets) {
      if (seconds <= 0) continue;

      const graphRec = graphByDate.get(dateStr);
      if (graphRec && dateStr >= rangeStart && dateStr <= rangeEnd) {
        graphRec.seconds += seconds;
        overlayGraphTotal.seconds += seconds;
        overlayTopHosts.set(s.host, (overlayTopHosts.get(s.host) || 0) + seconds);
      }

      const heatRec = heatmapByDate.get(dateStr);
      if (heatRec) {
        heatRec.seconds += seconds;
        overlayHeatmapTotal.seconds += seconds;
      }
    }
  }

  // Totals
  merged.period_total = (merged.period_total || 0) + overlayGraphTotal.seconds;
  const todayRec = graphByDate.get(rangeEnd);
  if (todayRec) {
    merged.today_total = todayRec.seconds;
  } else {
    merged.today_total = (merged.today_total || 0) + 0;
  }

  // Top hosts (merge + re-sort + cap to 5)
  const existing = (merged.top_hosts?.hosts || []).map((h) => ({
    id: h.id ?? null,
    hostname: h.hostname,
    seconds: h.seconds
  }));

  const byHost = new Map(existing.map((h) => [h.hostname, { ...h }]));
  for (const [host, seconds] of overlayTopHosts.entries()) {
    const prev = byHost.get(host);
    if (prev) {
      prev.seconds += seconds;
    } else {
      byHost.set(host, { id: null, hostname: host, seconds });
    }
  }

  const mergedHosts = Array.from(byHost.values())
    .filter((h) => h.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5);

  if (merged.top_hosts) {
    merged.top_hosts.hosts = mergedHosts;
    merged.top_hosts.total = mergedHosts.length;
  }

  return merged;
}

function normalizeHostname(hostname) {
  if (!hostname) return null;
  const cleaned = String(hostname)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "") // strip trailing dot(s)
    .replace(/^www\./, "");
  return cleaned || null;
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
      const response = await fetch(`${API_BASE}/time/flush`, {
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
   Stats retrieval
----------------------------- */

async function fetchStatistics(period = "week") {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const url = new URL(`${API_BASE}/time/stats`);
    url.searchParams.append("period", period);
    url.searchParams.append("timezone", timezone);

    try {
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                // Uncomment if using auth
                // "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        const merged = mergeStatisticsWithLocalOverlay(data, unsentSessions, timezone);

        await browser.storage.local.set({
            [BACKEND_STATS_KEY]: {
                period,
                fetchedAt: new Date().toISOString(),
                data: merged
            }
        });

        return merged;

    } catch (error) {
        console.error("Failed to fetch statistics:", error);
        throw error;
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

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.type === "GET_STATISTICS") {
        fetchStatistics(message.period)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));

        // Required for async response in Firefox
        return true;
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

