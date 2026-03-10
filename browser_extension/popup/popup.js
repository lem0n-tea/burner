const FILTERS_KEY = "tracking_filters";

let trackingMode = "WHITELIST"; // default

const siteEl = document.querySelector(".site");
const statusEl = document.querySelector(".tracking-status");
const timeEl = document.querySelector(".time");

const todayTotalEl = document.getElementById("todayTotal");
const periodTotalEl = document.getElementById("periodTotal");
const dailyChartEl = document.getElementById("dailyChart");
const topHostsEl = document.getElementById("topHosts");

// Format milliseconds to "X min Y sec"
function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  return `${min} min ${sec % 60} sec`;
}

function formatSecondsHuman(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Open persistent connection to background
const port = browser.runtime.connect({ name: "popup" });

// Listen for pushed updates
port.onMessage.addListener(({ site, elapsedMs, isTracked }) => {
  siteEl.textContent = site;
  timeEl.textContent = formatTime(elapsedMs);

  if (isTracked) {
    statusEl.textContent = "Tracking";
    statusEl.style.color = "green";
  } else {
    statusEl.textContent = "Not tracking";
    statusEl.style.color = "red";
  }
});

// Handle background shutdown gracefully
port.onDisconnect.addListener(() => {
  siteEl.textContent = "Disconnected";
  timeEl.textContent = "--";
});

// trackingMode toggle
document.addEventListener("DOMContentLoaded", async () => {
  // Loading trackingMode value from local storage
  const filters = await browser.storage.local.get(FILTERS_KEY);

  if (filters[FILTERS_KEY]?.mode) {
    trackingMode = filters[FILTERS_KEY].mode;
  }

  // Adjusting UI toggle to current value 
  const toggle = document.getElementById("modeToggle");
  toggle.checked = trackingMode === "WHITELIST";

  // Changing trackingMode value depending on toggle state
  toggle.addEventListener("change", async (e) => {
    trackingMode = e.target.checked ? "WHITELIST" : "ALL";

    await browser.storage.local.set({
      [FILTERS_KEY]: { mode: trackingMode }
    });
  });

  // Fetch stats button logic
  const fetchBtn = document.getElementById("fetchStatsBtn");

  fetchBtn.addEventListener("click", async () => {
    fetchBtn.disabled = true;
    fetchBtn.textContent = "Loading...";

    try {
      await loadStatistics("week");
    } catch (err) {
      console.error(err);
    }

    fetchBtn.disabled = false;
    fetchBtn.textContent = "Fetch Weekly Stats";
  });

  // Load once on open (best-effort)
  try {
    await loadStatistics("week");
  } catch (err) {
    console.error(err);
  }
});

async function loadStatistics(period) {
    const response = await browser.runtime.sendMessage({
        type: "GET_STATISTICS",
        period: period
    });

    if (response.success) {
        renderStatistics(response.data);
    } else {
        console.error("Error:", response.error);
    }
}

function renderStatistics(stats) {
  if (!stats) return;

  todayTotalEl.textContent = formatSecondsHuman(stats.today_total);
  periodTotalEl.textContent = formatSecondsHuman(stats.period_total);

  // Daily chart (simple bars)
  const records = stats.graph?.records || [];
  const maxSeconds = records.reduce((m, r) => Math.max(m, r.seconds || 0), 0) || 1;
  dailyChartEl.innerHTML = "";

  for (const r of records) {
    const bar = document.createElement("div");
    const seconds = r.seconds || 0;
    const pct = Math.max(0.03, seconds / maxSeconds) * 100;
    bar.className = `bar${seconds === 0 ? " zero" : ""}`;
    bar.style.height = `${seconds === 0 ? 6 : pct}%`;
    bar.title = `${r.date}: ${formatSecondsHuman(seconds)}`;
    dailyChartEl.appendChild(bar);
  }

  // Top hosts list
  const hosts = stats.top_hosts?.hosts || [];
  topHostsEl.innerHTML = "";
  if (hosts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "top-host";
    empty.innerHTML = `<div class="host">No data</div><div class="secs">--</div>`;
    topHostsEl.appendChild(empty);
    return;
  }

  for (const h of hosts) {
    const row = document.createElement("div");
    row.className = "top-host";
    const host = h.hostname || "(unknown)";
    row.innerHTML = `<div class="host">${host}</div><div class="secs">${formatSecondsHuman(h.seconds || 0)}</div>`;
    topHostsEl.appendChild(row);
  }
}