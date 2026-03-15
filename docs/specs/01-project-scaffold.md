# 01 - Project Scaffold (Firefox)

## Why

Establish the foundational Firefox extension structure with manifest, directory layout, and browser-specific APIs. This is the first step before any tracking logic can be implemented.

## What

Create a minimal WebExtension with manifest.json, background script, content script, and popup shell that loads without errors in Firefox.

## Constraints

### Must

- Use Manifest V3 format (Firefox 109+)
- Use `browser` API namespace (Firefox standard)
- Vanilla JavaScript with ES modules
- Permissions: `storage`, `tabs`, `alarms`, `scripting`
- Firefox-specific settings in `browser_specific_settings`

### Must Not

- No Chrome-specific code or fallbacks
- No external dependencies or build tools
- No tracking logic yet (just scaffolding)

### Out of Scope

- Chrome browser support
- Actual session tracking
- Network communication
- UI styling beyond basic structure

## Current State

Backend API exists at `D:\burner\backend\` with endpoints:
- `POST /time/flush` - accept sessions
- `GET /time/stats?period=&timezone=` - retrieve statistics

Extension directory does not exist yet.

## Tasks

### T1: Create Extension Directory Structure

**What:** Set up folder structure for the extension source files

**Files:**
```
browser_extension/
├── manifest.json
├── background/
│   └── background.js
├── content/
│   └── content-script.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
└── lib/
    └── browser-api.js
```

**Verify:** Directory structure created

### T2: Create Browser API Module

**What:** Export `browser` API wrapper as ES module

**Files:** `browser_extension/lib/browser-api.js`

**Verify:**
```js
export const browserAPI = browser;
// Firefox uses browser.* namespace with promise-based APIs
```

### T3: Create Manifest.json

**What:** Write Manifest V3 configuration for Firefox with required permissions

**Files:** `browser_extension/manifest.json`

**Verify:** Manifest loads without errors in Firefox (`about:debugging`)

### T4: Create Background Script Module

**What:** ES module background script that logs on install

**Files:** `browser_extension/background/background.js`

**Verify:** Background script loads (check Browser Toolbox console)

### T5: Create Content Script Module

**What:** ES module content script that logs injection

**Files:** `browser_extension/content/content-script.js`

**Verify:** Content script injects into web pages (check browser console)

### T6: Create Popup Shell

**What:** Basic popup HTML/CSS/JS with placeholder UI

**Files:** `browser_extension/popup/popup.html`, `popup.js`, `popup.css`

**Verify:** Popup opens when clicking extension icon (shows "Burner - Coming Soon")

## Validation

1. Load extension in Firefox (`about:debugging` → Load Temporary Add-on)
2. Verify no console errors in Browser Toolbox
3. Verify popup opens without errors
4. Verify content script logs on HTTP/HTTPS pages
