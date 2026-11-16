# token-radar-signal

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/feryanandda/token-radar-signal/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/feryanandda/token-radar-signal/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar: 758 protocols from the sealed DefiLlama snapshot, ranked by implied value — what a pre-token protocol's token would be worth if its record stayed as it is. The model is derived only from the snapshot's own figures: implied = TVL × category multiple (the median market-cap/TVL of traded peers in the same category) × momentum (7-day TVL change, clamped) × maturity (time tracked with no token recorded) × breadth (chains). Wrapped, staked, bridged and exchange records are set aside with their reasons; every watchlist protocol is covered. Each of the 180 ranked rows carries a five-step farm plan with costs and time, and the dashboard adds a detail view per protocol, category/chain/TVL filters, sorting, and the live-peers table the multiples come from.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
# then serve out/ statically and open dashboard/index.html
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=heyyw288&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
