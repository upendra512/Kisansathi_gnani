# Write-up

## Approach

The solution reads the JSONL inputs and seed, preserves real chat/message IDs, and emits schema-shaped people, organisations, chat links, goals, and open loops. It uses Python for timelines, candidate retrieval, dates, ownership, evidence checks, conservative lifecycle resolution, and help-action defaults. When all three `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` variables are configured, it sends compact candidate-centred chronological batches to the permitted OpenAI-compatible endpoint for loop and goal review. Responses are parsed and restricted to input IDs; malformed output and request errors fall back to Python. Successful responses are cached locally, and the client records request, cache, and error token/time data in ignored `usage.jsonl`.

Relationship and organisation decisions use seed facts and conversational evidence. Whole-word relationship cues avoid substring mistakes; explicit household/work groups are clustered instead of treating every group as a separate organisation. Uncertain loop closures remain open unless a later message quotes the source or shares a distinctive task term with a clear completion/cancellation cue. A vague â€œsent itâ€ therefore cannot close multiple tasks.

## Development evaluation

The original checker and development answer key were left unchanged. Reproduced starter score was **5.4/56**. The prior offline checkpoint was **11.4/56**. The current combined offline implementation scored **15.9/56** on the full development set:

| Component | Prior checkpoint | Current | Maximum |
|---|---:|---:|---:|
| Circles | 2.6 | 3.5 | 12 |
| Organisations | 0.4 | 1.7 | 8 |
| Chats | 5.8 | 6.5 | 8 |
| Open loops found | 1.5 | 1.5 | 14 |
| Open loops closed right | 1.1 | 2.6 | 14 |
| Goals / help | Not labelled | Not labelled | 18 |

The best controlled retrieval variant expanded contextual cues from 479 to 580 candidates. One-to-one source matches rose from 29/74 to 35/74: precision 6.0%, recall 47.3%, F1 about 10.7%. The checkerâ€™s loop-found score improved slightly (about 1.4 to 1.5 points); its conservative closure score improved from 1.1 to 2.6 points. In an audit of source-matched open loops, false closures fell from three to one in the final combined run. An overbroad 1,061-candidate union found more source IDs but reduced the actual checker points, so it was rejected. This shows the remaining precision/recall trade-off: keyword expansion alone is not enough.

Circle whole-word matching raised its category from 2.6 to 3.5. Group-chat organisation clustering raised organisations from 0.4 to 1.7 and chats from 5.8 to 6.5; the remaining organisation score is weak. Goals and help cannot be tuned against this answer key because it contains no labels for them.

The final `run.sh ../../xpert-cold-start/data/dev out.json` run completed in **0.91 seconds** (pipeline-reported), emitted 580 loop predictions, and passed the original checker and Draft 2020-12 schema validation. No API variables were configured, so actual model calls and actual model tokens were **zero**. The solution can form 20 candidate-centred batches from the development messages (estimated serialized input size about 413,576 characters), but this is not a token or cost measurement. There was no live comparison with `openai/gpt-oss-120b`; its published 17.5/56 and $0.038/1,000-message figures are challenge references, not results for this code. LLM client smoke tests used a mock endpoint for success, cache hit, usage logging, and timeout handling.

## Limitations

Loop precision remains low and the development set is small. Keyword retrieval can miss implicit tasks; distinctive-term matching can miss paraphrases and can still attach an update to the wrong task. The final matched-loop audit still found one false closure. Chat/organisation clustering is rule-based and may fail on unnamed organisations, shared projects, or a group chat belonging to one person. Goal extraction, help decisions, real endpoint response quality, actual token cost, and hidden-set generalisation remain unverified. No answer-key IDs are embedded in production logic. The manual 12-chat linkage annotation remains local and unfinished.
