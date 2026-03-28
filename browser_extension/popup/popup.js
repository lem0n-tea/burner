/**
 * Burner Popup Script
 *
 * Handles popup UI logic, data fetching, session merging, and live updates.
 */

import { browserAPI } from "../lib/browser-api.js";
import { getStats } from "../lib/network.js";
import { getUnsentSessions, getMeta, getCachedStats, setCachedStats } from "../lib/storage.js";
import { getTimezone, splitSessionByLocalDates, aggregateByDate, getTodayInTimeZone, getDateRangeForPeriod } from "../lib/timezone.js";

// Current state
let currentPeriod = "week";
let currentTimezone = getTimezone();
let mergedData = null;
let activeSession = null;
let liveUpdateInterval = null;
let isLoading = false;

/**
 * Initialize popup
 */
async function initPopup() {
  console.log("Burner popup initialized");

  // Set up event listeners
  setupTabListeners();
  setupOverlayListeners();

  // Load initial data
  await loadAndRenderData();

  // Start live update timer
  startLiveUpdates();
}

/**
 * Set up period tab listeners
 */
function setupTabListeners() {
  const tabButtons = document.querySelectorAll(".tab-btn");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      // Update active state
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Update current period
      currentPeriod = btn.dataset.period;

      console.log(`Period changed to: ${currentPeriod}`);

      // Re-fetch and render data for new period
      loadAndRenderData();
    });
  });
}

/**
 * Set up overlay listeners
 */
function setupOverlayListeners() {
  // Profile button
  const profileBtn = document.getElementById("profile-btn");
  const profileOverlay = document.getElementById("profile-overlay");

  profileBtn.addEventListener("click", () => {
    profileOverlay.classList.remove("hidden");
  });

  // Settings button
  const settingsBtn = document.getElementById("settings-btn");
  const settingsOverlay = document.getElementById("settings-overlay");

  settingsBtn.addEventListener("click", () => {
    settingsOverlay.classList.remove("hidden");
  });

  // Close overlay buttons
  const closeButtons = document.querySelectorAll(".close-overlay-btn");

  closeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const overlayId = btn.dataset.overlay;
      const overlay = document.getElementById(overlayId);
      overlay.classList.add("hidden");
    });
  });

  // Close overlay on backdrop click
  document.querySelectorAll(".overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.add("hidden");
      }
    });
  });
}

/**
 * Load and render data from server and local storage
 */
async function loadAndRenderData() {
  if (isLoading) return;

  isLoading = true;
  showLoadingState();

  try {
    // Get timezone
    currentTimezone = getTimezone();

    // Fetch stats from server
    const serverStats = await fetchServerStats(currentPeriod, currentTimezone);

    // Load unsent local sessions
    const unsentSessions = await getUnsentSessions();

    // Get active session from background
    activeSession = await getActiveSessionFromBackground();

    // Merge server data with local sessions
    mergedData = mergeSessionData(serverStats, unsentSessions, activeSession, currentTimezone);

    // Render all components
    renderTodayTotal(mergedData);
    renderPeriodTotal(mergedData);
    renderActiveHost();
    renderGraph(mergedData);
    renderTopHosts(mergedData);

    // Cache the server response
    await setCachedStats(currentPeriod, currentTimezone, serverStats);

    hideLoadingState();
  } catch (error) {
    console.error("Popup: Failed to load data:", error);
    showErrorState(error);
  } finally {
    isLoading = false;
  }
}

/**
 * Fetch stats from server with cache fallback
 */
async function fetchServerStats(period, timezone) {
  try {
    const stats = await getStats(period, timezone);
    console.log(`Popup: Fetched stats for period=${period}, timezone=${timezone}`);
    return stats;
  } catch (error) {
    console.warn("Popup: Server fetch failed, trying cache:", error);

    // Try to use cached data
    const cached = await getCachedStats(period, timezone);
    if (cached) {
      console.log("Popup: Using cached stats");
      return cached;
    }

    throw error;
  }
}

/**
 * Get active session from background script
 * @returns {Promise<Object|null>} Active session or null
 */
async function getActiveSessionFromBackground() {
  try {
    const response = await browserAPI.runtime.sendMessage({
      type: "GET_ACTIVE_SESSION"
    });
    return response?.session || null;
  } catch (e) {
    // Background may not be ready or message port closed
    console.log("Popup: Could not get active session from background");
    return null;
  }
}

