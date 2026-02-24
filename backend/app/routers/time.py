from fastapi import APIRouter, status, Depends, Query, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.schemas import SessionList
from app.models.hosts import Host as HostModel
from backend.app.models.daily_time_buckets import DailyTimeBucket as DailyTimeBucketModel
from app.db_depends import get_async_db
from app.time_splitting import split_into_daily_buckets, PeriodType


router = APIRouter(
    prefix="/time",
    tags=["time"]
)

async def upsert_time_buckets(
    db: AsyncSession,
    host_id: int,
    date: date,
    duration_seconds: int
) -> None:
    """
    Creates new time bucket. If exists, increments duration
    """
    stmt = insert(DailyTimeBucketModel).values(
        host_id=host_id,
        date=date,
        duration_seconds=duration_seconds
    )

    upsert_stmt = stmt.on_conflict_do_update(
        index_elements=[
            DailyTimeBucketModel.host_id,
            DailyTimeBucketModel.date,
        ],
        set_={
            "duration_seconds": DailyTimeBucketModel.duration_seconds + duration_seconds
        }
    )

    await db.execute(upsert_stmt)  

@router.post("/flush", status_code=status.HTTP_201_CREATED)
async def flush_recorded_sessions(
    payload: SessionList,
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    
    # Validate user timezone
    user_timezone = payload.timezone
    try:
        ZoneInfo(user_timezone)
    except ZoneInfoNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid timezone"
        )
    
    accepted = 0
    rejected_session_ids = []
    processed_session_ids = []

    for session in payload.sessions:
        
        # REMAKE DE-DUPLICATION TO WORK ACROSS MULTIPLE REQUESTS
        if session.id in processed_session_ids:
            rejected_session_ids.append(session.id)
            continue

        # Reject session if timestamps invalid
        if session.end <= session.start:
            rejected_session_ids.append(session.id)
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
        bucket_updates = split_into_daily_buckets(
            session.start, session.end, user_timezone
        )

        # Update or create new buckets
        for local_date, seconds in bucket_updates:
            if seconds <= 0:
                continue

            await upsert_time_buckets(
                db=db,
                host_id=db_host.id,
                date=local_date,
                duration_seconds=seconds
            )
            
        accepted += 1
        processed_session_ids.append(session.id)

    await db.commit()

    return {
        "message": "Data has been stored",
        "received": payload.total,
        "accepted": accepted,
        "success_rate": f"{accepted} / {payload.total}",
        "rejected_session_ids": rejected_session_ids
    }

@router.post("/flush/mock", status_code=status.HTTP_201_CREATED)
async def mock_flush_data_request(
    payload: SessionList
):
    return payload

@router.get("/stats", status_code=status.HTTP_200_OK)
async def get_time_statistics(
    period: PeriodType = Query(..., description="Period type (week/month)"),
    timezone: int = Query(..., ge=-12, le=14, description="User's UTC offset"),
    db: AsyncSession = Depends(get_async_db)
):
    pass


@router.delete("/all", status_code=status.HTTP_200_OK)
async def wipe_all_time(
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    await db.execute(delete(DailyTimeBucketModel))
    await db.commit()

    return {"message": "All time buckets deleted"}