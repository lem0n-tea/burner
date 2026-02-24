const FILTERS_KEY = "tracking_filters";

let trackingMode = "WHITELIST"; // default

const siteEl = document.querySelector(".site");
const statusEl = document.querySelector(".tracking-status");
const timeEl = document.querySelector(".time");

// Format milliseconds to "X min Y sec"
function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  return `${min} min ${sec % 60} sec`;
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
});

console.log(Intl.DateTimeFormat().resolvedOptions().timeZone);