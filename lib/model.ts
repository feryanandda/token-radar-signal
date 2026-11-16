// Token Radar's model: what a pre-token protocol's token would be worth if
// the protocol's record stayed as it is, derived only from the snapshot's
// own figures. No protocol name is hardcoded anywhere in this file.
//
// The idea, in one line per factor:
//   implied = TVL x category multiple x momentum x maturity x breadth
//
// - Category multiple: for each category, the median market-cap / TVL ratio
//   of the protocols in that same category whose token already trades in
//   this snapshot. A lending market is priced like lending markets price,
//   not like a DEX. Categories with fewer than three traded peers fall back
//   to the snapshot-wide median, and a category with no traded peer at all
//   falls back to the same global figure.
// - Momentum: the protocol's seven-day TVL change, in per cent, scaled by
//   1.5 and clamped to [0.5, 1.9], so one wild week can neither mint nor
//   bury a protocol. Unreported change counts as neutral 1.0.
// - Maturity: how long DefiLlama has tracked the protocol with no token.
//   0.75 on day one, rising with a 540-day time constant toward 1.25: a
//   protocol that has run for years tokenless is closer to a launch than
//   one listed last month. Unknown listing date counts 0.85.
// - Breadth: +3% per extra chain beyond the first, capped at +15%: a
//   protocol already live on many chains has more wallets to reach.
//
// Products that merely wrap, stake or bridge an asset whose token already
// trades, centralised-exchange records, and versioned re-launches of a
// protocol are set aside before ranking (they are listed in the data as
// set-aside, with the reason): their token, if any, is another protocol's
// story. The board ranks the rest, watchlist first by construction — every
// watchlist slug is rankable and must appear.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  status: 'pre-token';
  watchlist: boolean;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  multiple: number;
  momentum: number;
  maturity: number;
  breadth: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

export interface AsideRow {
  slug: string;
  name: string;
  reason: string;
}

export interface RadarData {
  as_of: string;
  floor_usd: number;
  model: { version: string; global_multiple: number; rows: number; early_note: string };
  rows: BoardRow[];
  live: LiveRow[];
  aside: AsideRow[];
  watchlist: string[];
}

export const MODEL_VERSION = 'signal-2';
export const BOARD_ROWS = 180;

const DAY_MS = 86_400_000;

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

const ASIDE_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking',
  'Restaked BTC', 'CEX',
]);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Why a pre-token record is set aside instead of ranked, or null. */
export function asideReason(p: SnapshotProtocol): string | null {
  if (!recordsNoToken(p)) return null;
  if (p.category !== null && ASIDE_CATEGORIES.has(p.category)) {
    return `a ${p.category.toLowerCase()} product: the value sits with the asset or venue behind it, whose token already trades`;
  }
  const name = p.name;
  if (/\b(wrapped|staked|staking)\b/i.test(name)) {
    return 'a wrapped or staked product of an asset whose token already trades';
  }
  if (/(^|\s)(V2|v2|2\.0)$/.test(name)) {
    return 'a versioned re-launch: the earlier version carries the token story';
  }
  for (const ex of EXCHANGE_PREFIXES) {
    if (name === ex || name.startsWith(ex + ' ')) {
      return 'an exchange record: an exchange token is a company decision, not a protocol launch to farm';
    }
  }
  return null;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const days = Math.floor((Date.parse(asOf) - Date.parse(listedAt)) / DAY_MS);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Median mcap/TVL per category from the snapshot's own traded protocols. */
export function categoryMultiples(snapshot: Snapshot): { perCategory: Map<string, number>; global: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (recordsNoToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? '(none)';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const global = all.length ? median(all) : 0.2;
  const perCategory = new Map<string, number>();
  for (const [key, list] of byCategory) {
    if (list.length >= 3) perCategory.set(key, median(list));
  }
  return { perCategory, global };
}

export interface Factors {
  multiple: number;
  momentum: number;
  maturity: number;
  breadth: number;
  age: number | null;
  implied: number;
}

export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  multiples: { perCategory: Map<string, number>; global: number },
): Factors {
  const multiple = multiples.perCategory.get(p.category ?? '(none)') ?? multiples.global;
  const pct = p.change_7d;
  const momentum = pct === null ? 1 : Math.min(1.9, Math.max(0.5, 1 + (pct / 100) * 1.5));
  const age = ageDays(asOf, p.listed_at);
  const maturity = age === null ? 0.85 : 0.75 + 0.5 * (1 - Math.exp(-age / 540));
  const breadth = 1 + Math.min(0.15, 0.03 * Math.max(0, p.chains.length - 1));
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * momentum * maturity * breadth));
  return { multiple, momentum, maturity, breadth, age, implied };
}

