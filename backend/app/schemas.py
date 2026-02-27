from pydantic import BaseModel, Field, ConfigDict, field_validator, ValidationInfo, model_validator
from typing import Annotated, Literal
from datetime import datetime
from uuid import UUID

from app.time_splitting import PeriodType

class Session(BaseModel):
    """
    Session represents a continuous period of active
    user interaction with a specific host
    """
    id: Annotated[
        UUID,
        Field(..., description="Session ID to avoid duplicates")
    ]
    host: Annotated[
        str,
        Field(..., min_length=1, max_length=256,
              description="Normalized hostname")
    ]
    start: Annotated[
        datetime,
        Field(..., description="Start UTC timestamp of the session")
    ]
    end: Annotated[
        datetime,
        Field(..., description="End UTC timestamp of the session")
    ]

    @field_validator("end")
    @classmethod
    def validate_end_timestamp(cls, value, info: ValidationInfo):
        start = info.data.get("start")
        if value < start:
            raise ValueError("end timestamp must be after start timestamp")
        return value

class SessionList(BaseModel):
    """
    Schema is used for submitting recorded data by frontend
    """
    total: Annotated[
        int,
        Field(..., ge=0, description="Total number of submitted sessions")
    ]
    timezone: Annotated[
        str,
        Field(..., min_length=1, max_length=64, description="Name of local IANA timezone")
    ]
    sessions: Annotated[
        list[Session],
        Field(default_factory=list, description="List of recorded sessions")
    ]

class DailyStatistics(BaseModel):
    """
    Model that represents daily time records
    Daily time buckets aggregated for one date accross all hosts
    """
    date: Annotated[
        str,
        Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", 
              description="ISO formatted string representing date")
    ]
    seconds: Annotated[
        int,
        Field(..., ge=0, description="Total number of seconds recorded that date")
    ]

class VisualizationBase(BaseModel):
    """
    Model to collect data for visualization purposes
    """
    days: Annotated[
        int,
        Field(..., ge=0, description="Number of days for graph")
    ]
    records: Annotated[
        list[DailyStatistics],
        Field(default_factory=list, description="Records from chosen period")
    ]

    @model_validator(mode="after")
    def check_records_length(self):
        if len(self.records) != self.days:
            raise ValueError("records length must be equal to days")
        return self
    
    model_config = ConfigDict(extra='forbid')


class Graph(VisualizationBase):
    """
    Model to collect data for graph build
    """
    days: Annotated[
        Literal[7, 30],
        Field(..., description="Number of days for graph (7 or 30)")
    ]
    
class Heatmap(VisualizationBase):
    """
    Model to collect data for heatmap build
    """
    days: Annotated[
        Literal[30, 365],
        Field(..., description="Number of days for heatmap (30 or 365)")
    ]

class Host(BaseModel):
    """
    Model that represents web host data with aggregated
    time spent for a specific period
    """
    id: Annotated[
        int,
        Field(..., ge=1, description="Host ID")
    ]
    hostname: Annotated[
        str,
        Field(..., min_length=1, description="Normalized hostname")
    ]
    seconds: Annotated[
        int,
        Field(..., ge=0, description="Seconds spent on host")
    ]

class TopHosts(BaseModel):
    """
    Model that represents most popular hosts (most time spent)
    """
    total: Annotated[
        int,
        Field(..., ge=0, description="Number of top hosts selected")
    ]
    hosts: Annotated[
        list[Host],
        Field(default_factory=list, description="List of hosts")
    ]

    @model_validator(mode="after")
    def check_records_length(self):
        if len(self.hosts) != self.total:
            raise ValueError("records length must be equal to days")
        return self

class Statistics(BaseModel):
    """
    Model used to pull user statistics to display in GUI
    """
    period: Annotated[
        PeriodType,
        Field(..., description="Chosen period of statistics")
    ]
    range_start: Annotated[
        str,
        Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", 
              description="ISO formated first date in stats window")
    ]
    range_end: Annotated[
        str,
        Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", 
              description="ISO formated last date in stats window")
    ]
    today_total: Annotated[
        int,
        Field(..., ge=0, description="Total seconds for local current date")
    ]
    period_total: Annotated[
        int,
        Field(..., ge=0, description="Total seconds for chosen period")
    ]
    graph: Annotated[
        Graph,
        Field(..., description="Records for graph building")
    ]
    heatmap: Annotated[
        Heatmap,
        Field(..., description="Records for heatmap building")
    ]
    top_hosts: Annotated[
        TopHosts,
        Field(..., description="Top hosts by time spent")
    ]