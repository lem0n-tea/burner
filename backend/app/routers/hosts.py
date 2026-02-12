from fastapi import APIRouter, HTTPException, status

from app.schemas import Host as HostSchema, HostCreate


router = APIRouter(
    prefix="/hosts",
    tags=["hosts"]
)

@router.get("/", status_code=status.HTTP_200_OK)
async def get_all_hosts():
    """
    Returns a list of all hosts in database
    """
    return {"message": "Lists all known hosts"}

@router.get("/{host_id}", status_code=status.HTTP_200_OK)
async def get_host(host_id: int):
    """
    Returns a host with a specified ID from database
    """
    return {"message": "Returns host with ID = " + host_id}

@router.post("/", status_code=status.HTTP_201_CREATED)
async def add_host():
    """
    Adds a new host to the database
    """
    return {"message": "Adds a new host to the database"}

@router.put("/{host_id}", status_code=status.HTTP_200_OK)
async def update_host(host_id: int):
    """
    Updates host data in the database
    """
    return {"message": "Updates host with ID = " + host_id}

@router.delete("/{host_id}", status_code=status.HTTP_200_OK)
async def delete_host(host_id: int):
    """
    Deletes host from the database
    """
    return {"message": "Host deleted with ID = " + host_id}