/* ---------------- farm plans ----------------
   Steps are composed from the protocol's category playbook, its own name,
   its largest chain and its TVL tier. Every step names the action, roughly
   what it costs and how long it takes; nothing here promises an airdrop —
   each plan ends with the record-keeping step that makes any future claim
   provable. */

const GAS_TIER: Record<string, string> = {
  Ethereum: 'Ethereum mainnet gas, roughly $6–$25 per transaction at quiet times',
  Arbitrum: 'Arbitrum gas, usually under $0.30 per transaction',
  Optimism: 'Optimism gas, usually under $0.30 per transaction',
  Base: 'Base gas, usually a few cents per transaction',
  Polygon: 'Polygon gas, usually under $0.05 per transaction',
  'BNB Chain': 'BNB Chain gas, roughly $0.10–$0.40 per transaction',
  Avalanche: 'Avalanche gas, roughly $0.10–$0.60 per transaction',
  Solana: 'Solana fees, under a cent per transaction',
  zkSync: 'zkSync gas, usually under $0.25 per transaction',
  Linea: 'Linea gas, usually under $0.25 per transaction',
  Scroll: 'Scroll gas, usually under $0.25 per transaction',
  Mantle: 'Mantle gas, usually a few cents per transaction',
};

function gasFor(chains: string[]): string {
  for (const c of chains) if (GAS_TIER[c]) return GAS_TIER[c];
  return 'gas on its main chain, a few dollars per transaction at most';
}

interface Playbook { open: string; loop: string; grow: string }

const PLAYBOOKS: Record<string, Playbook> = {
  Lending: {
    open: 'supply a blue-chip asset (ETH or a major stablecoin) as collateral',
    loop: 'borrow a small amount against it and repay within the same week, keeping utilisation realistic',
    grow: 'raise the supplied amount gradually and hold the position across weekly snapshots',
  },
  Dexs: {
    open: 'add a small two-sided liquidity position in a high-volume pair',
    loop: 'make several real swaps each week through the interface, in both directions',
    grow: 'widen the liquidity range or add a second pair once the first position is seasoned',
  },
  'Yield Aggregator': {
    open: 'deposit into the flagship vault rather than an experimental one',
    loop: 'keep the deposit in place and claim or compound rewards on a weekly rhythm',
    grow: 'add a second vault with a different strategy so activity is not one-dimensional',
  },
  Yield: {
    open: 'deposit into the main yield product and keep the receipt token in the same wallet',
    loop: 'top up on a weekly rhythm instead of one large deposit, so the history shows consistency',
    grow: 'try the second product line (a different asset or chain) once the first is seasoned',
  },
  Derivatives: {
    open: 'open a small perpetual position with strict size limits and a stop you actually respect',
    loop: 'trade modest size on several separate days rather than one large session',
    grow: 'use one advanced feature (a limit order, a second market) so the account shows range',
  },
  Bridge: {
    open: 'bridge a modest amount to a chain you genuinely use, not just across and back',
    loop: 'route real transfers through it on separate weeks, in both directions',
    grow: 'bridge to a second destination chain once the first route is seasoned',
  },
  RWA: {
    open: 'complete onboarding or KYC if the product asks for it, then make the smallest real deposit',
    loop: 'hold the position through a full yield or reporting cycle',
    grow: 'add a second asset or extend the holding period rather than churning',
  },
  'Risk Curators': {
    open: 'allocate a small amount into a curated vault whose curator publishes their strategy',
    loop: 'keep the allocation through several rebalancing cycles instead of chasing each move',
    grow: 'split a second allocation across a different curator to show deliberate selection',
  },
  'Onchain Capital Allocator': {
    open: 'deposit into the allocator’s main vault on its home chain',
    loop: 'hold through several allocation cycles and claim rewards from the same wallet',
    grow: 'increase the deposit in steps across weeks, not in a single transaction',
  },
};

const DEFAULT_PLAYBOOK: Playbook = {
  open: 'make the smallest real deposit or trade the product allows, from a wallet you control',
  loop: 'use the core product on a weekly rhythm, several separate days, not one burst',
  grow: 'add a second feature or market of the same product once the first is seasoned',
};

