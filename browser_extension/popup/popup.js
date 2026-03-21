/**
 * Burner Popup Script
 *
 * Handles popup UI logic, user interactions, and data display.
 */

import { browserAPI } from "../lib/browser-api.js";

// Current state
let currentPeriod = "week";

/**
 * Initialize popup
 */
function initPopup() {
  console.log("Burner popup initialized");

  // Set up event listeners
  setupTabListeners();
  setupOverlayListeners();

  // Initial render
  renderPlaceholderData();
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

      // Re-render data for new period
      renderPlaceholderData();
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
 * Render placeholder data (to be replaced with real data in future specs)
 */
function renderPlaceholderData() {
  // Update graph bars based on period
  updateGraphBars();
}

/**
 * Update graph bars visualization
 */
function updateGraphBars() {
  const graphBarsContainer = document.querySelector(".graph-bars");
  const graphLabelsContainer = document.querySelector(".graph-labels");

  const numDays = currentPeriod === "week" ? 7 : 30;

  // Clear existing bars
  graphBarsContainer.innerHTML = "";
  graphLabelsContainer.innerHTML = "";

  // Generate bars with random heights for placeholder
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  for (let i = 0; i < numDays; i++) {
    // Random height for placeholder (10-90%)
    const height = Math.floor(Math.random() * 80) + 10;

    // Create bar
    const bar = document.createElement("div");
    bar.className = "graph-bar";
    bar.style.height = `${height}%`;
    graphBarsContainer.appendChild(bar);

    // Create label (only show some labels for month view to avoid crowding)
    if (numDays === 7) {
      const label = document.createElement("span");
      label.className = "graph-label";
      label.textContent = dayLabels[i];
      graphLabelsContainer.appendChild(label);
    } else if (numDays === 30 && i % 5 === 0) {
      // Show every 5th day label for month view
      const label = document.createElement("span");
      label.className = "graph-label";
      label.textContent = i + 1;
      graphLabelsContainer.appendChild(label);
    } else if (numDays === 30) {
      // Empty spacer for non-labeled days
      const spacer = document.createElement("span");
      spacer.className = "graph-label";
      spacer.textContent = "";
      graphLabelsContainer.appendChild(spacer);
    }
  }
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
 * Update live clock display
 */
function updateLiveClock() {
  // Placeholder - will be implemented with real data in future specs
  const todayTotalEl = document.getElementById("today-total");
  const periodTotalEl = document.getElementById("period-total");

  // Static placeholder values
  todayTotalEl.textContent = formatTimeHMS(0);
  periodTotalEl.textContent = formatTimeHM(0);
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", initPopup);
