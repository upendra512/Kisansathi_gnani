"""Text-to-speech with Gnani primary and local/cloud provider fallbacks."""
import asyncio
import io
from concurrent.futures import ThreadPoolExecutor

from core.gnani import GnaniError, synthesize_speech

VOICES = {"hi": "hi-IN-SwaraNeural", "en": "en-IN-NeerjaNeural"}


def _edge_tts(text: str, voice: str) -> bytes:
    import edge_tts

    async def _run():
        buf = bytearray()
        async for chunk in edge_tts.Communicate(text, voice).stream():
            if chunk.get("type") == "audio":
                buf.extend(chunk["data"])
        return bytes(buf)

    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, _run()).result(timeout=25)


def _gtts(text: str, lang: str) -> bytes:
    from gtts import gTTS

    fp = io.BytesIO()
    gTTS(text=text, lang=lang).write_to_fp(fp)
    return fp.getvalue()


def text_to_speech(text: str, lang: str = "hi"):
    """Returns (audio_bytes, engine_name) and falls back when Gnani is unavailable."""
    lang = lang if lang in ("hi", "en", "kn") else "en"
    try:
        return synthesize_speech(text, lang), "Gnani Timbre"
    except GnaniError as gnani_error:
        if lang in VOICES:
            try:
                audio = _edge_tts(text, VOICES[lang])
                if audio:
                    return audio, "Edge-TTS fallback"
            except Exception:
                pass
        try:
            return _gtts(text, lang), "gTTS fallback"
        except Exception as fallback_error:
            return None, f"Voice unavailable: Gnani ({gnani_error}); fallbacks ({fallback_error})"
