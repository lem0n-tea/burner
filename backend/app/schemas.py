from pydantic import BaseModel, Field, ConfigDict
from typing import Annotated


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

class GroupCreate(BaseModel):
    """
    Group model for POST and PUT requests
    """
    name: Annotated[
        str,
        Field(..., min_length=1, max_length=50,
              description="Name of a group")
    ]

class Group(BaseModel):
    """
    Group is a customizable collection of hosts
    Model for GET requests
    """
    id: Annotated[
        int,
        Field(..., description="Group ID")
    ]
    hosts: Annotated[
        list[Host],
        Field(default_factory=list, description="Collection of hosts")
    ]