from sqlalchemy import Integer, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Host(Base):
    __tablename__ = "hosts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(256), unique=True, nullable=False)

    daily_time_buckets: Mapped[list["DailyTimeBucket"]] = relationship("DailyTimeBucket", # type: ignore
                                                            back_populates="host", cascade="all, delete-orphan")