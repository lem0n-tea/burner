from pydantic import BaseModel, Field, ConfigDict, field_validator, ValidationInfo
from typing import Annotated
from datetime import datetime
from uuid import UUID


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

class HostCreate(BaseModel):
    """
    Host model for POST and PUT requests
    """
    hostname: Annotated[
        str,
        Field(..., min_length=1, max_length=256,
              description="Normalized hostname")
    ]

class Host(BaseModel):
    """
    Host represents web hosts data
    Model for GET requests
    """
    id: Annotated[
        int,
        Field(..., description="Host ID")
    ]
    hostname: Annotated[
        str,
        Field(..., description="Normalized hostname")
    ]
    is_active: Annotated[
        bool,
        Field(..., description="If flag is False, host is soft-deleted")
    ]

    model_config = ConfigDict(from_attributes=True)