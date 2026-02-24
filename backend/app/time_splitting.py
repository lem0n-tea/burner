from datetime import datetime, timedelta, date, timezone
from zoneinfo import ZoneInfo
import zoneinfo
from enum import Enum


class PeriodType(Enum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"

'''def local_midnight(dt: datetime, tz: str) -> datetime:
    dt_local = dt.astimezone(ZoneInfo(tz))
    return datetime(
        dt_local.year, dt_local.month, dt_local.day, tzinfo=ZoneInfo(tz)
    )

def next_local_day(dt: datetime, tz: str) -> datetime:
    return local_midnight(dt, tz) + timedelta(days=1)

def day_start(timestamp: datetime) -> date:
    return timestamp.date()

def next_day_boundary(timestamp: datetime) -> datetime:
    return datetime.combine(
        timestamp.date() + timedelta(days=1),
        datetime.min.time(),
        timestamp.tzinfo
    )

def week_start(timestamp: datetime) -> date:
    return timestamp.date() - timedelta(days=timestamp.weekday())

def next_week_boundary(timestamp: datetime) -> datetime:
    start = week_start(timestamp)
    return datetime.combine(
        start + timedelta(days=7),
        datetime.min.time(),
        timestamp.tzinfo
    )

def month_start(timestamp: datetime) -> date:
    return timestamp.date().replace(day=1)

def next_month_boundary(timestamp: datetime) -> datetime:
    if timestamp.month == 12:
        new_date = timestamp.date().replace(
            year=timestamp.year + 1,
            month=1,
            day=1
        )
    else:
        new_date = timestamp.date().replace(
            month=timestamp.month + 1,
            day=1
        )

    return datetime.combine(
        new_date,
        datetime.min.time(),
        timestamp.tzinfo
    )'''

def split_into_daily_buckets(
    start_utc: datetime,
    end_utc: datetime,
    user_tz: str
) -> list[tuple[date, int]]:
    """
    Split a UTC session into local calendar days.
    Returns: [(local_date, duration_seconds)]
    """

    # Return empty list in case of invalid timestamps
    if end_utc <= start_utc:
        return []
    
    tz = ZoneInfo(user_tz)
    buckets = []

    current_utc = start_utc

    while current_utc < end_utc:
        # Convert to local moment and compute next midnight for it
        current_local = current_utc.astimezone(tz)
        next_midnight_local = current_local.replace(
            hour=0, minute=0, second=0, microsecond=0
        ) + timedelta(days=1)

        # Compute UTC time for next midnight
        next_midnight_utc = next_midnight_local.astimezone(ZoneInfo("UTC"))

        segment_end_utc = min(next_midnight_utc, end_utc)

        duration = int((segment_end_utc - current_utc).total_seconds())

        buckets.append((current_local.date(), duration))
        current_utc = segment_end_utc
        
    return buckets