# Write-up

## What I focused on, and why

The starter produced valid JSON but no goals or open loops, and it treated every person as a friend and each group chat as a separate organisation. I replaced that baseline with an offline pipeline that preserves input IDs and makes conservative, evidence-linked predictions. Open loops carry the largest scored share, so the implementation focuses on candidate extraction and lifecycle status, with chat and relationship heuristics as lower-cost improvements.

## My approach

`solution.py` reads the input JSONL and seed, builds chat-local message timelines, and writes the five schema fields. It retains seeded circle facts, infers other circles from explicit relationship language, links direct chats to a person unless a seeded organisation is explicitly named, and groups clear household, work, and seeded-organisation chats. Loop candidates use message text and timestamps; later messages only close a candidate when they quote it or repeat an object term alongside a clear completion or cancellation expression. Otherwise the loop stays open. Evidence is represented with the original message IDs.

When `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` are all set, the solution can send candidate-centred message windows to the configured OpenAI-compatible endpoint for loop review. The response is parsed and checked against supplied chat and message IDs; malformed responses, timeouts, and API errors fall back to the Python result. No external API call was made during this development run because credentials were unavailable. The model-assisted path was exercised with a mocked client, not a live model.

## What it costs

The local development run made zero model calls, so its API cost was $0 and no model or per-1,000-message live cost can be reported honestly. When configured, `llm.py` records prompt/completion tokens and request time in the local, ignored `usage.jsonl`. The actual price depends on the model and rates supplied by the challenge; it was not measured here. The no-credential development run completed in 0.34 seconds on 4,502 messages.

## Evaluation and where it's wrong

The supplied checker reports **11.4/56** on the development answer key, up from the reproduced starter score of **5.4/56**. Circles improved from 1.5/12 to 2.6/12; organisations from 0.1/8 to 0.4/8; chats from 3.8/8 to 5.8/8; loops found from 0/14 to 1.5/14; and loops closed right from 0/14 to 1.1/14. Goals and help are unlabelled in this development key, so those categories cannot be compared. The starter and new outputs both pass the supplied shape checker; the new output also passes the repository's Draft 2020-12 JSON Schema.

Loop extraction remains the main weakness: 479 Python candidates yielded 29 one-to-one source matches against 74 labelled loops (about 6% precision and 39% recall under the checker's source matching). The answer key has no closing message IDs, so status scoring cannot verify which later message justified a closure. Generic requests, short replies, implied owners, and ambiguous references can still be misclassified. Relationship rules also miss cross-chat identity and organisation links; the low organisation score shows this clearly. The manual 12-chat linkage annotation is unfinished and remains local. Next work should use that annotation to tune retrieval and closure linking, measure a live model run and its token cost, then improve organisation clustering and add a labelled evaluation for goals and help decisions.
