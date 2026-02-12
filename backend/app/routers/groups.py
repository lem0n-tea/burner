from fastapi import APIRouter, HTTPException, status

from app.schemas import Group as GroupSchema, GroupCreate


router = APIRouter(
    prefix="/groups",
    tags=["groups"]
)

@router.get("/", status_code=status.HTTP_200_OK)
async def get_all_groups():
    """
    Returns a list of all groups in database
    """
    return {"message": "Lists all known groups"}

@router.get("/{group_id}", status_code=status.HTTP_200_OK)
async def get_group(group_id: int):
    """
    Returns a group with a specified ID from database
    """
    return {"message": "Returns group with ID = " + group_id}

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_group():
    """
    Creates a new group to the database
    """
    return {"message": "Adds a new group to the database"}

@router.put("/{group_id}", status_code=status.HTTP_200_OK)
async def update_group(group_id: int):
    """
    Updates group data in the database
    """
    return {"message": "Updates host with ID = " + group_id}

@router.delete("/{group_id}", status_code=status.HTTP_200_OK)
async def delete_group(group_id: int):
    """
    Deletes group from the database
    """
    return {"message": "Group deleted with ID = " + group_id}