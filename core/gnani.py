"""Gnani Prisma speech-to-text and Timbre text-to-speech clients."""
import json

import requests

from core.config import get_secret

STT_URL = "https://api.vachana.ai/stt/v3"
TTS_URL = "https://api.vachana.ai/api/v1/tts/inference"


class GnaniError(Exception):
    """Raised when a Gnani request cannot produce a valid result."""


def _key() -> str:
    key = get_secret("GNANI_API_KEY")
    if not key:
        raise GnaniError("GNANI_API_KEY is not configured")
    return str(key)


def _error(response: requests.Response) -> GnaniError:
    if response.status_code in (401, 403):
        return GnaniError("Gnani authentication failed")
    if response.status_code == 429:
        return GnaniError("Gnani rate limit exceeded")
    if response.status_code >= 500:
        return GnaniError(f"Gnani service unavailable (HTTP {response.status_code})")
    return GnaniError(f"Gnani request failed (HTTP {response.status_code})")


def transcribe_audio(audio: bytes, mime_type: str = "audio/wav", language: str = "auto") -> dict:
    """Transcribe uploaded audio with Prisma and return the validated response."""
    if not audio:
        raise GnaniError("No audio was provided")
    extension = {
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/ogg": "ogg",
        "audio/flac": "flac",
        "audio/aac": "aac",
        "audio/mp4": "m4a",
        "audio/x-m4a": "m4a",
    }.get(mime_type.lower(), "wav")
    try:
        response = requests.post(
            STT_URL,
            headers={"X-API-Key-ID": _key()},
            files={"audio_file": (f"question.{extension}", audio, mime_type)},
            data={"model": get_secret("GNANI_STT_MODEL", "prisma-v3.0"),
                  "language_code": {"hi": "hi-IN", "en": "en-IN", "kn": "kn-IN"}.get(
                      language, get_secret("GNANI_STT_LANGUAGE", "indic-auto"))},
            timeout=60,
        )
    except requests.RequestException as exc:
        raise GnaniError(f"Gnani speech recognition failed: {type(exc).__name__}") from exc
    if not response.ok:
        raise _error(response)
    try:
        result = response.json()
    except (ValueError, json.JSONDecodeError) as exc:
        raise GnaniError("Gnani returned an invalid speech response") from exc
    transcript = str(result.get("transcript") or "").strip()
    if not result.get("success", True) or not transcript:
        raise GnaniError("Gnani returned an empty transcript")
    return result


def synthesize_speech(text: str, language: str = "hi") -> bytes:
    """Synthesize advisory text with Timbre and return WAV bytes."""
    if not text.strip():
        raise GnaniError("Cannot synthesize empty text")
    lang = {"hi": "hi-IN", "en": "en-IN", "kn": "kn-IN"}.get(language, "en-IN")
    voice = {
        "hi": get_secret("GNANI_HI_VOICE", "Nalini"),
        "en": get_secret("GNANI_EN_VOICE", "Kaveri"),
        "kn": get_secret("GNANI_KN_VOICE", "Kavin"),
    }.get(language, get_secret("GNANI_EN_VOICE", "Kaveri"))
    payload = {
        "text": text,
        "voice": voice,
        "model": get_secret("GNANI_TTS_MODEL", "timbre-v2.5"),
        "language": lang,
        "speed": 1.0,
        "audio_config": {
            "sample_rate": 48000,
            "num_channels": 1,
            "sample_width": 2,
            "encoding": "linear_pcm",
            "container": "wav",
        },
    }
    try:
        response = requests.post(
            TTS_URL,
            headers={"X-API-Key-ID": _key(), "Content-Type": "application/json"},
            json=payload,
            timeout=60,
        )
    except requests.RequestException as exc:
        raise GnaniError(f"Gnani speech synthesis failed: {type(exc).__name__}") from exc
    if not response.ok:
        raise _error(response)
    if not response.content or not response.headers.get("content-type", "").startswith("audio/"):
        raise GnaniError("Gnani returned invalid audio")
    return response.content
