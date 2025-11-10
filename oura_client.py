# oura_client.py
import os, asyncio, datetime as dt, httpx, sqlite3, json
from typing import Optional, Dict, Any

DB_PATH = os.getenv("DB_PATH", "data.db")
OURA_PAT = os.getenv("OURA_PAT", "")

OURA_BASE = "https://api.ouraring.com/v2/usercollection"

def _conn():
    con = sqlite3.connect(DB_PATH)
    con.execute("""CREATE TABLE IF NOT EXISTS oura_daily (
        date TEXT PRIMARY KEY,
        readiness INTEGER,
        sleep_hours REAL,
        rhr INTEGER,
        hrv INTEGER,
        raw_json TEXT
    )""")
    return con

async def fetch_oura_daily_for(date: dt.date) -> Dict[str, Any]:
    if not OURA_PAT:
        raise RuntimeError("OURA_PAT missing")
    headers = {"Authorization": f"Bearer {OURA_PAT}"}
    start = date.isoformat()
    end = date.isoformat()
    async with httpx.AsyncClient(timeout=30) as client:
        # Readiness
        r1 = await client.get(f"{OURA_BASE}/daily_readiness", params={"start_date": start, "end_date": end}, headers=headers)
        r1.raise_for_status()
        readiness_items = r1.json().get("data", [])
        readiness_score = readiness_items[0].get("score") if readiness_items else None

        # Sleep summary (to get total sleep & RHR/HRV surrogates)
        r2 = await client.get(f"{OURA_BASE}/daily_sleep", params={"start_date": start, "end_date": end}, headers=headers)
        r2.raise_for_status()
        sleep_items = r2.json().get("data", [])
        sleep_hours = (sleep_items[0].get("total_sleep_duration", 0)/3600.0) if sleep_items else None
        avg_rhr = sleep_items[0].get("average_bpm") if sleep_items else None
        avg_hrv = sleep_items[0].get("average_hrv") if sleep_items else None

    return {
        "date": start,
        "readiness_score": readiness_score,
        "sleep_hours": sleep_hours,
        "rhr": avg_rhr,
        "hrv": avg_hrv,
        "raw": {
            "readiness": readiness_items if readiness_items else [],
            "sleep": sleep_items if sleep_items else [],
        },
    }

def upsert_daily(row: Dict[str, Any]) -> None:
    con = _conn()
    con.execute(
        """INSERT INTO oura_daily(date, readiness, sleep_hours, rhr, hrv, raw_json)
           VALUES(?,?,?,?,?,?)
           ON CONFLICT(date) DO UPDATE SET
             readiness=excluded.readiness,
             sleep_hours=excluded.sleep_hours,
             rhr=excluded.rhr,
             hrv=excluded.hrv,
             raw_json=excluded.raw_json
        """,
        (row["date"], row.get("readiness_score"), row.get("sleep_hours"), row.get("rhr"), row.get("hrv"), json.dumps(row.get("raw", {})))
    )
    con.commit()
    con.close()

def get_latest() -> Optional[Dict[str, Any]]:
    con = _conn()
    cur = con.execute("SELECT date, readiness, sleep_hours, rhr, hrv, raw_json FROM oura_daily ORDER BY date DESC LIMIT 1")
    row = cur.fetchone()
    con.close()
    if not row: return None
    return {
        "date": row[0],
        "readiness_score": row[1],
        "sleep_hours": row[2],
        "rhr": row[3],
        "hrv": row[4],
        "raw": json.loads(row[5] or "{}"),
    }

async def refresh_today() -> Dict[str, Any]:
    today = dt.date.today()
    data = await fetch_oura_daily_for(today)
    upsert_daily(data)
    return data

async def daily_scheduler(stop_event: asyncio.Event):
    """Refresh once on startup, then every 24h."""
    try:
        await refresh_today()
    except Exception:
        pass
    while not stop_event.is_set():
        try:
            # sleep until ~02:30 local time each day
            now = dt.datetime.now()
            next_run = (now + dt.timedelta(days=1)).replace(hour=2, minute=30, second=0, microsecond=0)
            await asyncio.wait_for(stop_event.wait(), timeout=(next_run - now).total_seconds())
        except asyncio.TimeoutError:
            pass
        if stop_event.is_set(): break
        try:
            await refresh_today()
        except Exception:
            pass
