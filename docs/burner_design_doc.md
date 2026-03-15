Updated design document with your new requirements incorporated.

# Extension design document — **Burner**

Burner is a browser extension designed to help users monitor their web productivity. It tracks time spent on specific hostnames in real-time, synchronizes data with a backend server, and provides a visual dashboard of browsing habits directly within the browser popup. The extension supports both FireFox and Chrome browsers.

---

> **High level summary**
> A cross-browser WebExtension (supports Chrome and Firefox) that measures how long the user actively engages with websites (normalized by hostname), stores sessions in the extension's **local storage** (`browser.storage.local`), periodically uploads them to an existing backend, and shows a compact, no-scroll popup with daily/period totals, a graph and top hosts. Tracking only happens when the browser is open and only for the host shown in the active tab. Timezone conversions for server-side bucketing are handled by the backend; the extension sends timestamps in UTC and passes the user's IANA timezone where required and performs timezone conversions locally _only_ when preparing UI merges for unsent sessions and display formatting.

---

# Contents

1. Goals & non-goals
2. User-visible behavior (UX)
3. Data model & API contract (server) — POST/GET semantics & timezone handling
4. High-level architecture & components (cross-browser notes)
5. Session & tracking logic (detailed)
6. Sync / networking strategy — `total` semantics & timezone note
7. Popup UI / data flow & merging rules — _live period total_ & timezone merge behavior
8. Storage layout & persistence strategy — uses `browser.storage.local`
9. Permissions & manifest examples (Chrome + Firefox notes)
10. Edge cases, timezone & privacy
11. Testing, metrics & QA — including GET query param tests
12. Milestones / implementation tasks
13. Implementation snippets (vanilla JS + `browser.storage.local` + cross-browser wrapper)

---

# 1. Goals & non-goals

**Goals**

- Track seconds of active engagement per normalized hostname.
- Count time **only** when browser is open and the tracked host is the active tab.
- Sessions represent continuous active interaction in a single tab.
- Store sessions in extension local storage (`browser.storage.local`) and periodically POST them to backend. **Important:** POST body `total` equals `sessions.length` (the number of session objects).
- Backend performs timezone conversion for POST and GET (server uses the provided timezone to bucket sessions). The extension converts only for UI display and to merge unsent local sessions into server buckets.
- GET stats endpoint _requires_ two query parameters: `period` (`week` or `month`) and the user's IANA timezone (e.g., `Europe/Berlin`).
- UI uses plain HTML, CSS and Vanilla JS. Both **today** and **period** totals update live while tracking is active.
- Cross-browser: support Chrome & Firefox via WebExtensions APIs.

**Non-goals**

- No Profile/Settings content yet.
- No server-side aggregation — backend remains authoritative for stored buckets.

---

# 2. User-visible behavior (UX)

Popup (no scrolling):

- **Header**: `[Profile]  Extension Title  [Settings]`
- **Period tabs**: `Week | Month`.
- **Central live clock**: Today total (HH:MM:SS) — updates every second while active.
- **Period total**: below (HH:MM) — _also updates live_ while active.
- **Graph**: daily totals for the chosen period (week=7 / month=30).
- **Top hosts**: top 5 hosts for the chosen period (HH:MM).
- Profile & Settings open as overlays (blank for now).

Design for a fixed popup viewport (e.g., 360×520) so no scrolling is required.

---

# 3. Data model & API contract (server) — POST/GET semantics & timezone handling

## POST sessions payload (client → server)

Client sends closed sessions as UTC timestamps and metadata. **Important:** `total` equals the number of session objects in `sessions` (`sessions.length`).

Example:

```json
{
  "total": 1,
  "timezone": "Europe/Berlin",
  "sessions": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "host": "example.com",
      "start": "2026-03-14T11:34:55.567Z",
      "end": "2026-03-14T11:44:55.567Z"
    }
  ]
}
```

- `total` — integer equal to `sessions.length`.
- `timezone` — user's IANA timezone name (server uses this to convert / bucket sessions on ingestion). The extension provides the timezone but **does not** pre-convert timestamps for bucketing — timestamps remain UTC ISO strings.

## GET stats request (client → server)

GET endpoint requires two query parameters:

- `period`: `"week"` or `"month"`.
- `timezone`: user's IANA timezone name.

Example request:

```
GET /stats?period=week&timezone=Europe/Berlin
```

## GET stats response (server → extension)

Server returns aggregated buckets **already converted** to the requested timezone (backend handles bucketing). Example:

```json
{
  "period": "week",
  "range_start": "2026-03-08",
  "range_end": "2026-03-14",
  "today_total": 0, // seconds for the user's timezone/day
  "period_total": 0,
  "graph": {
    "days": 7,
    "records": [{ "date": "2026-03-08", "seconds": 0 }]
  },
  "heatmap": {
    "days": 30,
    "records": [{ "date": "2026-02-13", "seconds": 0 }]
  },
  "top_hosts": {
    "total": 0,
    "hosts": [{ "id": 1, "hostname": "example.com", "seconds": 0 }]
  }
}
```

- Because the server already used the provided timezone for bucketing, the extension can _directly_ merge its unsent local sessions after converting those sessions to the same timezone (so both data sources align).

