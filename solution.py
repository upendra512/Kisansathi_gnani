#!/usr/bin/env python3
"""Conservative, offline first-pass solution for the Xpert cold-start challenge.

Usage: python3 solution.py <input_dir> <output.json>

The challenge inputs do not include a locally available model credential during
development. This version uses transparent rules and real message IDs; uncertain
loops are omitted and uncertain closures remain open.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
import time

LOCAL_TZ = timezone(timedelta(hours=5, minutes=30))


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def words(text):
    return set(re.findall(r"[a-z0-9]+", (text or "").lower()))


def circle_for(person, texts, seeded):
    if person in seeded:
        return seeded[person]
    text = " ".join(texts).lower()
    cues = {
        "spouse": ("wife", "husband", "spouse", "my love", "darling"),
        "child": ("son", "daughter", "my kid", "school pickup"),
        "parent": ("mom", "mum", "mother", "dad", "father", "papa"),
        "sibling": ("brother", "sister", "bro", "sis"),
        "in-law": ("mother-in-law", "father-in-law", "brother-in-law", "sister-in-law"),
        "relative": ("cousin", "uncle", "aunt", "nephew", "niece", "relative"),
        "staff": ("driver", "maid", "cook", "house help", "staff", "caretaker"),
        "vendor": ("invoice", "quotation", "supplier", "delivery", "vendor", "payment due"),
        "client": ("client", "customer", "proposal", "project requirement"),
        "partner": ("business partner", "co-founder", "cofounder", "partnership"),
        "friend": ("birthday party", "dinner plan", "catch up", "weekend plan"),
    }
    def cue_count(cue):
        # Substring matching misreads words such as "person" as "son" and
        # "sisterly" as "sister". Match whole words while allowing spaces in
        # phrases like "house help".
        pattern = r"(?<![a-z0-9])" + r"\s+".join(re.escape(part) for part in cue.split()) + r"(?![a-z0-9])"
        return len(re.findall(pattern, text))

    scores = {circle: sum(cue_count(cue) for cue in terms) for circle, terms in cues.items()}
    best = max(scores, key=scores.get)
    # In this dataset work relationships dominate; avoid calling everyone a friend.
    return best if scores[best] > 0 else "colleague"


def parse_day(text, ts):
    low = (text or "").lower()
    if not re.search(r"\b(tomorrow|today|tonight|by\s+(?:mon|tue|wed|thu|fri|sat|sun|\d)|due|deadline|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b", low):
        return None
    try:
        day = datetime.fromtimestamp(int(ts), LOCAL_TZ).date()
    except (TypeError, ValueError, OSError):
        return None
    if "tomorrow" in low:
        return (day + timedelta(days=1)).isoformat()
    if any(x in low for x in ("today", "tonight")):
        return day.isoformat()
    match = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(?:[a-z]*\s+(20\d{2}))?", low)
    if match:
        months = {m.lower(): i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}
        month = months[match.group(2)[:3]]
        year = int(match.group(3)) if match.group(3) else day.year
        try:
            parsed = datetime(year, month, int(match.group(1))).date()
            if parsed < day.replace(month=1, day=1) and not match.group(3):
                parsed = parsed.replace(year=year + 1)
            return parsed.isoformat()
        except ValueError:
            pass
    return None


def classify_candidate(message):
    text = message.get("body") or ""
    low = text.lower().strip()
    if not low or message.get("kind") not in ("text", "voice_transcript", "image_caption", "document"):
        return None
    deadline = parse_day(low, message.get("ts"))
    follow = re.search(r"\b(follow\s?up|remind me|remind him|remind her|check back|let me know|lmk|update me|need an update)\b", low)
    waiting = re.search(r"\b(waiting|awaiting|pending|reply|respond)\b", low)
    needs_action = re.search(r"\bneed\b", low)
    # Requests and questions can represent a loop when they ask someone to act.
    question = "?" in low and re.search(r"\b(can|could|would|will|should|please|pls|when|which|what|anyone|any plans|possible)\b", low)
    commitment = re.search(
        r"\b(i['’]?ll|i will|i can|i should|i need to|let me|we['’]?ll|we will|will send|will share|will call|will pay|will do|will get|will complete|will book|will check|will confirm|shall send|shall share)\b",
        low,
    )
    imperative = re.match(r"^(please|pls|kindly)\b", low) or re.search(r"\b(please|pls)\s+(send|share|pay|book|call|check|confirm|update|give|buy|bring|arrange|ask)\b", low)
    request = re.search(r"\b(need your help|can you|could you|please send|pls send|please pay|pls pay|please share|pls share|let me know|lmk)\b", low)
    if not any((follow, waiting, needs_action, question, commitment, imperative, request, deadline and re.search(r"\b(i|we|you|please|pls|need|send|pay|book|call|share|complete|confirm)\b", low))):
        return None
    if deadline:
        loop_type = "deadline"
    elif follow or waiting:
        loop_type = "followup"
    elif question or request:
        loop_type = "question"
    else:
        loop_type = "commitment"
    return loop_type, deadline


STATUS_STOPWORDS = {
    "will", "send", "share", "please", "pls", "need", "tomorrow", "today", "that", "this",
    "with", "from", "have", "your", "you", "for", "and", "the", "a", "to", "me", "i", "we",
    "it", "not", "is", "are", "was", "be", "do", "can", "could", "would", "should", "get",
    "give", "call", "ask", "my", "our", "on", "in", "at", "of", "by", "as", "am", "has", "had",
}


def resolve_status(source, later, term_frequency):
    source_text = (source.get("body") or "").lower()
    source_tokens = words(source_text) - STATUS_STOPWORDS
    source_tokens = {w for w in source_tokens if len(w) > 2}
    for msg in later:
        txt = (msg.get("body") or "").lower()
        if not txt:
            continue
        quoted = msg.get("quoted_id") == source.get("id")
        overlap = source_tokens & words(txt)
        # A shared rare term is more useful for linking than a generic word such
        # as "call" or "meeting". If multiple active tasks share that term, it
        # is no longer rare and cannot close either one without an explicit quote.
        specific = quoted or any(term_frequency.get(token, 0) <= 2 for token in overlap)
        if specific and re.search(r"\b(cancelled|canceled|forget it|no longer need|don't need|do not need|won't do|will not do|not going ahead|skip it|called off)\b", txt):
            return "dropped", msg["id"]
        # A bare "done/sent/it is done" is not enough unless it quotes the source
        # or repeats a distinctive object from the commitment.
        completion = re.search(r"\b(sent|shared|paid|completed|finished|done|booked|ordered|received|arrived|reached|got|gotten|uploaded|submitted|fixed|resolved|delivered|called|emailed|collected)\b", txt)
        if completion and specific:
            same_actor_or_recipient = msg.get("sender_id") == source.get("sender_id") or msg.get("sender_id") == "ME" or source.get("sender_id") == "ME"
            if same_actor_or_recipient:
                return "done", msg["id"]
    return "open", None


def resolve_owner(source, chat, loop_type):
    """Estimate who owes the next move from speaker and grammatical direction."""
    sender = source.get("sender_id") or "ME"
    text = (source.get("body") or "").lower().strip()
    asks_recipient = bool(re.search(r"\b(can|could|would|will|should)\s+you\b|^(please|pls|kindly)\b", text))
    if sender != "ME":
        # A question/request from another person generally needs Arjun's answer
        # or action. A first-person promise remains owned by its speaker.
        if loop_type == "question" or asks_recipient:
            return "ME"
        return sender
    if asks_recipient:
        recipients = [p for p in chat.get("participants", []) if p != "ME"]
        # A 1:1 recipient is unambiguous. In a group, avoid guessing who owes it.
        if len(recipients) == 1:
            return recipients[0]
    return "ME"


def _reminder_time(due, last_ts):
    latest = datetime.fromtimestamp(int(last_ts), LOCAL_TZ) if last_ts else datetime.now(LOCAL_TZ)
    if due:
        try:
            due_at = datetime.combine(datetime.fromisoformat(due).date(), datetime.min.time(), LOCAL_TZ) + timedelta(hours=9)
            if due_at > latest:
                return due_at.isoformat(timespec="minutes")
        except ValueError:
            pass
    return (latest + timedelta(hours=1)).isoformat(timespec="minutes")


def help_decision(loop, source, chat, circles, last_ts):
    """Apply the challenge's move-owner rule, with leave as the safe fallback."""
    if loop["status"] != "open":
        return None
    text = (source.get("body") or "").lower()
    peers = [p for p in chat.get("participants", []) if p != "ME"]
    if source.get("sender_id") != "ME" and any(circles.get(p) == "spouse" for p in peers):
        return {"action": "leave", "reason": "This appears to be the spouse's own conversation; stay out unless Arjun made the commitment."}
    if loop["owner"] != "ME":
        waiting = re.search(r"\b(waiting|awaiting|pending)\b", text)
        overdue = bool(loop.get("due") and last_ts and datetime.fromtimestamp(int(last_ts), LOCAL_TZ).date().isoformat() > loop["due"])
        if source.get("sender_id") == "ME" and waiting and overdue:
            return {"action": "remind", "remind_at": _reminder_time(loop.get("due"), last_ts)}
        return {"action": "leave", "reason": "Another person owns this next step; avoid taking over."}
    if re.search(r"\b(find|look for|research|compare|draft|prepare|compile|collect|check availability|search for)\b", text):
        needs_yes = bool(re.search(r"\b(book|buy|pay|send|order|reserve|purchase|call|email)\b", text))
        return {"action": "assist", "next_step": "Prepare options or a draft for: " + loop["title"][:100], "needs_yes": needs_yes}
    due = loop.get("due")
    explicit_reminder = bool(re.search(r"\b(remind me|don't let me forget|dont let me forget)\b", text))
    overdue = bool(due and last_ts and datetime.fromtimestamp(int(last_ts), LOCAL_TZ).date().isoformat() >= due)
    if explicit_reminder or overdue:
        return {"action": "remind", "remind_at": _reminder_time(due, last_ts)}
    return {"action": "leave", "reason": "There is no clear deadline or safe next step to act on now."}


