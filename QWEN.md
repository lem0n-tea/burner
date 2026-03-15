# Burner - Project Context

## Project Overview

**Burner** is a time-tracking application designed to help users monitor their web browsing habits. It consists of:

1. **Backend API** (FastAPI/Python) - Server-side component that receives, stores, and aggregates browsing session data
2. **Browser Extension** (planned) - Cross-browser extension (Chrome/Firefox) that tracks active time spent on websites and syncs with the backend

The backend uses **PostgreSQL** for data storage with daily time buckets aggregated by hostname. The extension (not yet implemented in this repo) will track user activity and POST sessions to the API.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend Framework | FastAPI (Python) |
| Database | PostgreSQL (async) |
| ORM | SQLAlchemy (async) |
| Validation | Pydantic |
| Migrations | Alembic (inferred from structure) |

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
│       │   ├── time.py    # Main API endpoints (/time/*)
│       │   ├── hosts.py   # Host management (if exists)
│       │   └── groups.py  # Group management (if exists)
│       └── migrations/    # Alembic migrations
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

- **hosts**: `id`, `name` (unique)
- **daily_time_buckets**: `id`, `host_id` (FK), `date`, `duration_seconds`
  - Unique constraint on `(host_id, date)`

## Building and Running

### Prerequisites

- Python 3.9+ (for `zoneinfo` module)
- PostgreSQL database
- Virtual environment (`.venv/` already exists)

### Setup

```bash
# Activate virtual environment
.\.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac

# Install dependencies (if requirements.txt exists)
pip install -r requirements.txt

# Set environment variables
# Create .env file with:
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/burner

# Run migrations (if Alembic configured)
alembic upgrade head

# Start the server
uvicorn backend.app.main:app --reload
```

### Testing

No test framework detected yet. When tests are added, expected commands:
```bash
pytest
# or
python -m pytest
```

## Development Conventions

### Code Style

- **Type hints**: Used throughout (SQLAlchemy `Mapped[]`, Pydantic `Annotated[]`)
- **Async/await**: All DB operations use async SQLAlchemy
- **Dependency injection**: FastAPI `Depends()` for DB sessions
- **Validation**: Pydantic models with field validators and model validators

### Key Patterns

1. **Timezone handling**: Server accepts UTC timestamps + IANA timezone, performs all bucketing/conversions server-side
2. **Session splitting**: Sessions spanning multiple local dates are split into daily buckets (`time_splitting.py`)
3. **Upsert pattern**: `INSERT ... ON CONFLICT DO UPDATE` for incrementing daily totals
4. **Schema validation**: Pydantic v2 style with `@field_validator` and `@model_validator`

### Important Implementation Details

- `total` in POST payload = `sessions.length` (count, not sum of seconds)
- GET `/stats` requires both `period` and `timezone` query parameters
- Timezone validation via `zoneinfo.ZoneInfo`
- Sessions with `end <= start` are rejected

## Extension Design (Future)

The browser extension will:
- Track active tab hostname and user activity (mouse/keyboard events)
- Store sessions in `browser.storage.local`
- Periodically POST closed sessions to `/time/flush`
- Display statistics from `/time/stats` in popup UI
- Support Chrome and Firefox via WebExtensions API

See `docs/burner_design_doc.md` for complete extension specification.

## Files to Reference When Working

| Task | Files to Read |
|------|---------------|
| Add new endpoint | `routers/time.py`, `schemas.py` |
| Modify data model | `models/*.py`, `schemas.py` |
| Change timezone logic | `time_splitting.py` |
| Update config | `config.py`, `.env` |
| Add migration | `migrations/versions/` |
