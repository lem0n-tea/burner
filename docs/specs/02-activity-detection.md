# 02 - Activity Detection (Firefox)

## Why

The extension must detect user activity on web pages to distinguish active engagement from passive background tabs. This is core to accurate time tracking.

## What

Implement content script that listens for user interactions (mouse, keyboard, scroll, touch) and throttled pings to the background script to signal active engagement.

## Constraints

### Must

- Listen for: `mousemove`, `mousedown`, `keydown`, `scroll`, `touchstart`, `visibilitychange`
- Throttle pings to background (max once per 5 seconds)
- Use `browser.runtime.sendMessage` for communication
- Handle page visibility changes
- Use ES modules for imports

### Must Not

- No DOM manipulation beyond detection
- No blocking user interactions
- No tracking full URLs (hostname only)

### Out of Scope

- Session lifecycle management
- Storing sessions
- Syncing to backend

## Current State

- Project scaffold complete (Spec 01)
- Content script shell exists at `browser_extension/content/content-script.js`
- Browser API module available at `browser_extension/lib/browser-api.js`

## Tasks

### T1: Implement Event Listeners

**What:** Add listeners for all activity events (mouse, keyboard, scroll, touch)

**Files:** `browser_extension/content/content-script.js`

**Verify:** Each event type triggers handler when user interacts with page

### T2: Implement Throttled Ping System

**What:** Create throttling logic to limit background pings to once per 5 seconds despite frequent events

**Files:** `browser_extension/content/content-script.js`

**Verify:** Rapid mouse movements produce only 1 ping per 5-second window

### T3: Handle Visibility Changes

**What:** Detect when page becomes hidden/visible via `visibilitychange` event

**Files:** `browser_extension/content/content-script.js`

**Verify:** Background receives notification when tab is hidden or shown

### T4: Message Background on Activity

**What:** Send activity ping to background script with tab ID and timestamp

**Files:** `browser_extension/content/content-script.js`

**Payload:**
```js
{
  type: "ACTIVITY_PING",
  tabId: number,
  timestamp: Date.now(),
  hostname: string
}
```

**Verify:** Background script receives and logs activity pings

### T5: Handle Message Errors Gracefully

**What:** Wrap `sendMessage` in try-catch to handle cases where background isn't ready

**Files:** `browser_extension/content/content-script.js`

**Verify:** No console errors if background script fails to receive message

## Validation

1. Open a web page, move mouse repeatedly
2. Check Browser Toolbox console: should see ~1 activity ping per 5 seconds
3. Switch to another tab, return: visibility change detected
4. Close and reopen browser: content script re-injects without errors
5. Test in Firefox only