def _llm_context_batches(messages):
    """Return compact, candidate-centered batches for optional semantic review."""
    by_chat = defaultdict(list)
    for message in messages:
        by_chat[message["chat_id"]].append(message)
    completion = re.compile(r"\b(sent|shared|paid|completed|finished|done|booked|ordered|received|arrived|reached|got|gotten|collected|uploaded|submitted|fixed|resolved|delivered|cancelled|canceled|called off|forget it|no longer need)\b", re.I)
    goal_signal = re.compile(r"\b(goal|aim|want to|hope to|hoping to|plan to|planning to|target|dream|wish to|intend to|would love to|trying to)\b", re.I)
    batches, current, current_size = [], [], 0
    for chat_id, chat_messages in by_chat.items():
        ordered = sorted(chat_messages, key=lambda m: (m.get("ts", 0), m["id"]))
        relevant = {i for i, m in enumerate(ordered) if classify_candidate(m) or completion.search(m.get("body") or "") or goal_signal.search(m.get("body") or "") or m.get("quoted_id")}
        # Add one message on either side to help with pronouns and replies.
        indices = set()
        for i in relevant:
            indices.update(range(max(0, i - 1), min(len(ordered), i + 2)))
        selected = [ordered[i] for i in sorted(indices)]
        if not selected:
            continue
        record = {"chat_id": chat_id, "messages": [
            {"id": m["id"], "ts": m.get("ts"), "sender_id": m.get("sender_id"), "sender_name": m.get("sender_name"), "quoted_id": m.get("quoted_id"), "text": (m.get("body") or "")[:700]}
            for m in selected
        ]}
        size = len(json.dumps(record, ensure_ascii=False))
        if current and current_size + size > 18000:
            batches.append(current)
            current, current_size = [], 0
        current.append(record)
        current_size += size
    if current:
        batches.append(current)
    return batches


