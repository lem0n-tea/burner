from fastapi import APIRouter, status, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import timezone, date

from app.schemas import SessionList
from app.models.hosts import Host as HostModel
from app.models.time_buckets import TimeBucket as TimeBucketModel
from app.db_depends import get_async_db
from app.time_splitting import split_into_buckets, PeriodType


router = APIRouter(
    prefix="/flush",
    tags=["flush"]
)

async def upsert_time_buckets(
    db: AsyncSession,
    host_id: int,
    period_type: PeriodType,
    period_start: date,
    duration_seconds: int
) -> None:
    """
    Creates new time bucket. If exists, increments duration
    """
    stmt = insert(TimeBucketModel).values(
        host_id=host_id,
        period_type=period_type,
        period_start=period_start,
        duration_seconds=duration_seconds
    )

    upsert_stmt = stmt.on_conflict_do_update(
        index_elements=[
            TimeBucketModel.host_id,
            TimeBucketModel.period_type,
            TimeBucketModel.period_start,
        ],
        set_={
            "duration_seconds": TimeBucketModel.duration_seconds + duration_seconds
        }
    )

    await db.execute(upsert_stmt)

@router.post("/time", status_code=status.HTTP_201_CREATED)
async def flush_data(
    payload: SessionList,
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    accepted = 0
    rejected_sessions = []
    processed_sessions = []

    for session in payload.sessions:
        
        # REMAKE DE-DUPLICATION TO WORK ACROSS MULTIPLE REQUESTS
        if session.id in processed_sessions:
            rejected_sessions.append(session.id)
            continue

        # Convert to UTC
        start_utc = session.start.astimezone(timezone.utc)
        end_utc = session.end.astimezone(timezone.utc)

        # Calculate session duration
        duration = int((end_utc - start_utc).total_seconds())
        if duration <= 0:
            rejected_sessions.append(session.id)
            continue

        # Check if host exists in database. If not, create
        host = await db.scalar(
            select(HostModel).where(
                HostModel.name == session.host,
                HostModel.is_active == True
            )
        )
        if host is None:
            db_host = HostModel(name=session.host)
            db.add(db_host)
            await db.flush()
        else:
            db_host = host

        # Split into buckets
        bucket_updates = split_into_buckets(start_utc, end_utc)

        # Update or create new buckets
        for period_type, period_start, duration_seconds in bucket_updates:
            await upsert_time_buckets(
                db=db,
                host_id=db_host.id,
                period_type=period_type,
                period_start=period_start,
                duration_seconds=duration_seconds
            )
            
        accepted += 1
        processed_sessions.append(session.id)

    await db.commit()

    return {
        "message": "Data has been stored",
        "received": {payload.total},
        "accepted": {accepted},
        "success_rate": f"{accepted} / {payload.total}",
        "rejected_session_ids": rejected_sessions
    }

@router.post("/time/mock", status_code=status.HTTP_201_CREATED)
async def mock_flush_data_request(
    payload: SessionList
):
    return payload