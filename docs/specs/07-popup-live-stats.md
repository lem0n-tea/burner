# 07 - Popup Live Statistics

## Why

Display real-time browsing statistics by merging server data with local unsent sessions. Users need to see accurate, up-to-date totals that tick every second while actively browsing.

## What

Implement data fetching from backend (`GET /stats`), timezone-aware merging of local sessions, live clock updates every second, and dynamic graph/top-hosts rendering.

## Constraints

### Must

- GET `/stats?period=week|month&timezone=IANA` (both params required)
- Merge server response with local unsent sessions
- Convert local sessions to user's timezone for correct date bucket assignment
- Update today total every second (HH:MM:SS)
- Update period total every second (HH:MM)
- Split sessions spanning multiple local dates across date buckets
- Use `Intl.DateTimeFormat` for timezone conversion

### Must Not

- No pre-converting timestamps for server (send UTC)
- No modifying server data
- No blocking UI during fetch

### Out of Scope

- Profile/Settings content (still blank)
- Historical data export

## Current State

- Popup UI structure complete (Spec 06)
- Backend stats endpoint: `GET /time/stats?period=&timezone=`
- Local sessions stored in `browser.storage.local`
- Network module exists (Spec 05)

## Tasks

### T1: Implement Timezone Helper

**What:** Utility to get user's IANA timezone and convert timestamps

**Files:** `browser_extension/lib/timezone.js`

**Functions:**
```js
getTimezone() // → "Europe/Berlin"
dateStringInTimeZone(isoString, timeZone) // → "2026-03-14"
splitSessionByLocalDates(start, end, timeZone) // → [{date, seconds}, ...]
```

**Verify:** Correct date strings for various timezones

### T2: Fetch Stats from Backend

**What:** Call GET `/stats` with period and timezone params

**Files:** `browser_extension/popup/popup.js`

**Request:**
```js
GET /time/stats?period=week&timezone=Europe/Berlin
```

**Verify:** Server response parsed correctly

### T3: Load Local Unsent Sessions

**What:** Fetch unsent sessions from storage for merging

**Files:** `browser_extension/popup/popup.js`

**Verify:** All `synced: false` sessions loaded

### T4: Implement Session Merging

**What:** Merge local sessions into server response by converting to local dates

**Files:** `browser_extension/popup/popup.js`

**Logic:**
1. Get server response (already timezone-bucketed)
2. For each local session:
   - Convert start/end to local timezone
   - Split seconds across local date boundaries
   - Add to appropriate date buckets
3. Add active session seconds if running

**Verify:** Local session seconds added to correct dates

### T5: Handle Multi-Date Sessions

**What:** Split sessions that cross midnight in user's timezone

**Files:** `browser_extension/lib/timezone.js`

**Example:** Session 23:30-00:30 splits into 30min for date1, 30min for date2

**Verify:** Seconds correctly distributed across dates

### T6: Implement Live Clock Ticker

**What:** Update today total every second while popup open

**Files:** `browser_extension/popup/popup.js`

**Logic:**
```js
setInterval(() => {
  const activeSession = getActiveSession();
  if (activeSession) {
    todayTotal += elapsedSeconds(activeSession.start);
    updateClockDisplay(todayTotal);
  }
}, 1000);
```

**Verify:** Clock ticks every second when session active

### T7: Update Period Total Live

**What:** Recalculate period total every second (includes active session)

**Files:** `browser_extension/popup/popup.js`

**Verify:** Period total increments as active session grows

### T8: Render Graph

**What:** Draw bar chart from merged daily totals

**Files:** `browser_extension/popup/popup.js`, `popup.css`

**Verify:** 7 bars (week) or 30 bars (month) with correct heights

### T9: Render Top Hosts

**What:** Display top 5 hosts with time spent

**Files:** `browser_extension/popup/popup.js`

**Verify:** Hosts sorted by seconds, formatted as HH:MM

### T10: Handle Period Tab Switching

**What:** Re-fetch and re-render when switching Week/Month

**Files:** `browser_extension/popup/popup.js`

**Verify:** Graph and totals update when tab clicked

### T11: Cache Server Response

**What:** Store last GET response to avoid redundant fetches

**Files:** `browser_extension/lib/storage.js`, `browser_extension/popup/popup.js`

**Verify:** Rapid popup opens use cached data

### T12: Handle Loading and Error States

**What:** Show loading spinner and error messages

**Files:** `browser_extension/popup/popup.html`, `popup.js`, `popup.css`

**Verify:** User sees feedback during fetch/failure

## Validation

1. Open popup: stats load within 2 seconds
2. Verify GET request has both `period` and `timezone` params
3. Create local session (unsent), open popup: seconds appear in totals
4. Active session running: clock ticks every second
5. Switch Week↔Month: graph updates correctly
6. Session crossing midnight: seconds split across correct dates
7. Test with different timezone (change system TZ): dates align correctly
8. Offline mode: shows cached data with indicator
9. Backend error: shows error message, retry option
