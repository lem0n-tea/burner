from fastapi import FastAPI, HTTPException, status

from .routers import hosts, groups


app = FastAPI(
    title="Burner - Time Tracker",
    description="App designed to discourage you from wasting time online",
    version="1.0",
)

app.include_router(hosts.router)
#app.include_router(groups.router)

@app.get("/", status_code=status.HTTP_200_OK)
async def health_check() -> dict:
    return {
        "message": "Burner - Time Tracker API",
        "status": "ok"
    }