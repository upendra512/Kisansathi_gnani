# Day 10 â€” Score optimisation (12 November 2026)

## Captured request

The project ownerâ€™s request began: â€œI have more time before the final deadline, and I want to improve the actual challenge score as much as possible. Our current offline score is 11.4/56, while the published model-assisted reference is 17.5/56.â€ They asked for measured development-checker experiments, an LLM-path check before offline tuning, and a protected checkpoint. The full original request is in the supplied Codex attachment for this session; this file records the work and observed outcomes, not a reconstructed word-for-word transcript. No transcript-export tool was available in this environment.

## Decisions and experiments

- Confirmed the existing `score-opt-checkpoint-2026-11-12` Git branch at `0b23c57f28e4e69fcba76037ffc555fa0e761daf`; left it intact. The evaluator `check.py` was not changed.
- Checked only whether `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` were set. All three were missing; no secret was displayed and no live endpoint request was made.
- Compared keyword candidates with broader contextual retrieval. The broad variant produced 580 candidates and 35 one-to-one source matches, versus 479 and 29 for the previous variant, against 74 labeled loops. Precision was 6.0%, recall 47.3%, F1 about 10.7%. An overbroad 1,061-candidate variant matched more sources but scored fewer checker points, so it was discarded.
- Tightened lifecycle linking to require a quote or distinctive shared task term plus a clear event and compatible actor. On the matched-open audit, false closures went from three to one. The checkerâ€™s closed-right category rose from 1.1/14 at the prior checkpoint to 2.6/14.
- Whole-word relationship cues raised circles from 2.6 to 3.5/12. Clustering supported household/work groups raised organisations from 0.4 to 1.7/8 and chats from 5.8 to 6.5/8. No answer-key records were copied into production rules.
- Added bounded candidate-centred goal/loop batches, schema/ID checking and conservative fallback for the configured LLM path. Added successful-response caching and usage logs for success, cache hits and errors. `.llm_cache/` is ignored by Git.

## Actual validation

Command, from the project directory:

```text
./run.sh ../../xpert-cold-start/data/dev out.json && python3 check.py ../../xpert-cold-start/data/dev out.json
```

On Windows this was invoked through the installed Git Bash and Python shim. The pipeline reported 0.91 seconds, 580 loops, and `LLM=not configured`. The unchanged checker reported 15.9/56: circles 3.5/12, organisations 1.7/8, chats 6.5/8, loops found 1.5/14, loops closed right 2.6/14; goals and help were unlabelled. Draft 2020-12 schema validation passed. Python compilation and `git diff --check` passed. A mocked LLM test passed for a successful response, a cache hit with one HTTP request and token accounting, and timeout logging. No real calls, tokens, cost, or model quality were measured.

One initial mock harness passed its assertions but printed a Windows temporary-directory cleanup error because it exited its temp context while the process working directory was inside that directory. The harness was corrected to restore the working directory before cleanup and rerun successfully.

## Remaining limitations

The final offline score is 1.6 points below the challengeâ€™s published model-assisted reference, but these are not directly comparable systems. Loop precision is still low; lifecycle linking has residual false closures; organisation clustering remains weak; and development answers do not label goals/help. Live `openai/gpt-oss-120b` quality, hidden-set behaviour, token usage and cost remain unknown because endpoint settings were absent. The published reference figures are not measurements of this implementation.
