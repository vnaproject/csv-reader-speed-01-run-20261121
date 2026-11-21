# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/vnaproject/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/vnaproject/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for make.fun's csv-reader 1.0.0: it reads broken CSV files exactly as the reference does — the same `{columns, rows, errors}` on every case — at roughly 3x the speed of the reference on the practice set. Plain lines (no quotes, no stray CR) go through a native `split(',')` fast path; records with quotes, stray CRs or multi-line quoted fields take a field-by-field slow path built on `indexOf` + `slice`, with CR normalisation and line counting only for quoted content that actually holds a line break. No dependencies, no network, deterministic: two runs produce byte-identical output.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<dir for answers.json> node main.ts
```

Node 22.18 or later, standard library only, nothing to install. The harness runs `node /bot/main.ts`, which reads every case from `/input/cases.json`, answers each with `run` from `solve.js`, and writes `/output/answers.json`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
