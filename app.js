# app.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, date
from typing import Optional
from plan import generate_weekly_plan
from oura_client import fetch_daily, fetch_range, OuraError

app = FastAPI(title="RunStrengthPlanner API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later to your static site origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# in-memory cache (simple; swap with a DB later)
CACHE = {"oura_today": None, "oura_last_sync": None}

@app.get("/health")
def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}

# ---- Oura: daily fetch + range + manual refresh
@app.get("/v1/oura/daily")
def get_oura_daily(date_str: Optional[str] = None):
    """Returns Oura data for a date (default today). Reads cache for today."""
    target = date_str or date.today().isoformat()
    if target == date.today().isoformat() and CACHE["oura_today"]:
        return {"source": "cache", **CACHE["oura_today"]}
    data = fetch_daily(target)
    if target == date.today().isoformat():
        CACHE["oura_today"] = data
        CACHE["oura_last_sync"] = datetime.utcnow().isoformat()
    return {"source": "live", **data}

@app.get("/v1/oura/range")
def get_oura_range(days: int = 7):
    return {"days": days, "data": fetch_range(days)}

@app.post("/v1/oura/refresh")
def manual_refresh():
    data = fetch_daily()
    CACHE["oura_today"] = data
    CACHE["oura_last_sync"] = datetime.utcnow().isoformat()
    return {"status": "ok", "refreshed": CACHE["oura_last_sync"], "data": data}

# ---- Existing endpoints you already had (kept here)
@app.get("/v1/integrations/oura/test")
def oura_test():
    return {"ok": True, "ts": datetime.utcnow().isoformat()}

@app.post("/v1/integrations/oura/webhook")
async def oura_webhook(request: Request):
    body = await request.json()
    return {"status": "received", "items": 1 if isinstance(body, dict) else len(body)}

@app.post("/v1/users/{user_id}/workouts")
async def upload_workout(user_id: str, request: Request):
    body = await request.json()
    return {"user_id": user_id, "received": True, "workout": body}

@app.get("/v1/generate_weekly_plan")
def generate_plan(user_id: str = "adamrusso1008"):
    user = {
        "id": user_id,
        "baseline_rhr": 60,
        "zones": {"z1": "<114", "z2": "114-132", "z3": "133-151", "z4": "152-170", "z5": "171+"}
    }
    workouts = [
        {"type": "run", "start_time": datetime.utcnow().isoformat(), "duration_min": 30, "time_in_zones": {"z2": 20}},
        {"type": "strength", "start_time": datetime.utcnow().isoformat(), "duration_min": 45},
    ]
    oura = CACHE["oura_today"] or {"readiness_score": 75, "sleep_hours": 7.0, "rhr": 58}
    return generate_weekly_plan(user, workouts, oura)
