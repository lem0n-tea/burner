# 04 - Storage Layer (Firefox)

## Why

Provide reliable persistence for sessions and metadata using `browser.storage.local`. Proper storage management ensures no data loss during browser restarts and enables efficient sync operations.

## What

Implement storage abstraction layer for sessions CRUD, metadata management, unsent queue derivation, and pruning of old synced sessions.

## Constraints

### Must

- Use `browser.storage.local` (not IndexedDB)
- Store sessions keyed by UUID
- Track sync status per session (`synced: boolean`)
- Store metadata: `lastSyncAt`, `retryBackoff`, `timezone`
- Prune sessions older than 30 days after successful sync
- Use ES modules for imports

### Must Not

- No synchronous storage operations (always async/await)
- No blocking operations during session close

### Out of Scope

- Network sync logic (just storage interface)
- UI display of stored data

## Current State

- Session tracking working (Spec 03)
- Sessions persisted to `browser.storage.local` on close
- No structured storage abstraction yet
- No pruning or metadata management

## Tasks

### T1: Create Storage Module

**What:** Create dedicated storage module with organized API

**Files:** `browser_extension/lib/storage.js`

**API:**
```js
Storage.saveSession(session)
Storage.getSession(id)
Storage.getAllSessions()
Storage.getUnsentSessions()
Storage.markSessionsSynced(ids)
Storage.deleteSessions(ids)
Storage.getMeta()
Storage.setMeta(partial)
```

**Verify:** All methods work with `browser.storage.local`

### T2: Implement Session CRUD

**What:** Full create, read, update, delete for sessions

**Files:** `browser_extension/lib/storage.js`

**Verify:**
- New session saved on close
- Session can be retrieved by ID
- Session can be updated (e.g., mark synced)
- Session can be deleted

### T3: Implement Unsent Queue

**What:** Derive list of closed but unsynced sessions

**Files:** `browser_extension/lib/storage.js`

**Verify:** `getUnsentSessions()` returns only sessions where `synced !== true`

### T4: Implement Metadata Management

**What:** Store and retrieve extension metadata

**Files:** `browser_extension/lib/storage.js`

**Meta Structure:**
```js
{
  lastSyncAt: "2026-03-14T11:00:00.000Z",
  retryBackoff: 0, // seconds until next retry
  timezone: "Europe/Berlin",
  lastGetCache: { period, timezone, response, cachedAt }
}
```

**Verify:** Meta persists across restarts

### T5: Implement Pruning Logic

**What:** Remove synced sessions older than retention window (30 days)

**Files:** `browser_extension/lib/storage.js`

**Verify:** After pruning, only sessions < 30 days old remain (if synced)

### T6: Add Storage Error Handling

**What:** Wrap all storage ops in try-catch with graceful degradation

**Files:** `browser_extension/lib/storage.js`

**Verify:** Storage quota exceeded or errors don't crash extension

### T7: Update Background to Use Storage Module

**What:** Refactor background script to use new storage API

**Files:** `browser_extension/background/background.js`

**Verify:** Session tracking still works after refactoring

## Validation

1. Create 5 sessions, verify all in storage
2. Call `getUnsentSessions()` → returns all 5
3. Mark 3 as synced, call again → returns 2
4. Set session dates to 35 days ago, mark synced, run prune → old sessions deleted
5. Fill storage to near quota → extension handles gracefully without crash
6. Restart browser → all data persists correctly
