from datetime import datetime, timedelta, date
from enum import Enum


class PeriodType(Enum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


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
    )

def split_into_buckets(
        start: datetime,
        end: datetime
) -> list[tuple[PeriodType, date, int]]:
    """
    Return tuples (period_type, period_start, duration_seconds)
    that provide new duration for necessary buckets.
    period_type and period_start define a bucket
    duration_seconds defines new additive
    """
    parts = []

    def split_for_period(period_type, get_start_func, get_next_func):
        current = start
        while current < end:
            boundary = get_next_func(current)
            segment_end = min(boundary, end)
            duration = int((segment_end - current).total_seconds())

            parts.append(
                (period_type, get_start_func(current), duration)
            )

            current = segment_end

    split_for_period(PeriodType.DAY, day_start, next_day_boundary)
    split_for_period(PeriodType.WEEK, week_start, next_week_boundary)
    split_for_period(PeriodType.MONTH, month_start, next_month_boundary)

    return parts