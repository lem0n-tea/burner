# 05 - Sync & Network Layer (Firefox)

## Why

Periodically upload closed sessions to the backend API. Reliable sync ensures user data is backed up and available for statistics display across sessions/devices.

## What

Implement network layer with periodic sync scheduler, POST to `/time/flush`, exponential backoff on failures, and proper payload construction (`total = sessions.length`).

## Constraints

### Must

- Use `alarms` API for periodic sync (every 2 minutes)
- POST payload: `{ total, timezone, sessions }` where `total === sessions.length`
- Include user's IANA timezone in every request
- Exponential backoff on failures (with jitter)
- Handle 4xx errors by dropping invalid sessions
- Send UTC timestamps (no pre-conversion for bucketing)
- Use ES modules for imports

### Must Not

- No blocking sync during user interactions
- No retry on 4xx without inspecting payload
- No sync of open/in-progress sessions

### Out of Scope

- Popup UI integration
- Statistics GET requests
- Timezone conversion for display

## Current State

- Storage layer complete (Spec 04)
- Sessions stored with `synced: false` flag
- Backend endpoint: `POST /time/flush`

## Tasks

### T1: Create Network Module

**What:** Centralized fetch wrapper with error handling

**Files:** `browser_extension/lib/network.js`

**API:**

```js
Network.postSessions(sessions, timezone);
Network.getStats(period, timezone);
```

**Verify:** Basic fetch calls work to backend

### T2: Build Sync Payload

**What:** Construct payload per API contract

**Files:** `browser_extension/lib/network.js`

**Payload:**

```js
{
  total: sessions.length, // count of sessions, NOT sum of seconds
  timezone: "Europe/Berlin",
  sessions: [
    { id, host, start, end } // start and end are UTC ISO strings
  ]
}
```

**Verify:** `total` field equals array length

### T3: Implement Periodic Sync Scheduler

**What:** Use `alarms` API to trigger sync every 2 minutes

**Files:** `browser_extension/background/background.js`, `browser_extension/background/sync.js`

**Verify:** Sync runs automatically every 2 minutes when extension is active

### T4: Implement Sync Logic

**What:** Fetch unsent sessions, POST to backend, mark synced on success

**Files:** `browser_extension/background/sync.js`

**Verify:**

- Unsent sessions collected from storage
- POST request sent to `/time/flush`
- On success: sessions marked `synced: true`

### T5: Implement Exponential Backoff

**What:** Retry failed syncs with increasing delays (1min, 2min, 4min, 8min...)

**Files:** `browser_extension/background/sync.js`

**Verify:** After failure, next sync delayed according to backoff schedule

### T6: Handle 4xx Errors

**What:** Inspect and drop invalid sessions on client errors

**Files:** `browser_extension/background/sync.js`

**Verify:** Invalid sessions logged/dropped, valid ones still synced

### T7: Handle Network Errors

**What:** Gracefully handle offline, timeout, server errors

**Files:** `browser_extension/lib/network.js`

**Verify:** No crashes on network failure, backoff triggered

### T8: Add Sync on Startup

**What:** Trigger sync when background script starts (browser restart)

**Files:** `browser_extension/background/background.js`

**Verify:** Sessions synced shortly after browser restart

### T9: Add Backend URL Configuration

**What:** Configurable backend API URL (default or user-specified)

**Files:** `browser_extension/lib/network.js`

**Verify:** Can configure different backend URLs

## Validation

1. Create 3 unsent sessions, wait 2 minutes → verify POST sent, sessions marked synced
2. Disconnect network, trigger sync → backoff increases, no crash
3. Reconnect → sync succeeds on next attempt
4. Send invalid session (end < start) → backend rejects, extension drops it
5. Check backend DB: sessions stored correctly
6. Verify `total` field in POST equals `sessions.length`
7. Verify timestamps are UTC ISO format
