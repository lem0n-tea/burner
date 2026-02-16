from fastapi import APIRouter, status, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import timezone

from app.schemas import SessionList
from app.models.hosts import Host as HostModel
from app.db_depends import get_async_db
from app.time_splitting import split_into_buckets


router = APIRouter(
    prefix="/flush",
    tags=["flush"]
)

@router.post("/time", status_code=status.HTTP_201_CREATED)
async def flush_data(
    payload: SessionList,
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    accepted = 0

    for session in payload.sessions:
        
        # ADD DE-DUPLICATION WITH UUID

        # Convert to UTC
        start_utc = session.start.astimezone(timezone.utc)
        end_utc = session.start.astimezone(timezone.utc)

        # Calculate session duration
        duration = int((end_utc - start_utc).total_seconds())
        if duration <= 0:
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

        # Split into buckets
        bucket_updates = split_into_buckets(start_utc, end_utc)

        # Update or create new buckets
        for period_type, period_start, duration_seconds in bucket_updates:
            pass

    await db.commit()

    return {
        "message": "Data has been stored",
        "success_rate": f"{accepted} / {payload.total}"
    }