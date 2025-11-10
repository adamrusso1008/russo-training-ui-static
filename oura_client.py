# oura_client.py
import os
from datetime import date, timedelta
import httpx

OURA_API = "https://api.ouraring.com/v2"
PAT = os.getenv("OURA_PAT")  # set this in Render Environment

class OuraError(Exception): pass

def _auth_headers():
    if not PAT:
        raise OuraError("Missing OURA_PAT environment variable")
    return {"Authorization": f"Bearer {PAT}"}

def fetch_daily(date_str: str | None = None):
    """Fetch readiness, sleep summary, & RHR for a specific date (UTC).
       Returns a compact dict or raises OuraError."""
    if date_str is None:
        date_str = date.today().isoformat()
    headers = _auth_headers()
    params = {"start_date": date_str, "end_date": date_str}

    with httpx.Client(timeout=20) as client:
        # Readiness
        r_ready = client.get(f"{OURA_API}/usercollection/daily_readiness", headers=headers, params=params)
        r_ready.raise_for_status()
        readiness_items = r_ready.json().get("data", [])

        # Sleep
        r_sleep = client.get(f"{OURA_API}/usercollection/daily_sleep", headers=headers, params=params)
        r_sleep.raise_for_status()
        sleep_items = r_sleep.json().get("data", [])

        # Heart rate (RHR available in sleep or use daily heart-rate summary)
        # Fallback: average RHR from sleep segments if present
        rhr = None
        sleep_hours = None
        if sleep_items:
            s = sleep_items[0]
            sleep_hours = round(s.get("total_sleep_duration", 0) / 3600, 2) if "total_sleep_duration" in s else None
            rhr = s.get("lowest_heart_rate") or s.get("average_heart_rate")

        readiness_score = readiness_items[0].get("score") if readiness_items else None

        return {
            "date": date_str,
            "readiness_score": readiness_score,
            "sleep_hours": sleep_hours,
            "rhr": rhr,
        }

def fetch_range(days: int = 7):
    """Pull last N days (including today)"""
    out = []
    for i in range(days):
        d = (date.today() - timedelta(days=i)).isoformat()
        try:
            out.append(fetch_daily(d))
        except Exception as e:
            out.append({"date": d, "error": str(e)})
    return list(reversed(out))
