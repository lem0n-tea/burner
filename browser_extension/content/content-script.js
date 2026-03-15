/**
 * Burner Content Script
 * 
 * Injected into web pages to detect user activity.
 * Reports activity pings to the background script.
 */

// Firefox provides browser API globally in content scripts
const browserAPI = browser;

// Configuration
const PING_THROTTLE_MS = 5000; // Max one ping per 5 seconds

// State
let lastPingTime = 0;
let pingTimeout = null;

/**
 * Send activity ping to background script
 */
function sendActivityPing() {
  const now = Date.now();
  
  // Throttle: skip if we pinged recently
  if (now - lastPingTime < PING_THROTTLE_MS) {
    return;
  }
  
  lastPingTime = now;
  
  const message = {
    type: "ACTIVITY_PING",
    timestamp: now,
    hostname: window.location.hostname
  };
  
  try {
    browserAPI.runtime.sendMessage(message);
  } catch (e) {
    // Background may not be ready or message port closed
    // This is expected in some cases, fail silently
  }
}

/**
 * Schedule a ping (debounced)
 */
function schedulePing() {
  if (pingTimeout) {
    clearTimeout(pingTimeout);
  }
  
  // Schedule ping to happen after a short delay
  // This allows multiple rapid events to coalesce into one ping
  pingTimeout = setTimeout(() => {
    sendActivityPing();
    pingTimeout = null;
  }, 100);
}

/**
 * Activity event handlers
 */
function handleActivity() {
  schedulePing();
}

async function handleVisibilityChange() {
  const message = {
    type: "VISIBILITY_CHANGE",
    timestamp: Date.now(),
    hostname: window.location.hostname,
    visible: document.visibilityState === "visible"
  };
  
  try {
    await browserAPI.runtime.sendMessage(message);
  } catch (e) {
    // Fail silently
  }
}

/**
 * Register event listeners
 */
function registerListeners() {
  // User interaction events
  const activityEvents = [
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "touchstart"
  ];
  
  activityEvents.forEach(eventType => {
    document.addEventListener(eventType, handleActivity, { passive: true, capture: true });
  });
  
  // Visibility change
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

// Initialize
console.log("Burner content script injected on:", window.location.hostname);
registerListeners();
