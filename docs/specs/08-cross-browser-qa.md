# 08 - Cross-Browser QA & Privacy Review

## Why

Ensure the extension works identically in Chrome and Firefox, handles edge cases correctly, and meets privacy requirements before release.

## What

Comprehensive testing across browsers, DST boundary verification, privacy audit, and performance optimization.

## Constraints

### Must

- Test in latest Chrome and Firefox
- Verify DST boundary handling
- Audit all stored data for privacy compliance
- Document known issues
- Performance: popup opens < 1 second

### Must Not

- No storing full URLs (hostname only)
- No transmitting page content
- No persistent identifiers beyond session UUIDs

### Out of Scope

- Profile/Settings features (still blank)
- Mobile browser support

## Current State

- All features implemented (Specs 01-07)
- Working in development mode
- No formal QA completed

## Tasks

### T1: Chrome Installation Test

**What:** Load extension as unpacked, verify all features

**Files:** Chrome browser

**Verify:**
- Extension loads without warnings
- All permissions granted
- Tracking works on real websites
- Popup displays correctly
- Sync to backend succeeds

### T2: Firefox Installation Test

**What:** Load extension temporarily, verify all features

**Files:** Firefox browser

**Verify:**
- Extension loads without errors
- `browser` API works (not `chrome`)
- All features match Chrome behavior

### T3: DST Boundary Test

**What:** Verify sessions around DST transitions bucket correctly

**Files:** Test environment with TZ manipulation

**Test Cases:**
- Session spanning DST start (clocks spring forward)
- Session spanning DST end (clocks fall back)
- Verify local date assignment correct

**Verify:** Seconds assigned to correct local dates

### T4: Privacy Audit - Storage

**What:** Review all data stored in `browser.storage.local`

**Files:** `browser_extension/lib/storage.js`

**Verify:**
- Only hostnames stored (no URLs, no page content)
- Session UUIDs are random (no user identification)
- No cookies or persistent identifiers

### T5: Privacy Audit - Network

**What:** Review all network transmissions

**Files:** `browser_extension/lib/network.js`

**Verify:**
- HTTPS only (no HTTP endpoints)
- No sensitive data in payloads
- Timezone is only user-specific data sent

### T6: Performance Test - Popup Load

**What:** Measure time from click to fully rendered popup

**Files:** Browser dev tools

**Verify:** Popup renders in < 1 second average

### T7: Performance Test - Memory Usage

**What:** Check memory after extended use (1+ hour)

**Files:** Browser task manager

**Verify:** Memory stable, no leaks

### T8: Edge Case - Rapid Tab Switching

**What:** Test sessions when switching tabs every few seconds

**Verify:** Sessions close/open correctly, no duplicates

### T9: Edge Case - Browser Sleep/Wake

**What:** Test behavior when laptop sleeps and wakes

**Verify:** Sessions close correctly, no time corruption

### T10: Edge Case - Backend Unavailable

**What:** Test when backend is down for extended period

**Verify:**
- Local storage continues working
- Backoff prevents spam
- Data syncs when backend returns

### T11: Edge Case - Storage Quota

**What:** Test behavior near storage limit

**Verify:** Graceful degradation, no crashes

### T12: Document Known Issues

**What:** Create KNOWN_ISSUES.md with any limitations

**Files:** `browser_extension/KNOWN_ISSUES.md`

**Verify:** Documented workarounds for any issues

### T13: Create Installation Guide

**What:** Write INSTALL.md for end users

**Files:** `browser_extension/INSTALL.md`

**Content:** Installation steps for Chrome and Firefox

### T14: Create Developer Guide

**What:** Write README.md for developers

**Files:** `browser_extension/README.md`

**Content:** Build, test, deploy instructions

## Validation

### Chrome Checklist
- [ ] Extension loads without errors
- [ ] Tracking works on multiple sites
- [ ] Popup displays all data correctly
- [ ] Sync succeeds to backend
- [ ] Storage persists across restarts

### Firefox Checklist
- [ ] Extension loads without errors
- [ ] `browser` API compatibility confirmed
- [ ] All features match Chrome
- [ ] No console warnings

### DST Tests
- [ ] Session spanning DST start: correct bucketing
- [ ] Session spanning DST end: correct bucketing
- [ ] Display shows correct local times

### Privacy Checklist
- [ ] No full URLs stored
- [ ] No page content captured
- [ ] No third-party trackers
- [ ] HTTPS enforced
- [ ] User can clear all data

### Performance Checklist
- [ ] Popup opens < 1 second
- [ ] Memory stable after 1 hour
- [ ] No CPU spikes during tracking

### Final Sign-off
1. All checkboxes complete
2. No critical bugs open
3. Privacy audit passed
4. Both browsers verified
5. Ready for beta release
