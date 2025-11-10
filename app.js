# app.py (only the NEW/CHANGED parts)
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from plan import generate_weekly_plan
import asyncio

from oura_client import daily_scheduler, refresh_today, get_latest

app = FastAPI(title="RunStrengthPlanner API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # optionally restrict to your static site URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

stop_event = asyncio.Event()

@app.on_event("startup")
async def _startup():
    asyncio.create_task(daily_scheduler(stop_event))

@app.on_event("shutdown")
async def _shutdown():
    stop_event.set()

@app.get("/health")
def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}

# --- Oura manual refresh (optional) ---
@app.post("/v1/oura/refresh_daily")
async def oura_refresh_daily():
    data = await refresh_today()
    return {"refreshed": True, "data": data}

# --- Dashboard endpoint ---
@app.get("/v1/dashboard")
def dashboard(user_id: str = "adamrusso1008"):
    """Return latest Oura metrics + an on-demand weekly plan so UI can render cards."""
    latest = get_latest() or {}
    user = {
        "id": user_id,
        "baseline_rhr": 60,
        "zones": {"z1": "<114", "z2": "114-132", "z3": "133-151", "z4": "152-170", "z5": "171+"},
    }
    # light synthetic inputs; your uploaded workouts will be used in prod
    workouts = [
        {"type": "run", "start_time": datetime.utcnow().isoformat(), "duration_min": 30, "time_in_zones": {"z2": 20}},
        {"type": "strength", "start_time": datetime.utcnow().isoformat(), "duration_min": 45},
    ]
    oura = {
        "readiness_score": latest.get("readiness_score", 75),
        "sleep_hours": latest.get("sleep_hours", 7.0),
        "rhr": latest.get("rhr", 60),
    }
    plan = generate_weekly_plan(user, workouts, oura)
    return {"latest_oura": latest, "plan": plan}