---

# 4. High-level architecture & components (cross-browser notes)

- **Background service worker / background script** — orchestrates tracking, session lifecycle, storage, and sync. Works with `browser` or `chrome` via a small adapter.
- **Content script** — lightweight, injected into pages, reports user activity pings to background.
- **Popup UI** (HTML/CSS/Vanilla JS) — queries server (`GET /stats?period=...&timezone=...`), reads local unsent sessions from `browser.storage.local`, converts local session timestamps into the same timezone for merging, shows live today & period totals and chart.
- **Storage** — `browser.storage.local` (extension local storage) for sessions and metadata. No IndexedDB — the extension uses WebExtension local storage API for simplicity and cross-browser consistency.
- **Sync scheduler** — `alarms` to periodically send closed sessions via POST.
- **Network** — `fetch` to backend endpoints; handle failures with retry/backoff.

Cross-browser: use `const browserAPI = window.browser || window.chrome` wrapper.

---

# 5. Session & tracking logic (detailed)

(unchanged core reasoning, with storage and timezone responsibilities clarified)

## Normalizing a website to host

- `new URL(url).hostname` → lowercase → strip `www.` (configurable).

## Start counting

Start session when: window focused, active tab maps to host, recent activity ping from content script, and no active session for same tab+host.

## Stop / close session

Stop when: active tab changes to another host; window loses focus; inactivity timeout (60s) exceeded; tab closed or navigated away.

## Activity detection

Content script listens for `mousemove`, `mousedown`, `keydown`, `scroll`, `touchstart`, and `visibilitychange`. Throttle pings (e.g., once per 5s).

## Timestamp handling

- Store and send `start` and `end` as UTC ISO (`Date.toISOString()`), **do not** pre-convert them for server bucketing. Include user's IANA timezone in POST body. Backend will convert/bucket the timestamps appropriately.

---

# 6. Sync / networking strategy — `total` semantics & timezone note

## When to send

- Periodic `alarms` (e.g., every 2 minutes).
- Immediately if unsent closed session count > threshold (e.g., 10) or on startup/resume.

## Payload

- Collect closed unsent sessions from `browser.storage.local`. Build:

```json
{
  "total": sessions.length,
  "timezone": "<IANA timezone>",
  "sessions": [ { id, host, start, end }, ... ]
}
```

- `total` is **the number of items** in `sessions`, not the sum of seconds.

## Server-side timezone conversion

- The backend will use `timezone` and the UTC timestamps to bucket sessions into the correct date/time buckets. The extension does not pre-convert timestamps for server consumption.

## Retry & backoff

- Standard exponential backoff with jitter for transient errors. On 4xx errors inspect payload and drop or move to a debug queue to avoid endless retries.

---

# 7. Popup UI — merging rules, live period total & timezone behavior

## High-level merge flow

1. Popup requests server:

   ```
   GET /stats?period=<week|month>&timezone=<IANA>
   ```

   The response contains buckets already converted to that timezone.

2. Popup loads unsent local sessions from `browser.storage.local`. Each local session has UTC timestamps. The extension must **convert those session timestamps to the same IANA timezone used in the GET request** so that local session seconds are added to the correct date buckets returned by the server.
   - The extension **performs timezone conversion only for UI merging/display**, not for server storage.

3. Merge server buckets + local converted sessions + current active session to produce:
   - live **today total** (HH:MM:SS), ticking when active,
   - live **period total** (HH:MM), ticking when active and recalculated whenever local sessions or active session changes,
   - graph (daily totals) augmented with local sessions,
   - top hosts recalculated with local sessions.

## Period total live update

- Because active session contributes to the overall period total, recompute and update the period total every second if the active session overlaps the period range, and whenever a local session is closed or arrives.

## Date/time conversion for merging (client-side)

- Convert each local session's start/end UTC timestamps into dates in the user's IANA timezone when determining which day bucket(s) to add seconds to. You can use `Intl.DateTimeFormat` with `timeZone` to obtain the local date string. For sessions spanning multiple local dates, split seconds across dates according to local boundaries.

## Example merging responsibilities summary

- **Server**: bucketing, timezone conversion for persisted data (based on timezone param in POST & GET).
- **Extension**: convert local unsent sessions into the same timezone as used in GET to combine correctly with server-provided buckets for UI display.

---

# 8. Storage layout & persistence strategy — uses `browser.storage.local`

Switch from IndexedDB to `browser.storage.local` (WebExtensions local storage) as requested. This keeps implementation simpler and is cross-browser.

### Data layout (suggested keys)

- `sessions` — object mapping `id` → session object (closed/open/synced flags).
- `meta` — `{ lastSyncAt, retryBackoff, lastGetCache: { period, timezone, response }, timezone }`.
- `unsentQueue` — derived view: list of closed sessions where `synced !== true`.

### Persistence rules

- Write to `browser.storage.local` on session close and periodically (on important state changes).
- On startup, read `sessions` and rehydrate any in-progress sessions (close any that should be closed at lastActiveAt).

### Pruning

- Remove sessions older than retention window (e.g., 30 days) after successful sync and server confirmation.

