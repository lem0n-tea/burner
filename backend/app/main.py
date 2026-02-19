from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware

from .routers import time


app = FastAPI(
    title="Burner - Time Tracker",
    description="App designed to discourage you from wasting time online",
    version="0.1",
    openapi_tags=[
        {
            "name": "time",
            "description": "Endpoints for managing time data (flushing sessions, pulling statistics)."
        },
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

app.include_router(time.router)

@app.get("/", status_code=status.HTTP_200_OK)
async def health_check() -> dict:
    return {
        "message": "Burner - Time Tracker API",
        "status": "ok"
    }