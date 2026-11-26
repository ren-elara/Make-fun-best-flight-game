# SIGNAL / RADAR model notes

`lib/model.ts` builds the submitted board from the sealed snapshot. `dashboard/app.js` renders that same output as `window.RADAR`; the page does not recompute or substitute rankings.

## Candidate set and separation

Every official watchlist slug is retained. Additional rows are protocols at any snapshot TVL whose snapshot has no recorded market cap, Gecko identifier or symbol, except wrapped/staked products, bridge and exchange categories, version-suffixed names and exchange-prefixed names. This brings in eligible protocols left off the watchlist as well as those below its floor. The exclusions never remove an official watchlist row. Protocols with a recorded token are shown separately as market-cap/TVL references, not mixed into the candidate ranking.

## Value estimate

For each positive-market-cap live-token peer, calculate `market cap / TVL`, clip the ratio to `0.0001–25`, and derive market-wide p10, p25, p50, p75 and p90 quantiles. Select a candidate cohort in this order:

1. Same non-null category and at least one shared chain, if the cohort has at least 4 peers.
2. Same non-null category, if it has at least 6 peers.
3. Any shared-chain peers, if there are at least 10.
4. Otherwise all eligible market-wide peers.

Clip each selected ratio to the global p10–p90 range. For each cohort quartile and median, blend its logarithm with the corresponding global quantile using `w = n / (n + 16)`. This pulls small cohorts toward the wider market while preserving well-supported category evidence.

`implied value = TVL × shrunk cohort median × growth factor × tenure factor × chain-breadth factor`

The 7-day change is bounded to −50% through +100%, then has a 0.2 weight: `growth factor = 1 + 0.2 × change / 100`. Missing growth uses 1. Tenure is `0.86 + 0.14 × (1 − exp(−age_days / 730))`; missing tracking age is neutral at 1. Chain breadth is `min(1.12, 1 + 0.04 × log2(chain count))`, with a minimum of 1. Dollar outputs are rounded to positive whole dollars and capped at $100 trillion.

The shown range uses the same modifiers around the shrunk peer p25 and p75. It describes observed peer dispersion; it is not a launch-probability or future-return interval. Confidence labels depend on cohort size and the presence of category, chain, growth and tracking-age fields.

## Farming route

Each row carries six practical stages: check official incentives; verify domain, contract and chain; isolate a bounded wallet; make one small, useful category-specific interaction only if it has an acceptable exit path; keep transaction evidence without evading eligibility rules; and review/unwind after 7 or 14 days. Every step states its cost and duration. No current rewards, airdrop eligibility, token absence or launch timing is inferred from the snapshot.
