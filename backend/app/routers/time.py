from fastapi import APIRouter, status, Depends, Query, HTTPException
from sqlalchemy import select, delete, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.schemas import SessionList, Statistics, DailyStatistics, Graph, Heatmap, TopHosts, Host
from app.models.hosts import Host as HostModel
from app.models.daily_time_buckets import DailyTimeBucket as DailyTimeBucketModel
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

def validate_timezone(tz) -> None:
    try:
        ZoneInfo(tz)
    except ZoneInfoNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid timezone"
        )
    
async def build_date_totals_collection(
    db: AsyncSession,
    range_length: int,
    start: date,
    end: date
) -> list[DailyStatistics]:
    """
    Builds a list of all dates within a range
    with total seconds for each
    """
    # Build date window
    window_dates = [start + timedelta(days=i) for i in range(range_length)]
    
    # Query for time buckets grouped by date within range
    stmt = (
        select(
            DailyTimeBucketModel.date,
            func.sum(DailyTimeBucketModel.duration_seconds)
        )
        .where(DailyTimeBucketModel.date.between(start, end))
        .group_by(DailyTimeBucketModel.date)
        .order_by(DailyTimeBucketModel.date)
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Convert to dict
    daily_totals_db = {row[0]: row[1] for row in rows}

    # Fill in missing dates with 0 seconds
    daily_records = []
    for date in window_dates:
        seconds = daily_totals_db.get(date, 0)

        daily_records.append(
            DailyStatistics(
                date=date.isoformat(),
                seconds=seconds
            )
        )
    
    return daily_records

@router.post("/flush", status_code=status.HTTP_201_CREATED)
async def flush_recorded_sessions(
    payload: SessionList,
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    
    # Validate user timezone
    user_timezone = payload.timezone
    validate_timezone(user_timezone)
    
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

@router.get("/stats", response_model=Statistics, status_code=status.HTTP_200_OK)
async def get_time_statistics(
    period: PeriodType = Query(..., description="Period type (week/month)"),
    timezone: str = Query(..., description="IANA name for user timezone"),
    db: AsyncSession = Depends(get_async_db)
):
    # Validate user timezone
    validate_timezone(timezone)

    # Compute current local date
    today_local = datetime.now(ZoneInfo(timezone)).date()

    # Compute stats range
    days = 7 if period == PeriodType.WEEK else 30

    range_start = today_local - timedelta(days=days - 1)
    range_end = today_local

    daily_records_period = await build_date_totals_collection(
        db, days, range_start, range_end
    )

    # Compute totals
    today_total = daily_records_period[-1].seconds
    period_total = sum(record.seconds for record in daily_records_period)

    # Prepare graph data
    graph_data = Graph(
        days=days,
        records=daily_records_period
    )

    # Prepare heatmap data
    heatmap_days = 30 if period == PeriodType.WEEK else 365

    heatmap_start = today_local - timedelta(days=heatmap_days - 1)
    heatmap_end = today_local
    
    daily_records_heatmap = await build_date_totals_collection(
        db, heatmap_days, heatmap_start, heatmap_end
    )

    heatmap_data = Heatmap(
        days=heatmap_days,
        records=daily_records_heatmap
    )

    # Select top hosts by time spent within stats range
    stmt = (
        select(
            HostModel.id,
            HostModel.name,
            func.sum(DailyTimeBucketModel.duration_seconds)
        )
        .join(DailyTimeBucketModel)
        .where(DailyTimeBucketModel.date.between(range_start, range_end))
        .group_by(HostModel.id)
        .order_by(func.sum(DailyTimeBucketModel.duration_seconds).desc())
        .limit(5)
    )
    result = await db.execute(stmt)
    hosts = result.all()

    # Prepare top hosts data
    top_hosts = TopHosts(
        total=len(hosts),
        hosts=[
            Host(id=host_id, hostname=hostname, seconds=total_seconds)
            for host_id, hostname, total_seconds in hosts
        ]
    )

    # Build complete response model
    stats = Statistics(
        period=period,
        range_start=range_start.isoformat(),
        range_end=range_end.isoformat(),
        today_total=today_total,
        period_total=period_total,
        graph=graph_data,
        heatmap=heatmap_data,
        top_hosts=top_hosts
    )

    return stats

@router.delete("/all", status_code=status.HTTP_200_OK)
async def wipe_all_time(
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    await db.execute(delete(DailyTimeBucketModel))
    await db.commit()

    return {"message": "All time buckets deleted"}