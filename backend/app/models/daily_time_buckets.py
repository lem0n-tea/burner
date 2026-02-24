import datetime
from sqlalchemy import Integer, ForeignKey, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DailyTimeBucket(Base):
    __tablename__ = "daily_time_buckets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_id: Mapped[int] = mapped_column(Integer, ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False)

    date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    host: Mapped["Host"] = relationship("Host", back_populates="daily_time_buckets") # type: ignore

    __table_args__ = (
        UniqueConstraint(
            "host_id",
            "date",
            name="uq_dailytimebucket_local"
        ),
    )
