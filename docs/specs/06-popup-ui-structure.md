# 06 - Popup UI Structure (Firefox)

## Why

Create the user-facing popup interface where users view their browsing statistics. The popup must be compact (no scrolling) and display all key metrics at a glance.

## What

Implement popup HTML/CSS structure with header, period tabs, live clock, period total, graph container, and top hosts list. Fixed viewport 360×520px.

## Constraints

### Must

- Fixed size: 360×520 pixels (no scrolling)
- Vanilla HTML/CSS/JavaScript only
- Header: `[Profile] Burner [Settings]`
- Period tabs: `Week | Month`
- Live clock: HH:MM:SS format
- Period total: HH:MM format
- Graph container for daily totals
- Top 5 hosts list
- Use ES modules for scripts

### Must Not

- No external CSS frameworks
- No JavaScript frameworks
- No scrolling in popup

### Out of Scope

- Live data updates (static placeholders for now)
- Server data fetching
- Timezone merging logic
- Profile/Settings functionality (blank overlays OK)

## Current State

- Popup shell exists (Spec 01) with basic "Coming Soon" message
- All tracking and sync logic complete (Specs 02-05)
- Backend API ready with stats endpoint

## Tasks

### T1: Set Popup Dimensions

**What:** Configure manifest and CSS for fixed 360×520 popup

**Files:** `browser_extension/manifest.json`, `browser_extension/popup/popup.css`

**Verify:** Popup opens at exact dimensions without scrollbars

### T2: Create Header Component

**What:** Top bar with Profile icon, Title, Settings icon

**Files:** `browser_extension/popup/popup.html`, `popup.css`

**Structure:**
```html
<header>
  <button id="profile-btn">👤</button>
  <h1>Burner</h1>
  <button id="settings-btn">⚙️</button>
</header>
```

**Verify:** Header renders with flexbox layout

### T3: Create Period Tabs

**What:** Week/Month toggle buttons

**Files:** `browser_extension/popup/popup.html`, `popup.css`

**Verify:** Tabs render side-by-side, active state styling works

### T4: Create Live Clock Display

**What:** Central HH:MM:SS display for today's total

**Files:** `browser_extension/popup/popup.html`, `popup.css`

**Structure:**
```html
<div id="today-total" class="live-clock">00:00:00</div>
```

**Verify:** Large, centered time display

### T5: Create Period Total Display

**What:** Secondary total below clock (HH:MM format)

**Files:** `browser_extension/popup/popup.html`, `popup.css`

**Structure:**
```html
<div id="period-total" class="period-total">00:00</div>
```

**Verify:** Smaller secondary time display

### T6: Create Graph Container

**What:** Placeholder for daily totals bar chart

**Files:** `browser_extension/popup/popup.html`, `popup.css`

**Structure:**
```html
<div id="graph-container">
  <div class="graph-bars"><!-- 7 or 30 bars --></div>
  <div class="graph-labels"><!-- date labels --></div>
</div>
```

**Verify:** Container sized for 7 or 30 day bars

### T7: Create Top Hosts List

**What:** List of top 5 hosts with time spent

**Files:** `browser_extension/popup/popup.html`, `popup.css`

**Structure:**
```html
<div id="top-hosts">
  <div class="host-row">
    <span class="hostname">example.com</span>
    <span class="time">01:23</span>
  </div>
</div>
```

**Verify:** 5 rows with hostname and time

### T8: Create Overlay Containers

**What:** Modal overlays for Profile and Settings (blank for now)

**Files:** `browser_extension/popup/popup.html`, `popup.css`, `popup.js`

**Verify:** Clicking Profile/Settings opens overlay, close button works

### T9: Add Base Styling

**What:** CSS variables, typography, color scheme

**Files:** `browser_extension/popup/popup.css`

**Verify:** Consistent styling across all components

## Validation

1. Open popup: all sections visible without scrolling
2. Header: Profile and Settings buttons clickable
3. Period tabs: Week/Month both visible
4. Live clock: displays "00:00:00" (static for now)
5. Period total: displays "00:00" (static for now)
6. Graph: placeholder bars visible
7. Top hosts: 5 placeholder rows visible
8. Overlays: open and close without errors
9. Test in Firefox only