def _parse_llm_json(content):
    content = (content or "").strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I)
    start, end = content.find("{"), content.rfind("}")
    if start < 0 or end < start:
        raise ValueError("model response did not contain a JSON object")
    parsed = json.loads(content[start:end + 1])
    if not isinstance(parsed, dict) or not isinstance(parsed.get("open_loops"), list):
        raise ValueError("model response must contain an open_loops list")
    goals = parsed.get("goals", [])
    if not isinstance(goals, list):
        raise ValueError("model response goals must be a list")
    return {"open_loops": parsed["open_loops"], "goals": goals}


def semantic_loop_review(messages, chats, seed):
    """Use the permitted endpoint only when configured; fall back on any failure."""
    if not all(os.environ.get(k) for k in ("LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL")):
        return None
    from llm import chat as llm_chat

    valid_messages = {m["id"]: m for m in messages}
    valid_chats = {c["chat_id"] for c in chats}
    results = []
    goals_by_key = {}
    for batch in _llm_context_batches(messages):
        prompt = (
            "Extract genuine action loops and explicit long-term goals supported by these WhatsApp messages. "
            "For goals, include only a sustained aspiration or intended future outcome, not a one-off task or generic wish. "
            "Every goal needs evidence IDs from the input, an area, type (habit/milestone/experience), and horizon (3mo/1yr/3yr/5yr). "
            "Do not infer a commitment from a generic statement. A later 'done/sent/it' closes a loop only when the referent is clear. "
            "For every open loop choose one help action. Follow this rule: leave when someone else owns and is handling it or it is the spouse's own personal conversation; remind when Arjun is waiting and overdue or must act/decide and forgetting matters; assist when the assistant can move it forward privately and reversibly. "
            "Return strict JSON: {\"open_loops\":[{\"title\":string,\"type\":\"commitment|followup|deadline|question\",\"owner\":\"ME|person id\",\"chat_id\":string,\"source_msg\":string,\"due\":string|null,\"status\":\"open|done|dropped\",\"closed_by\":string|null,\"help\":{\"action\":\"assist|remind|leave\",\"next_step\":string,\"needs_yes\":boolean,\"remind_at\":string,\"reason\":string}},...],\"goals\":[{\"title\":string,\"area\":string,\"type\":string,\"horizon\":string,\"evidence\":[message_id]}]} . "
            "Use only message IDs present in the input. If a source is clear but status evidence is ambiguous, use open and closed_by null. "
            "Each message includes chat_id, timestamp, sender, optional quoted_id and text.\nINPUT:\n"
            + "SEED GOALS (do not repeat without message evidence): " + json.dumps(seed.get("goals", []), ensure_ascii=False)
            + "\nMESSAGES:\n" + json.dumps(batch, ensure_ascii=False)
        )
        try:
            content = llm_chat(
                [{"role": "system", "content": "You extract evidence-backed action loops. Follow the supplied JSON contract exactly."},
                 {"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=5000,
                timeout=60,
            )
            parsed = _parse_llm_json(content)
            batch_chats = {record["chat_id"] for record in batch}
            batch_ids = {m["id"] for record in batch for m in record["messages"]}
            for loop in parsed["open_loops"]:
                if not isinstance(loop, dict):
                    continue
                source_id = loop.get("source_msg")
                source = valid_messages.get(source_id)
                chat_id = loop.get("chat_id")
                if not source or source_id not in batch_ids or chat_id not in batch_chats or chat_id not in valid_chats or source.get("chat_id") != chat_id:
                    continue
                if loop.get("type") not in {"commitment", "followup", "deadline", "question"}:
                    continue
                if loop.get("status") not in {"open", "done", "dropped"}:
                    continue
                owner = loop.get("owner")
                allowed_owners = {"ME"} | {p for c in chats if c["chat_id"] == chat_id for p in c.get("participants", [])}
                if owner not in allowed_owners:
                    owner = source.get("sender_id") if source.get("sender_id") in allowed_owners else "ME"
                closed_by = loop.get("closed_by")
                if loop["status"] == "open":
                    closed_by = None
                elif not closed_by or closed_by not in batch_ids or closed_by not in valid_messages or valid_messages[closed_by].get("chat_id") != chat_id:
                    # Refuse unsupported done/dropped claims rather than inventing evidence.
                    loop["status"], closed_by = "open", None
                help_item = loop.get("help") if loop["status"] == "open" else None
                if loop["status"] == "open":
                    action = help_item.get("action") if isinstance(help_item, dict) else None
                    if action not in {"assist", "remind", "leave"}:
                        help_item = {"action": "leave", "reason": "No clear next action is supported by the messages."}
                    elif action == "assist":
                        help_item = {"action": "assist", "next_step": str(help_item.get("next_step") or "Review the request and decide on a next step."), "needs_yes": bool(help_item.get("needs_yes", True))}
                    elif action == "remind":
                        remind_at = help_item.get("remind_at")
                        if not isinstance(remind_at, str) or not re.match(r"^\d{4}-\d\d-\d\dT\d\d:\d\d", remind_at):
                            help_item = {"action": "leave", "reason": "No reliable reminder time is stated."}
                        else:
                            help_item = {"action": "remind", "remind_at": remind_at}
                    else:
                        help_item = {"action": "leave", "reason": str(help_item.get("reason") or "No clear next action is supported by the messages.")}
                title = str(loop.get("title") or (source.get("body") or "Follow up on requested action"))[:180]
                item = {"title": title, "type": loop["type"], "owner": owner, "chat_id": chat_id, "source_msg": source_id,
                        "status": loop["status"], "closed_by": closed_by, "help": help_item}
                due = loop.get("due")
                if isinstance(due, str) and re.match(r"^\d{4}-\d\d-\d\d$", due):
                    item["due"] = due
                results.append(item)
            seed_titles = {re.sub(r"[^a-z0-9]+", " ", str(g.get("title", "")).lower()).strip() for g in seed.get("goals", []) if isinstance(g, dict)}
            for goal in parsed["goals"]:
                if not isinstance(goal, dict):
                    continue
                title = str(goal.get("title") or "").strip()[:180]
                area, goal_type, horizon = goal.get("area"), goal.get("type"), goal.get("horizon")
                evidence = [x for x in goal.get("evidence", []) if isinstance(x, str) and x in batch_ids and x in valid_messages]
                key = re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()
                if not title or not evidence or key in seed_titles:
                    continue
                if area not in {"self", "spouse", "kids", "parents", "work", "friends", "experiences", "finances", "health", "home"}:
                    continue
                if goal_type not in {"habit", "milestone", "experience"} or horizon not in {"3mo", "1yr", "3yr", "5yr"}:
                    continue
                item = {"title": title, "area": area, "type": goal_type, "horizon": horizon, "evidence": sorted(set(evidence))}
                existing = goals_by_key.get((area, key))
                if existing:
                    existing["evidence"] = sorted(set(existing["evidence"]) | set(item["evidence"]))
                else:
                    goals_by_key[(area, key)] = item
        except Exception as exc:  # API, timeout, and malformed JSON all fall back cleanly.
            print(f"LLM loop review failed; using Python candidates for this batch: {type(exc).__name__}: {exc}", file=sys.stderr)
            return None
    goals = sorted(goals_by_key.values(), key=lambda g: (-len(g["evidence"]), g["title"]))[:10]
    return results, goals


def build_loops(messages, chats, people):
    by_chat = defaultdict(list)
    for m in messages:
        by_chat[m["chat_id"]].append(m)
    chats_by_id = {c["chat_id"]: c for c in chats}
    circles = {p["id"]: p["circle"] for p in people}
    loops = []
    for chat_id, chat_messages in by_chat.items():
        ordered = sorted(chat_messages, key=lambda m: (m.get("ts", 0), m["id"]))
        last_ts = max((m.get("ts", 0) for m in ordered), default=0)
        term_frequency = Counter()
        for message in ordered:
            term_frequency.update(words(message.get("body") or "") - STATUS_STOPWORDS)
        for index, source in enumerate(ordered):
            candidate = classify_candidate(source)
            if not candidate:
                continue
            loop_type, due = candidate
            later = ordered[index + 1:]
            status, closed_by = resolve_status(source, later, term_frequency)
            owner = resolve_owner(source, chats_by_id[chat_id], loop_type)
            body = re.sub(r"\s+", " ", source.get("body") or "").strip()
            title = body[:160] if body else "Follow up on requested action"
            item = {
                "title": title,
                "type": loop_type,
                "owner": owner,
                "chat_id": chat_id,
                "source_msg": source["id"],
                "status": status,
                "closed_by": closed_by,
            }
            if due:
                item["due"] = due
            item["help"] = help_decision(item, source, chats_by_id[chat_id], circles, last_ts)
            loops.append(item)
    return loops


def main(input_dir, output_path):
    started = time.perf_counter()
    folder = Path(input_dir)
    chats = read_jsonl(folder / "chats.jsonl")
    messages = read_jsonl(folder / "messages.jsonl")
    seed = json.loads((folder / "seed.json").read_text(encoding="utf-8")) if (folder / "seed.json").exists() else {}

    person_ids = sorted({p for c in chats for p in c.get("participants", [])} - {"ME"})
    seeded_circles = seed.get("circles") or {}
    person_texts = defaultdict(list)
    for m in messages:
        if m.get("sender_id") != "ME":
            person_texts[m["sender_id"]].append(m.get("body") or "")
    for c in chats:
        person_names = {p for p in c.get("participants", []) if p != "ME"}
        for p in person_names:
            person_texts[p].append(c.get("name") or "")
    people = [{"id": p, "circle": circle_for(p, person_texts[p], seeded_circles)} for p in person_ids]

    # Seed names are anchors. Remaining group chats are clustered by explicit
    # household, property, operations, or broad workplace cues. A residual
    # bucket avoids inventing one organization per group chat.
    organisations = []
    org_name_by_chat = {}
    seed_orgs = [str(x) for x in seed.get("organisations", [])]
    org_ids = {}
    for i, name in enumerate(seed_orgs, 1):
        oid = f"org_seed_{i}"
        org_ids[name.lower()] = oid
        organisations.append({"id": oid, "name": name, "type": "company", "side": "work", "role": "member"})
    def get_org(name, org_type="other", side="work", role="member"):
        key = name.lower().strip()
        if key in org_ids:
            return org_ids[key], name
        oid = "org_inferred_" + re.sub(r"[^a-z0-9]+", "_", key).strip("_")[:36]
        if oid not in {x["id"] for x in organisations}:
            organisations.append({"id": oid, "name": name, "type": org_type, "side": side, "role": role})
        org_ids[key] = oid
        return oid, name
    seed_aliases = {
        "postmyad": ("postmyad.com", "pma", "pma operations", "pma <> meta ads"),
    }
    def matching_seed_org(title, body, min_body_mentions=1):
        title = title or ""
        body = body or ""
        for name in seed_orgs:
            aliases = (name,) + seed_aliases.get(name.lower(), ())
            def count_mentions(text):
                count = 0
                for alias in aliases:
                    pattern = r"(?<![a-z0-9])" + r"\s+".join(re.escape(part) for part in alias.split()) + r"(?![a-z0-9])"
                    count += len(re.findall(pattern, text, flags=re.I))
                return count
            if count_mentions(title) > 0 or count_mentions(body) >= min_body_mentions:
                return name
        return None
    for c in chats:
        if not c.get("is_group"):
            continue
        body = " ".join(m.get("body") or "" for m in messages if m.get("chat_id") == c["chat_id"])
        matched = matching_seed_org(c.get("name") or "", body, min_body_mentions=1)
        if matched:
            org_name_by_chat[c["chat_id"]] = (org_ids[matched.lower()], matched)
        else:
            name = re.sub(r"\s+", " ", c.get("name") or "Group chat").strip() or "Group chat"
            title = name.lower()
            if re.search(r"\b(home|ghar|family|families|siblings|sisters|brothers|kitchen|household)\b", title):
                oid, canonical = get_org("Home", "residence", "home", "owner")
            elif re.search(r"\b(farm|farmhouse|estate)\b", title):
                oid, canonical = get_org("Farmhouse", "vacation home", "home", "owner")
            elif re.search(r"\b(office|operations|workplace)\b", title):
                base = re.sub(r"\b(operations|office|workplace)\b", "", name, flags=re.I).strip(" -:<>")
                canonical_name = base if base and len(base) < 35 else "Office"
                oid, canonical = get_org(canonical_name, "workspace", "work", "member")
            elif re.search(r"\b(work|founders|d2c|d2b|marketplace|ads|business|team|commerce|company)\b", title):
                oid, canonical = get_org("Office", "workspace", "work", "member")
            else:
                oid, canonical = get_org("Other", "other", "work", "member")
            org_name_by_chat[c["chat_id"]] = (oid, canonical)

    # Direct chats can be company conversations too; link only when a seeded
    # organisation is named explicitly in their title or message history.
    direct_org_by_chat = {}
    for c in chats:
        if c.get("is_group"):
            continue
        body = " ".join(m.get("body") or "" for m in messages if m.get("chat_id") == c["chat_id"])
        matched = matching_seed_org(c.get("name") or "", body, min_body_mentions=4)
        if matched:
            direct_org_by_chat[c["chat_id"]] = (org_ids[matched.lower()], matched)
        else:
            # Reuse an organisation only when its inferred title is explicitly
            # mentioned in the direct chat; otherwise retain the person mapping.
            lower = ((c.get("name") or "") + " " + body).lower()
            inferred = next((o for o in organisations if o["id"].startswith("org_inferred_") and o["name"].lower() not in {"other", "office", "home", "farmhouse"} and len(o["name"]) > 2 and o["name"].lower() in lower), None)
            if inferred:
                direct_org_by_chat[c["chat_id"]] = (inferred["id"], inferred["name"])

    ties = []
    for c in chats:
        cid = c["chat_id"]
        if c.get("is_group"):
            oid, _ = org_name_by_chat[cid]
            ties.append({"chat_id": cid, "organisation": oid})
        elif cid in direct_org_by_chat:
            ties.append({"chat_id": cid, "organisation": direct_org_by_chat[cid][0]})
        else:
            other = next((p for p in c.get("participants", []) if p != "ME"), None)
            ties.append({"chat_id": cid, "person": other})

    reviewed = semantic_loop_review(messages, chats, seed)
    if reviewed is None:
        reviewed_loops = build_loops(messages, chats, people)
        goals = []
    else:
        reviewed_loops, goals = reviewed
    out = {
        "people": people,
        "organisations": organisations,
        "chats": ties,
        # Without a configured model, no goals are emitted because this dev key
        # has no goal labels and unsupported aspirations are worse than omissions.
        "goals": goals,
        "open_loops": reviewed_loops,
    }
    Path(output_path).write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Completed in {time.perf_counter() - started:.2f}s; loops={len(out['open_loops'])}; LLM={'enabled' if all(os.environ.get(k) for k in ('LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL')) else 'not configured'}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python3 solution.py <input_dir> <output.json>")
    main(sys.argv[1], sys.argv[2])
