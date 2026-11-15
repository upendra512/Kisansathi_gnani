"""Diagnose the Gemini key: which Flash models does it see, and which still have quota?
Run:  python check_gemini.py      (reads GEMINI_API_KEY from env or .streamlit/secrets.toml)"""
from core.config import get_secret
from google import genai
from google.genai import types

key = get_secret("GEMINI_API_KEY")
if not key:
    raise SystemExit("No GEMINI_API_KEY found in environment or .streamlit/secrets.toml")
print("Using configured Gemini key")
client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=10_000))
names = [m.name.replace("models/", "") for m in client.models.list()
         if "flash" in m.name and not any(s in m.name for s in ("image", "tts", "live", "audio", "embedding"))][:3]
print(f"{len(names)} Flash models visible\n")
for name in names:
    try:
        r = client.models.generate_content(model=name, contents="Reply with the single word OK")
        print(f"  OK     {name}: {r.text.strip()[:20]}")
    except Exception as e:
        msg = str(e)
        code = next((c for c in ("429", "404", "403", "401", "503") if c in msg), "ERR")
        print(f"  {code:6} {name}")
