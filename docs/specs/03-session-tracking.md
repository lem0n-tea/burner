# 03 - Session Tracking

## Why

Track continuous periods of user engagement with specific hostnames. Sessions represent active interaction time and form the core data unit for the extension.

## What

Implement background script logic to start, maintain, and close sessions based on activity pings, tab changes, focus changes, and inactivity timeouts.

## Constraints

### Must

- Session = continuous active interaction with single hostname
- Start session on: focus + activity ping + no existing session for tab
- Close session on: tab change, window blur, inactivity (60s timeout), tab close
- Normalize hostname: lowercase, strip `www.` prefix
- Store sessions in `browser.storage.local`
- Use UUID for session IDs

### Must Not

- No tracking when browser window is not focused
- No tracking inactive/background tabs
- No full URLs stored (hostname only)

### Out of Scope

- Syncing sessions to backend
- Popup UI display
- Statistics calculation

## Current State

- Project scaffold complete (Spec 01)
- Activity detection working in content script (Spec 02)
- Background script exists but only logs on install

## Tasks

### T1: Implement Host Normalization

**What:** Create utility function to normalize hostnames (lowercase, strip www)

**Files:** `browser_extension/background/background.js`

**Verify:**
```js
normalizeHost("WWW.Example.COM") // → "example.com"
normalizeHost("www.google.com")  // → "google.com"
```

### T2: Implement Session Start Logic

**What:** Start new session when conditions met (focused window, activity ping, no existing session)

**Files:** `browser_extension/background/background.js`

**Session Object:**
```js
{
  id: "uuid-string",
  host: "example.com",
  start: "2026-03-14T11:34:55.567Z", // UTC ISO
  end: null, // null = still open
  tabId: number
}
```

**Verify:** Session created in memory when user actively engages with a tab

### T3: Implement Session Close Logic

**What:** Close sessions on tab change, window blur, or inactivity timeout (60s)

**Files:** `browser_extension/background/background.js`

**Verify:** Session gets `end` timestamp when:
- User switches to different hostname
- Window loses focus
- No activity for 60 seconds

### T4: Implement Inactivity Timer

**What:** Per-tab timer that closes session after 60s of no activity pings

**Files:** `browser_extension/background/background.js`

**Verify:** Session auto-closes if user stops interacting for 60 seconds

### T5: Listen to Tab Events

**What:** Register listeners for `tabs.onActivated`, `tabs.onRemoved`, `tabs.onUpdated`

**Files:** `browser_extension/background/background.js`

**Verify:** Session closes when tab is closed or navigated to different host

### T6: Listen to Window Focus Events

**What:** Register listeners for `windows.onFocusChanged`

**Files:** `browser_extension/background/background.js`

**Verify:** Sessions pause/close when window loses focus

### T7: Persist Sessions to Storage

**What:** Save closed sessions to `browser.storage.local` immediately on close

**Files:** `browser_extension/background/background.js`

**Storage Structure:**
```js
{
  sessions: {
    "uuid-1": { id, host, start, end, synced: false },
    "uuid-2": { id, host, start, end, synced: false }
  }
}
```

**Verify:** Closed sessions persist in storage (check via `browser.storage.local.get()`)

### T8: Handle Extension Restart

**What:** On startup, close any orphaned open sessions from previous run

**Files:** `browser_extension/background/background.js`

**Verify:** After browser restart, no sessions remain in "open" state

## Validation

1. Visit example.com, interact for 30s, switch tabs → session closed with ~30s duration
2. Visit google.com, interact, close tab → session closed immediately
3. Visit site, stop interacting for 65s → session auto-closes at 60s
4. Check storage: sessions stored with correct structure
5. Restart browser: no orphaned open sessions
6. Test in both Chrome and Firefox
