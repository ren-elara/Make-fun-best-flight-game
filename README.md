[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ren-elara/Make-fun-best-flight-game/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ren-elara/Make-fun-best-flight-game/reward.svg)](https://make.fun/bounty/token-radar-01)

# SIGNAL / RADAR

An offline token-launch radar for the `token-radar-01` make.fun bounty. It reads the sealed protocol snapshot, ranks protocols with no token recorded by a reproducible implied market-cap model, and keeps live-token peers in a separate reference view.

## Run the entry

The competition runner invokes the standard-library entrypoint directly:

```sh
node main.ts
```

For local development, the installed `tsx` runner supports this environment's Node build:

```sh
node --import tsx main.ts --input /path/to/snapshot.json --output out
node tools/serve.mjs
```

Open `http://127.0.0.1:4173/` to explore the local dashboard. The delivered page reads only the generated `data.js`; it makes no network requests.

## Model

Each pre-token row is scored from snapshot values only:

`TVL × shrunk comparable-token market-cap/TVL median × bounded 7d growth × tenure × chain breadth`

Comparable ratios are clipped to robust global quantiles and selected by category/shared-chain cohorts when the cohort is large enough. Growth is bounded to `-50%..+100%`; tenure and chain breadth are deliberately modest modifiers. The detail drawer exposes the peer set, sample count, range, factor values, caveats, and a six-step farming plan with explicit cost and time.

The board always covers the sealed watchlist and adds screened pre-token protocols omitted by the watchlist, at any snapshot TVL. It does not claim that a missing DefiLlama token field proves token absence or that an implied value predicts a launch.

## Checks

```sh
TOKEN_RADAR_SNAPSHOT=/path/to/snapshot.json node tools/capture.mjs
node --import tsx tools/verify.mjs /path/to/snapshot.json
```

Set `TOKEN_RADAR_SNAPSHOT` for `capture.mjs`. The capture script renders the board, a protocol detail drawer, and a filtered view in Chromium, then checks for browser errors, network requests, and screenshot size limits. The verifier checks watchlist coverage, ranking invariants, farm plans, deterministic output, dossier generation, and local dashboard sources.
