# Burner - Project Context

## Project Overview

**Burner** is a time-tracking application designed to help users monitor their web browsing habits. It consists of:

1. **Backend API** (FastAPI/Python) - Server-side component that receives, stores, and aggregates browsing session data
2. **Browser Extension** (Firefox/Chrome) - Cross-browser extension that tracks active time spent on websites and syncs with the backend

The backend uses **PostgreSQL** for data storage with daily time buckets aggregated by hostname. The extension tracks user activity and POSTs sessions to the API.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend Framework | FastAPI (Python) |
| Database | PostgreSQL (async) |
| ORM | SQLAlchemy (async) |
| Validation | Pydantic v2 |
| Migrations | Alembic |
| Extension | WebExtensions API (MV3) |

## Project Structure

```
burner/
├── backend/
│   └── app/
│       ├── main.py           # FastAPI app entry point
│       ├── config.py         # Environment configuration
│       ├── database.py       # Async DB engine & session factory
│       ├── db_depends.py     # DB dependency injection
│       ├── schemas.py        # Pydantic models (request/response)
│       ├── time_splitting.py # UTC→local date bucket splitting
│       ├── models/
│       │   ├── hosts.py              # Host table (hostname → id)
│       │   └── daily_time_buckets.py # Aggregated seconds per host/date
│       ├── routers/
│       │   └── time.py    # Main API endpoints (/time/*)
│       └── migrations/    # Alembic migrations
├── browser_extension/
│   ├── manifest.json         # Extension configuration (MV3)
│   ├── background/
│   │   └── background.js     # Tracking orchestration
│   ├── content/
│   │   └── content-script.js # Activity detection
│   ├── popup/
│   │   ├── popup.html        # Popup UI
│   │   ├── popup.css         # Styles
│   │   └── popup.js          # UI logic
│   └── lib/
│       ├── browser-api.js    # Cross-browser wrapper
│       ├── storage.js        # Storage abstraction
│       └── utils.js          # Utilities
└── docs/
    ├── burner_design_doc.md  # Extension design specification
    └── spec_template.md      # Feature spec template
```

## API Endpoints

All endpoints are prefixed with `/time`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/time/flush` | Submit recorded sessions for storage |
| `POST` | `/time/flush/mock` | Mock endpoint (echo payload) |
| `GET` | `/time/stats?period=week|month&timezone=IANA` | Get statistics for period |
| `DELETE` | `/time/all` | Wipe all time bucket data |

### Key Request/Response Schemas

**POST /time/flush**
```json
{
  "total": 2,
  "timezone": "Europe/Berlin",
  "sessions": [
    {
      "id": "uuid",
      "host": "example.com",
      "start": "2026-03-14T11:34:55.567Z",
      "end": "2026-03-14T11:44:55.567Z"
    }
  ]
}
```

**Important:** `total` equals `sessions.length` (count of session objects, not sum of seconds).

**GET /time/stats**
```json
{
  "period": "week",
  "range_start": "2026-03-08",
  "range_end": "2026-03-14",
  "today_total": 3600,
  "period_total": 25200,
  "graph": { "days": 7, "records": [...] },
  "heatmap": { "days": 30, "records": [...] },
  "top_hosts": { "total": 5, "hosts": [...] }
}
```

## Database Schema

**hosts**
- `id` (integer, primary key)
- `name` (string, unique, not null)

**daily_time_buckets**
- `id` (integer, primary key)
- `host_id` (integer, FK to hosts, cascade delete)
- `date` (date, not null)
- `duration_seconds` (integer, default 0)
- Unique constraint: `(host_id, date)`

## Building and Running

### Prerequisites

- Python 3.9+ (for `zoneinfo` module)
- PostgreSQL database
- Virtual environment (`.venv/` already exists)
- Firefox 109.0+ or Chrome (for extension)

### Backend Setup

```bash
# Activate virtual environment
.\.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac

# Create .env file with:
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/burner

# Run migrations
alembic upgrade head

# Start the server
uvicorn backend.app.main:app --reload
```

### Extension Setup (Firefox)

1. Open Firefox
2. Go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Navigate to `browser_extension/manifest.json`
5. Extension icon appears in toolbar

**Note:** Temporary add-on is removed when Firefox closes. Reload on restart.

### Extension Setup (Chrome)

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `browser_extension/` directory

## Development Conventions

### Code Style

- **Type hints**: Used throughout (SQLAlchemy `Mapped[]`, Pydantic `Annotated[]`)
- **Async/await**: All DB operations use async SQLAlchemy
- **Dependency injection**: FastAPI `Depends()` for DB sessions
- **Validation**: Pydantic v2 style with `@field_validator` and `@model_validator`

### Key Patterns

1. **Timezone handling**: Server accepts UTC timestamps + IANA timezone, performs all bucketing/conversions server-side
2. **Session splitting**: Sessions spanning multiple local dates are split into daily buckets (`time_splitting.py`)
3. **Upsert pattern**: `INSERT ... ON CONFLICT DO UPDATE` for incrementing daily totals
4. **Storage**: Extension uses `browser.storage.local` for session persistence

### Important Implementation Details

- `total` in POST payload = `sessions.length` (count, not sum of seconds)
- GET `/stats` requires both `period` and `timezone` query parameters
- Timezone validation via `zoneinfo.ZoneInfo`
- Sessions with `end <= start` are rejected
- Extension normalizes hostnames: lowercase, strip `www.` prefix
- Inactivity timeout: 60 seconds (extension closes session)

## Extension Architecture

### Components

| Component | Purpose |
|-----------|---------|
| `background.js` | Orchestrates tracking, session lifecycle, storage, sync |
| `content-script.js` | Injected into pages, detects user activity |
| `popup.html/js/css` | UI displaying statistics |
| `lib/storage.js` | Abstraction over `browser.storage.local` |
| `lib/browser-api.js` | Cross-browser wrapper (`browser` vs `chrome`) |
| `lib/utils.js` | Utilities (hostname normalization, UUID generation) |

### Session Lifecycle

1. **Start**: Window focused + active tab + activity ping + no existing session
2. **Continue**: Activity pings reset 60s inactivity timer
3. **Close**: Tab change, window blur, inactivity (60s), tab closed, visibility hidden

### Storage Layout

- `sessions`: Object mapping `id` → session object `{id, host, start, end, synced}`
- `meta`: `{ timezone, lastSyncAt, ... }`
- Retention: 30 days for synced sessions

## Files to Reference When Working

| Task | Files to Read |
|------|---------------|
| Add new endpoint | `routers/time.py`, `schemas.py` |
| Modify data model | `models/*.py`, `schemas.py` |
| Change timezone logic | `time_splitting.py` |
| Update config | `config.py`, `.env` |
| Add migration | `migrations/versions/` |
| Extension tracking logic | `background/background.js` |
| Extension storage | `lib/storage.js` |
| Extension UI | `popup/popup.html`, `popup/popup.js` |

## Testing

No test framework detected yet. When tests are added, expected commands:
```bash
pytest
# or
python -m pytest
```

## Design Documentation

See `docs/burner_design_doc.md` for complete extension specification including:
- UX requirements
- API contracts
- Timezone handling details
- Cross-browser considerations
- Testing guidelines