/**
 * Merge server response with local unsent sessions and active session
 */
function mergeSessionData(serverStats, unsentSessions, activeSession, timezone) {
  // Deep clone server data to avoid mutations
  const merged = JSON.parse(JSON.stringify(serverStats));

  // Create maps for efficient lookup
  const dateTotals = new Map();
  const hostTotals = new Map();

  // Initialize with server data
  for (const record of merged.graph.records) {
    dateTotals.set(record.date, (dateTotals.get(record.date) || 0) + record.seconds);
  }

  for (const host of merged.top_hosts.hosts) {
    hostTotals.set(host.hostname, (hostTotals.get(host.hostname) || 0) + host.seconds);
  }

  // Process unsent sessions
  for (const session of unsentSessions) {
    if (!session.end || !session.start) continue;

    // Split session into local date buckets
    const buckets = splitSessionByLocalDates(session.start, session.end, timezone);

    for (const bucket of buckets) {
      // Add to date totals
      dateTotals.set(bucket.date, (dateTotals.get(bucket.date) || 0) + bucket.seconds);

      // Add to host totals
      hostTotals.set(session.host, (hostTotals.get(session.host) || 0) + bucket.seconds);
    }
  }

  // Rebuild graph records with merged data
  merged.graph.records = merged.graph.records.map(record => ({
    date: record.date,
    seconds: dateTotals.get(record.date) || 0
  }));

  // Rebuild top hosts with merged data
  const sortedHosts = Array.from(hostTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  merged.top_hosts = {
    total: sortedHosts.length,
    hosts: sortedHosts.map(([hostname, seconds], index) => ({
      id: index + 1,
      hostname,
      seconds
    }))
  };

  // Recalculate totals
  const today = getTodayInTimeZone(timezone);
  merged.today_total = dateTotals.get(today) || 0;
  merged.period_total = Array.from(dateTotals.values()).reduce((sum, s) => sum + s, 0);

  // Store merged date totals for live updates
  merged._dateTotals = dateTotals;
  merged._hostTotals = hostTotals;

  return merged;
}

/**
 * Render today total (HH:MM:SS)
 */
function renderTodayTotal(data) {
  const todayTotalEl = document.getElementById("today-total");
  
  // Include active session time if running
  let todayTotal = data.today_total;
  if (activeSession) {
    const now = new Date().toISOString();
    const today = getTodayInTimeZone(currentTimezone);
    const buckets = splitSessionByLocalDates(activeSession.start, now, currentTimezone);
    for (const bucket of buckets) {
      if (bucket.date === today) {
        todayTotal += bucket.seconds;
      }
    }
  }
  
  todayTotalEl.textContent = formatTimeHMS(todayTotal);
}

/**
 * Render period total (HH:MM)
 */
function renderPeriodTotal(data) {
  const periodTotalEl = document.getElementById("period-total");

  // Include active session time if running
  let periodTotal = data.period_total;
  if (activeSession) {
    const now = new Date().toISOString();
    const range = getDateRangeForPeriod(currentPeriod, currentTimezone);
    const buckets = splitSessionByLocalDates(activeSession.start, now, currentTimezone);
    for (const bucket of buckets) {
      if (bucket.date >= range.start && bucket.date <= range.end) {
        periodTotal += bucket.seconds;
      }
    }
  }

  periodTotalEl.textContent = formatTimeHM(periodTotal);
}

/**
 * Render active hostname and tracking indicator
 */
function renderActiveHost() {
  const hostnameEl = document.getElementById("active-hostname");
  const indicatorEl = document.getElementById("tracking-indicator");

  if (activeSession) {
    hostnameEl.textContent = activeSession.host;
    indicatorEl.classList.remove("hidden");
  } else {
    hostnameEl.textContent = "Not browsing";
    indicatorEl.classList.add("hidden");
  }
}

/**
 * Render graph with daily totals
 */
function renderGraph(data) {
  const graphBarsContainer = document.querySelector(".graph-bars");

  const records = data.graph.records;
  const numDays = records.length;

  // Clear existing bars
  graphBarsContainer.innerHTML = "";

  // Find max seconds for scaling
  const maxSeconds = Math.max(...records.map(r => r.seconds), 1);

  for (let i = 0; i < numDays; i++) {
    const record = records[i];
    const percentage = (record.seconds / maxSeconds) * 100;

    // Create bar
    const bar = document.createElement("div");
    bar.className = "graph-bar";
    bar.style.height = `${Math.max(percentage, 2)}%`; // Minimum 2% for visibility
    bar.title = `${record.date}: ${formatTimeHM(record.seconds)}`;
    graphBarsContainer.appendChild(bar);
  }
}

/**
 * Render top hosts list
 */
function renderTopHosts(data) {
  const topHostsContainer = document.getElementById("top-hosts");
  topHostsContainer.innerHTML = "";

  if (data.top_hosts.hosts.length === 0) {
    topHostsContainer.innerHTML = '<div class="host-row"><span class="hostname">No data yet</span></div>';
    return;
  }

  for (const host of data.top_hosts.hosts) {
    const row = document.createElement("div");
    row.className = "host-row";
    row.innerHTML = `
      <span class="hostname">${host.hostname}</span>
      <span class="time">${formatTimeHM(host.seconds)}</span>
    `;
    topHostsContainer.appendChild(row);
  }
}

/**
 * Start live update interval for active session
 */
function startLiveUpdates() {
  // Clear any existing interval
  if (liveUpdateInterval) {
    clearInterval(liveUpdateInterval);
  }

  // Update every second
  liveUpdateInterval = setInterval(() => {
    updateLiveSession();
  }, 1000);
}

/**
 * Update display with active session elapsed time
 */
function updateLiveSession() {
  if (!activeSession || !mergedData) return;

  const now = new Date();
  const sessionStart = new Date(activeSession.start);
  
  // Calculate total elapsed seconds from session start to now
  const totalElapsedSeconds = Math.floor((now - sessionStart) / 1000);
  
  if (totalElapsedSeconds <= 0) return;

  // Get today's date and period range in timezone
  const today = getTodayInTimeZone(currentTimezone);
  const range = getDateRangeForPeriod(currentPeriod, currentTimezone);

  // Split session into date buckets to find how much time falls in today and period
  const buckets = splitSessionByLocalDates(activeSession.start, now.toISOString(), currentTimezone);

  let sessionToday = 0;
  let sessionPeriod = 0;

  for (const bucket of buckets) {
    if (bucket.date === today) {
      sessionToday += bucket.seconds;
    }
    if (bucket.date >= range.start && bucket.date <= range.end) {
      sessionPeriod += bucket.seconds;
    }
  }

  // Add active session time to base totals (server + unsent only)
  const todayTotal = mergedData.today_total + sessionToday;
  const periodTotal = mergedData.period_total + sessionPeriod;

  const todayTotalEl = document.getElementById("today-total");
  const periodTotalEl = document.getElementById("period-total");

  todayTotalEl.textContent = formatTimeHMS(todayTotal);
  periodTotalEl.textContent = formatTimeHM(periodTotal);
}

/**
 * Format seconds to HH:MM:SS
 */
function formatTimeHMS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    seconds.toString().padStart(2, "0"),
  ].join(":");
}

/**
 * Format seconds to HH:MM
 */
function formatTimeHM(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Show loading state
 */
function showLoadingState() {
  const todayTotalEl = document.getElementById("today-total");
  const periodTotalEl = document.getElementById("period-total");
  const graphBarsContainer = document.querySelector(".graph-bars");

  todayTotalEl.textContent = "--:--:--";
  periodTotalEl.textContent = "--:--";
  graphBarsContainer.innerHTML = '<div style="width:100%;text-align:center;padding:20px;">Loading...</div>';
}

/**
 * Hide loading state
 */
function hideLoadingState() {
  // Data is already rendered by loadAndRenderData
}

/**
 * Show error state
 */
function showErrorState(error) {
  const todayTotalEl = document.getElementById("today-total");
  const periodTotalEl = document.getElementById("period-total");
  const graphBarsContainer = document.querySelector(".graph-bars");

  todayTotalEl.textContent = "00:00:00";
  periodTotalEl.textContent = "00:00";
  graphBarsContainer.innerHTML = `
    <div style="width:100%;text-align:center;padding:20px;color:#dc3545;">
      Failed to load data<br>
      <small>${error.message || "Unknown error"}</small>
    </div>
  `;
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", initPopup);