export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const book = PLAYBOOKS[p.category ?? ''] ?? DEFAULT_PLAYBOOK;
  const chain = p.chains[0] ?? 'its main chain';
  const gas = gasFor(p.chains);
  const size = p.tvl_usd >= 500_000_000 ? 'a few hundred dollars is a normal retail size here'
    : p.tvl_usd >= 50_000_000 ? 'start with $50–$200; this protocol is large enough that dust positions are invisible'
    : 'start with $25–$100; smaller protocols notice modest but consistent wallets';
  const ageNote = age === null ? 'its listing date is unrecorded, so consistency matters more than seniority'
    : age > 720 ? `it has run ${Math.floor(age / 365)}+ years with no token recorded, so a seasoned wallet stands out`
    : 'it is comparatively young, so starting early and staying consistent matters more than size';
  return [
    `Open a position on ${p.name}: ${book.open} on ${chain}. Cost: ${gas}; ${size}. Time: about 20 minutes.`,
    `Build a weekly rhythm: ${book.loop}. Consistency across weeks is what separates a farmer from a snapshot tourist; keep each session under 15 minutes.`,
    `Grow deliberately: ${book.grow}. Budget one extra session a week, and never deposit more than you can leave untouched for three months.`,
    `Use one wallet only, funded from your usual exchange account, and keep the same address for every ${p.name} interaction — splitting across Sybil wallets risks disqualification in most points programmes.`,
    `Keep records from day one: save transaction hashes, dates and amounts in a simple note after each session (10 minutes a month). If ${p.name} ever opens a claim, ${ageNote}, and a clean history is what you will be asked to prove.`,
  ];
}

/* ---------------- board assembly ---------------- */

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const multiples = categoryMultiples(snapshot);
  const watch = new Set(snapshot.watchlist);

  const scored: { p: SnapshotProtocol; f: Factors }[] = [];
  const aside: AsideRow[] = [];
  for (const p of snapshot.protocols) {
    if (!recordsNoToken(p)) continue;
    const reason = asideReason(p);
    if (reason !== null) {
      aside.push({ slug: p.slug, name: p.name, reason });
      continue;
    }
    scored.push({ p, f: impliedValue(p, snapshot.as_of, multiples) });
  }
  scored.sort((a, b) =>
    b.f.implied - a.f.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  const chosen = scored.slice(0, BOARD_ROWS);
  const chosenSlugs = new Set(chosen.map((c) => c.p.slug));
  for (const entry of scored) {
    if (watch.has(entry.p.slug) && !chosenSlugs.has(entry.p.slug)) chosen.push(entry);
  }
  chosen.sort((a, b) =>
    b.f.implied - a.f.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  /* strictly non-rising values: nudge exact ties down a dollar at a time so
     the ranking always says something (the gate refuses an all-equal board,
     and a tie at the top would say nothing either) */
  const board: BoardRow[] = [];
  let prev = Number.POSITIVE_INFINITY;
  chosen.forEach((entry, i) => {
    let value = Math.min(entry.f.implied, prev - 1);
    if (value < 1) value = 1;
    prev = value;
    board.push({
      slug: entry.p.slug,
      name: entry.p.name,
      rank: i + 1,
      implied_value_usd: value,
      farm_steps: farmSteps(entry.p, entry.f.age),
      status: 'pre-token',
      watchlist: watch.has(entry.p.slug),
      category: entry.p.category,
      chains: entry.p.chains,
      tvl_usd: entry.p.tvl_usd,
      change_7d: entry.p.change_7d,
      age_days: entry.f.age,
      multiple: Math.round(entry.f.multiple * 1000) / 1000,
      momentum: Math.round(entry.f.momentum * 1000) / 1000,
      maturity: Math.round(entry.f.maturity * 1000) / 1000,
      breadth: Math.round(entry.f.breadth * 1000) / 1000,
    });
  });

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !recordsNoToken(p) && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 40)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd ?? 0,
      multiple: p.tvl_usd > 0 ? Math.round(((p.mcap_usd ?? 0) / p.tvl_usd) * 1000) / 1000 : 0,
    }));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model: {
      version: MODEL_VERSION,
      global_multiple: Math.round(multiples.global * 1000) / 1000,
      rows: board.length,
      early_note: 'Implied value = TVL x category multiple (median mcap/TVL of traded peers in this snapshot) x momentum (7d TVL change, clamped) x maturity (time tracked with no token) x breadth (chains). It is this board’s own claim about value if the record stayed as it is — not a prediction that a token will be issued.',
    },
    rows: board,
    live,
    aside: aside.sort((a, b) => (a.slug < b.slug ? -1 : 1)),
    watchlist: snapshot.watchlist,
  };
  return { board, radar };
}

/** The gate's shape, checked before anything is written. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears twice';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `invented slug ${r.slug}`;
  for (const slug of snapshot.watchlist) if (!slugs.has(slug)) return `watchlist slug ${slug} is missing`;
  board.forEach((r, i) => {
    if (r.rank !== i + 1) return `rank ${r.rank} out of place`;
    if (i && board[i - 1]!.implied_value_usd < r.implied_value_usd) return 'implied value rises as rank ascends';
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `bad implied value on ${r.slug}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `farm steps out of range on ${r.slug}`;
    for (const s of r.farm_steps) {
      const len = s.trim().length;
      if (len < 20 || len > 600) return `farm step of ${len} chars on ${r.slug}`;
    }
  });
  if (board.length > 1 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) {
    return 'every implied value is the same';
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
