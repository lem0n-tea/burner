# 01 - Project Scaffold

## Why

Establish the foundational extension structure with manifest, directory layout, and cross-browser compatibility layer. This is the first step before any tracking logic can be implemented.

## What

Create a minimal WebExtension with manifest.json, background script, content script, and popup shell that loads without errors in both Chrome and Firefox.

## Constraints

### Must

- Use Manifest V3 format
- Support both Chrome and Firefox via `browserAPI` wrapper
- Vanilla JavaScript only (no frameworks)
- Permissions: `storage`, `tabs`, `alarms`, `scripting`

### Must Not

- No external dependencies or build tools
- No tracking logic yet (just scaffolding)

### Out of Scope

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

### T2: Create Cross-Browser Wrapper

**What:** Implement `browserAPI` wrapper that works with both `browser` (Firefox) and `chrome` (Chrome) namespaces

**Files:** `browser_extension/lib/browser-api.js`

**Verify:**
```js
const browserAPI = typeof browser !== "undefined" ? browser : chrome;
// Wrapper should expose: storage, tabs, alarms, runtime
```

### T3: Create Manifest.json

**What:** Write Manifest V3 configuration with required permissions and script registrations

**Files:** `browser_extension/manifest.json`

**Verify:** Manifest loads without errors in Chrome (`chrome://extensions/`) and Firefox (`about:debugging`)

### T4: Create Background Script Shell

**What:** Minimal background service worker that registers on install

**Files:** `browser_extension/background/background.js`

**Verify:** Background script loads (check console in extension dev tools)

### T5: Create Content Script Shell

**What:** Minimal content script that logs injection

**Files:** `browser_extension/content/content-script.js`

**Verify:** Content script injects into web pages (check browser console)

### T6: Create Popup Shell

**What:** Basic popup HTML/CSS/JS with placeholder UI

**Files:** `browser_extension/popup/popup.html`, `popup.js`, `popup.css`

**Verify:** Popup opens when clicking extension icon (shows "Burner - Coming Soon")

## Validation

1. Load extension in Chrome (Developer Mode → Load unpacked)
2. Load extension in Firefox (about:debugging → Load Temporary Add-on)
3. Verify no console errors in either browser
4. Verify popup opens without errors
5. Verify content script injects on any HTTP/HTTPS page
