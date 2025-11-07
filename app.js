from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from plan import generate_weekly_plan

app = FastAPI(
    title="RunStrengthPlanner API",
    version="0.1.0"
)

# --- CORS Setup ---
origins = [
    "*",  # You can restrict this later to your frontend Render URL
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Health Check ---
@app.get("/health")
def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}


# --- Oura Integration Test ---
@app.get("/v1/integrations/oura/test")
def oura_test():
    return {
        "oura_status": "connected",
        "timestamp": datetime.utcnow().isoformat(),
        "sample_readiness": 76,
        "sample_sleep_hours": 7.2,
        "sample_rhr": 52,
    }


# --- Oura Webhook ---
@app.post("/v1/integrations/oura/webhook")
async def oura_webhook(request: Request):
    data = await request.json()
    print("Oura webhook received:", data)
    return {"status": "received", "items": len(data) if isinstance(data, list) else 1}


# --- Upload Workout ---
@app.post("/v1/users/{user_id}/workouts")
async def upload_workout(user_id: str, request: Request):
    data = await request.json()
    print(f"Workout uploaded for {user_id}:", data)
    return {"user_id": user_id, "received": True, "workout": data}


# --- Generate Weekly Plan ---
@app.get("/v1/generate_weekly_plan")
def generate_plan(user_id: str = "default"):
    user = {
        "id": user_id,
        "baseline_rhr": 60,
        "zones": {"z1": "<114", "z2": "114-132", "z3": "133-151", "z4": "152-170", "z5": "171+"}
    }

    # Mock data for testing
    workouts = [
        {"type": "run", "start_time": datetime.utcnow().isoformat(), "duration_min": 30, "time_in_zones": {"z2": 20}},
        {"type": "strength", "start_time": datetime.utcnow().isoformat(), "duration_min": 45},
    ]

    oura_data = {"readiness_score": 77, "sleep_hours": 7.1, "rhr": 53}

    plan = generate_weekly_plan(user, workouts, oura_data)
    return plan
