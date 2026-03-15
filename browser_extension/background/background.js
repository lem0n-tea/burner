/**
 * Burner Background Script
 * 
 * Orchestrates tracking, session lifecycle, storage, and sync.
 * This is the main entry point for the extension's background logic.
 */

import { browserAPI } from "../lib/browser-api.js";

// Log extension installation
browserAPI.runtime.onInstalled.addListener((details) => {
  console.log("Burner extension installed", {
    reason: details.reason,
    previousVersion: details.previousVersion
  });
});

// Log extension startup
console.log("Burner background service worker started");

/**
 * Handle messages from content scripts
 * Note: sender.tab is available for messages from content scripts
 */
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Get tab ID from sender (content scripts always have sender.tab)
  const tabId = sender.tab?.id;
  
  console.log("Background received message:", message, "from tab:", tabId);
  
  switch (message.type) {
    case "ACTIVITY_PING":
      console.log(`Activity ping from tab ${tabId} on ${message.hostname}`);
      // Session tracking will be implemented in Spec 03
      break;
      
    case "VISIBILITY_CHANGE":
      console.log(`Visibility change on tab ${tabId}: ${message.visible ? "visible" : "hidden"}`);
      // Session tracking will be implemented in Spec 03
      break;
      
    default:
      console.log("Unknown message type:", message.type);
  }
  
  // Acknowledge receipt
  sendResponse({ received: true });
  
  // Keep message channel open for async response (not needed here but good practice)
  return false;
});
