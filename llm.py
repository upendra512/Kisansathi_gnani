"""A tiny client for any OpenAI-compatible chat API, standard library only.

It reads LLM_BASE_URL, LLM_API_KEY and LLM_MODEL from the environment, which is how we run your
code with our own key when we score it. Every call appends its token counts to usage.jsonl, so you
can see what a run costs before we do.

    from llm import chat
    reply = chat([{"role": "user", "content": "Hello"}])

You don't have to use this file. Any client is fine, as long as it reads those three variables and
sends nothing anywhere else.
"""
import json
import hashlib
import os
import time
import urllib.request
from pathlib import Path


def _log_usage(record):
    with open("usage.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


def chat(messages, model=None, temperature=0, max_tokens=None, response_format=None, timeout=120):
    base = os.environ["LLM_BASE_URL"].rstrip("/")
    body = {"model": model or os.environ["LLM_MODEL"], "messages": messages, "temperature": temperature}
    if max_tokens:
        body["max_tokens"] = max_tokens
    if response_format:
        body["response_format"] = response_format
    req = urllib.request.Request(
        base + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": "Bearer " + os.environ["LLM_API_KEY"], "Content-Type": "application/json"},
    )
    cache_dir = Path(os.environ.get("LLM_CACHE_DIR", ".llm_cache"))
    cache_key = hashlib.sha256(json.dumps({"url": base + "/chat/completions", "body": body}, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
    cache_path = cache_dir / (cache_key + ".json")
    try:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        _log_usage({"model": body["model"], "prompt_tokens": 0, "completion_tokens": 0,
                    "cached_prompt_tokens": (cached.get("usage") or {}).get("prompt_tokens"),
                    "cached_completion_tokens": (cached.get("usage") or {}).get("completion_tokens"),
                    "seconds": 0, "status": "cache"})
        return cached["content"]
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
        pass
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        _log_usage({
            "model": body["model"],
            "prompt_tokens": None,
            "completion_tokens": None,
            "seconds": round(time.time() - started, 2),
            "status": "error",
            "error_type": type(exc).__name__,
        })
        raise
    usage = data.get("usage") or {}
    content = data["choices"][0]["message"]["content"]
    _log_usage({
        "model": body["model"],
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "seconds": round(time.time() - started, 2),
        "status": "ok",
    })
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps({"content": content, "usage": usage}, ensure_ascii=False), encoding="utf-8")
    except OSError:
        # Cache writes are an optimization; a successful response remains usable.
        pass
    return content
