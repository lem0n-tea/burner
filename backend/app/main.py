from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware

from .routers import flush


app = FastAPI(
    title="Burner - Time Tracker",
    description="App designed to discourage you from wasting time online",
    version="1.0",
    openapi_tags=[
        {
            "name": "flush",
            "description": "Endpoints for flushing time sessions. Used by frontend to send recorded data"
        },
        {
            "name": "pull",
            "description": "Endpoints for pulling aggregated user data. Used by frontend to request user statistics"
        }
    ]
)

origins = [
    '*',
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(flush.router)

@app.get("/", status_code=status.HTTP_200_OK)
async def health_check() -> dict:
    return {
        "message": "Burner - Time Tracker API",
        "status": "ok"
    }