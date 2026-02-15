from fastapi import APIRouter, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import SessionList
from app.models.hosts import Host as HostModel


router = APIRouter(
    prefix="/flush",
    tags=["flush"]
)

@router.post("/time", status_code=status.HTTP_201_CREATED)
async def flush_data(
    payload: SessionList,
    db: bool # AsyncSession later
) -> dict:
    for session in payload.sessions:
        duration = int((session.end - session.start).total_seconds())
        if duration <= 0:
            continue

    return {"message": "Recorded time data has been successfully stored"}