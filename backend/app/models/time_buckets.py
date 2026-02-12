import enum, datetime
from sqlalchemy import Integer, ForeignKey, DateTime, Date, Enum, BigInteger, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PeriodType(enum.Enum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class TimeBucket(Base):
    __tablename__ = "time_buckets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_id: Mapped[int] = mapped_column(Integer, ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False)
    period_type: Mapped[PeriodType] = mapped_column(Enum(PeriodType, name="period_type"), nullable=False)
    period_start: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False,
                                                          server_default=func.now())
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False,
                                                          server_default=func.now(), server_onupdate=func.now())
    
    host: Mapped["Host"] = relationship("Host", back_populates="time_buckets") # type: ignore

    __table_args__ = (
        UniqueConstraint(
            "host_id",
            "period_type",
            "period_start",
            name="uq_timebucket_host_period"
        )
    )
