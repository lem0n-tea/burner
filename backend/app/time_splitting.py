from datetime import datetime, timedelta, date, timezone
from zoneinfo import ZoneInfo
import zoneinfo
from enum import Enum


class PeriodType(Enum):
    WEEK = "week"
    MONTH = "month"

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