---

# 9. Permissions & manifest examples (Chrome + Firefox notes)

**Permissions**

- `"storage"`, `"tabs"`, `"alarms"`, `"scripting"`.
- `host_permissions` for page injection (`http://*/*`, `https://*/*`) and the backend endpoint (e.g., `https://api.example.com/*`).

**Manifest (MV3 example; adapt for Firefox packaging)**

```json
{
  "manifest_version": 3,
  "name": "Burner",
  "version": "0.1.0",
  "permissions": ["storage", "tabs", "alarms", "scripting"],
  "host_permissions": ["http://*/*", "https://*/*"],
  "background": { "service_worker": "background.js" },
  "action": {
    "default_popup": "popup.html",
    "default_title": "Burner"
  },
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": ["content-script.js"],
      "run_at": "document_idle"
    }
  ]
}
```

For Firefox packaging, optionally include `applications.gecko` block.

---

# 10. Edge cases, timezone & privacy

## Timezones & DST

- Backend performs conversion/bucketing for saved data.
- Extension must convert local unsent sessions to the same timezone (user's IANA) for accurate merging and display. Use `Intl.DateTimeFormat` or a small timezone helper to determine the local date for a timestamp under a specific timezone. For sessions spanning multiple local dates, split seconds across dates according to local boundaries.

## Privacy

- Store only normalized hostnames and timestamps in `browser.storage.local`. No full URLs or page content. Use HTTPS for all network transmissions and expose a clear setting in future to export/clear local data.

---

# 11. Testing, metrics & QA — include GET query param tests

### Tests to add

- Verify GET is called with `?period=...&timezone=<IANA>` and server response merges correctly.
- Verify POST payload includes `timezone` and that `total` equals `sessions.length`.
- Verify local unsent sessions are converted into the requested timezone and assigned to the correct date buckets (including DST boundaries).
- Verify both today and period totals update live while active.
- Cross-browser tests (Chrome/Firefox) for `browser.storage.local` behavior.

Manual QA checklist highlights:

- Confirm GET query parameters are present and correct.
- Confirm POST `total === sessions.length`.
- Confirm live period total updates when active session crosses minute boundaries and when local sessions are closed.
- Test DST: sessions around DST boundaries are bucketed correctly after merge.

---

# 12. Milestones / implementation tasks

(unchanged structure, but note storage switch)

- Sprint 1: core tracking + `browser.storage.local` session persistence.
- Sprint 2: sync & network (POST `total = sessions.length` + timezone field).
- Sprint 3: popup UI (vanilla JS) + merge local sessions after converting to requested timezone; live today & period totals.
- Sprint 4: cross-browser QA (Chrome & Firefox), privacy review.

---

# 13. Implementation snippets (vanilla JS + `browser.storage.local` + timezone merge tips)

### Cross-browser wrapper

```js
const browserAPI = typeof browser !== "undefined" ? browser : chrome;
```

### Use `browser.storage.local` (set / get)

```js
// store a session
async function saveSession(session) {
  const result = await browserAPI.storage.local.get({ sessions: {} });
  const sessions = result.sessions || {};
  sessions[session.id] = session;
  await browserAPI.storage.local.set({ sessions });
}

// read all sessions
async function loadAllSessions() {
  const result = await browserAPI.storage.local.get({ sessions: {} });
  return result.sessions || {};
}
```

### Build POST payload — `total` is sessions.length

```js
function buildSyncPayload(sessionsArray) {
  return {
    total: sessionsArray.length, // number of sessions
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sessions: sessionsArray.map((s) => ({
      id: s.id,
      host: s.host,
      start: s.start, // UTC ISO
      end: s.end, // UTC ISO
    })),
  };
}
```

### GET stats: include query params `period` and `timezone`

```js
async function fetchStats(period) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const url = new URL("https://api.example.com/stats");
  url.searchParams.set("period", period);
  url.searchParams.set("timezone", tz);
  const res = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
  });
  return await res.json();
}
```

### Converting local session timestamps to user's timezone for merging

- The server returns buckets already in the requested timezone. For local sessions, convert each session's UTC timestamps into the same timezone _only for deciding which local date bucket(s) to increment_. Example helper approach (vanilla JS + Intl):

```js
// returns local date string 'YYYY-MM-DD' in the given IANA time zone
function dateStringInTimeZone(isoTimestamp, timeZone) {
  // Use toLocaleString to get components for the timeZone, then build date string
  const dt = new Date(isoTimestamp);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
  // 'en-CA' default gives YYYY-MM-DD; format is locale dependent, but en-CA is ISO-like
  return parts; // e.g., '2026-03-14'
}
```

For sessions spanning multiple local dates, split seconds:

- Compute UTC `start` and `end`, iterate daily boundaries in the target timezone, and compute seconds falling into each date bucket.

### Recomputing live totals

- Query server via `GET /stats?period=...&timezone=...`.
- Load unsent sessions from `browser.storage.local`. Convert unsent sessions into same timezone and aggregate by date/host.
- Add active session contribution and update `today` (HH:MM:SS) and `period` (HH:MM) live. Recompute every second while active.
