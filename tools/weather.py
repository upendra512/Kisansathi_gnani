"""Weather + soil + agro-meteorology from the Open-Meteo Forecast API (keyless).
VPD and FAO-56 ET0 are computed by Open-Meteo itself; soil moisture is model-derived."""
from core.cache import MEM, read_json, write_json
from core.config import now_iso
from core.http import FetchError, get_json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

URL = "https://api.open-meteo.com/v1/forecast"

HOURLY = [
    "temperature_2m", "relative_humidity_2m", "precipitation_probability", "precipitation",
    "wind_speed_10m", "wind_gusts_10m", "vapour_pressure_deficit", "et0_fao_evapotranspiration",
    "soil_moisture_0_to_1cm", "soil_moisture_1_to_3cm", "soil_moisture_3_to_9cm",
    "soil_moisture_9_to_27cm", "soil_temperature_0cm", "is_day", "wind_direction_10m", "cloud_cover",
]
DAILY = [
    "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
    "precipitation_probability_max", "et0_fao_evapotranspiration", "weather_code",
]


def _demo_forecast() -> dict:
    """Deterministic demo feed used only when the upstream provider is unavailable."""
    now = datetime.now(ZoneInfo("Asia/Kolkata")).replace(minute=0, second=0, microsecond=0)
    times = [(now + timedelta(hours=i)).strftime("%Y-%m-%dT%H:00") for i in range(168)]
    hourly = {
        "time": times,
        "temperature_2m": [27 + round(4 * ((i % 24) - 12) / 12, 1) for i in range(168)],
        "relative_humidity_2m": [62 + (i % 8) for i in range(168)],
        "precipitation_probability": [15 if i % 24 < 8 else 5 for i in range(168)],
        "precipitation": [0.0] * 168,
        "wind_speed_10m": [8 + (i % 4) for i in range(168)],
        "wind_gusts_10m": [12 + (i % 5) for i in range(168)],
        "vapour_pressure_deficit": [0.8] * 168,
        "et0_fao_evapotranspiration": [0.12] * 168,
        "soil_moisture_0_to_1cm": [0.24] * 168,
        "soil_moisture_1_to_3cm": [0.26] * 168,
        "soil_moisture_3_to_9cm": [0.25] * 168,
        "soil_moisture_9_to_27cm": [0.27] * 168,
        "soil_temperature_0cm": [25.0] * 168,
        "is_day": [1 if 6 <= (i % 24) < 18 else 0 for i in range(168)],
        "wind_direction_10m": [90] * 168,
        "cloud_cover": [25] * 168,
    }
    days = [(now + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    daily = {"time": days, "temperature_2m_max": [31] * 7, "temperature_2m_min": [22] * 7,
             "precipitation_sum": [0.0] * 7, "precipitation_probability_max": [15] * 7,
             "et0_fao_evapotranspiration": [4.0] * 7, "weather_code": [1] * 7}
    return {"hourly": hourly, "daily": daily, "units": {}, "fetched_at": now_iso(),
            "source": "KisanSaathi synthetic demo weather", "cache": "demo"}


def get_forecast(lat: float, lon: float) -> dict:
    key = f"wx2_{round(lat, 2)}_{round(lon, 2)}"
    # Open-Meteo's free endpoint rate-limits bursts. Keep a forecast usable for an hour
    # and let the disk snapshot serve as a fallback when Render is restarted or throttled.
    hit = MEM.get(key, ttl_seconds=3600)
    if hit:
        return {**hit, "cache": "memory (≤30 min old)"}
    params = {
        "latitude": lat, "longitude": lon, "hourly": ",".join(HOURLY), "daily": ",".join(DAILY),
        "timezone": "Asia/Kolkata", "forecast_days": 7,
    }
    try:
        data = get_json(URL, params, timeout=8, retries=2, backoff=3.0)
        out = {
            "hourly": data["hourly"], "daily": data["daily"], "units": data.get("hourly_units", {}),
            "fetched_at": now_iso(), "source": "Open-Meteo Forecast API", "cache": "live",
        }
        MEM.set(key, out)
        write_json(f"{key}.json", out)
        return out
    except Exception as exc:
        disk = read_json(f"{key}.json")
        if disk:
            return {**disk, "cache": f"disk fallback (live call failed: {exc})"}
        return _demo_forecast()
