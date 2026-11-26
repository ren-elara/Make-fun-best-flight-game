/**
 * Snapshot-only launch-radar model.
 *
 * The estimate is an implied token market-cap proxy, not a launch forecast: it combines
 * the candidate's TVL with observed market-cap/TVL ratios from comparable live-token
 * protocols, then applies deliberately bounded growth, tenure and chain-breadth factors.
 * No protocol name is a special case and no external data is read.
 */

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

export interface PeerModel {
  peer_set: string;
  peer_count: number;
  peer_ratio_p25: number;
  peer_ratio_median: number;
  peer_ratio_p75: number;
  global_ratio_median: number;
  shrinkage_weight: number;
  growth_pct: number | null;
  growth_multiplier: number;
  tenure_days: number | null;
  tenure_multiplier: number;
  chain_count: number;
  breadth_multiplier: number;
  adjusted_peer_ratio: number;
}

export interface FarmStep {
  title: string;
  action: string;
  cost: string;
  time: string;
}

export interface BoardRow extends SnapshotProtocol {
  rank: number;
  token_status: 'no token recorded';
  age_days: number | null;
  implied_value_usd: number;
  value_range_usd: { low: number; high: number };
  confidence: 'High' | 'Moderate' | 'Thin';
  confidence_note: string;
  model: PeerModel;
  farm_steps: string[];
  farm_plan: FarmStep[];
}

export interface LiveRow extends SnapshotProtocol {
  market_cap_to_tvl: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  peer_size: number;
  model: {
    version: string;
    formula: string;
    growth_weight: number;
    growth_bounds_pct: [number, number];
    tenure_floor: number;
    tenure_range: number;
    tenure_half_life_days: number;
    breadth_weight_per_doubling: number;
    peer_shrinkage_prior: number;
    limitations: string[];
  };
  rows: BoardRow[];
  live: LiveRow[];
  categories: string[];
  chains: string[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const MAX_IMPLIED_VALUE = 100_000_000_000_000;
const MAX_PEER_RATIO = 25;
const MIN_PEER_RATIO = 0.0001;
const PEER_SHRINKAGE_PRIOR = 16;
const GROWTH_WEIGHT = 0.2;
const GROWTH_BOUNDS: [number, number] = [-50, 100];
const TENURE_FLOOR = 0.86;
const TENURE_RANGE = 0.14;
const TENURE_HALF_LIFE_DAYS = 730;
const BREADTH_WEIGHT_PER_DOUBLING = 0.04;

const VERSION_MARKER = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const WRAPPED_PRODUCT = /\b(?:wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;
const bySlug = (a: { slug: string }, b: { slug: string }): number => a.slug.localeCompare(b.slug);

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!validDate(asOf) || listedAt === null || !validDate(listedAt)) return null;
  const from = Date.parse(`${listedAt}T00:00:00Z`);
  const to = Date.parse(`${asOf}T00:00:00Z`);
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

export function isPreToken(protocol: SnapshotProtocol): boolean {
  return protocol.mcap_usd === null && protocol.gecko_id === null && protocol.symbol === null;
}

function isExcludedProduct(protocol: SnapshotProtocol): boolean {
  if (EXCLUDED_CATEGORIES.has(protocol.category ?? '')) return true;
  if (VERSION_MARKER.test(protocol.name) || WRAPPED_PRODUCT.test(protocol.name)) return true;
  return EXCHANGE_PREFIXES.some((exchange) => protocol.name.toLowerCase().startsWith(exchange.toLowerCase()));
}

export function isEarlyCandidate(protocol: SnapshotProtocol): boolean {
  return isPreToken(protocol) && !isExcludedProduct(protocol);
}

function quantile(input: number[], fraction: number): number {
  if (input.length === 0) return 0;
  const values = [...input].sort((a, b) => a - b);
  const position = (values.length - 1) * fraction;
  const left = Math.floor(position);
  const right = Math.ceil(position);
  if (left === right) return values[left]!;
  return values[left]! + (values[right]! - values[left]!) * (position - left);
}

function median(input: number[]): number {
  return quantile(input, 0.5);
}

interface PeerReference {
  protocol: SnapshotProtocol;
  ratio: number;
}

interface PeerStats {
  label: string;
  values: number[];
}

interface PeerIndex {
  all: PeerReference[];
  globalQuantiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
}

function buildPeerIndex(protocols: SnapshotProtocol[]): PeerIndex {
  const all = protocols
    .filter((protocol) => !isPreToken(protocol) && protocol.category !== 'CEX' && protocol.mcap_usd !== null && protocol.mcap_usd > 0 && protocol.tvl_usd > 0)
    .map((protocol) => ({ protocol, ratio: clamp(protocol.mcap_usd! / protocol.tvl_usd, MIN_PEER_RATIO, MAX_PEER_RATIO) }));
  const ratios = all.map((peer) => peer.ratio);
  return {
    all,
    globalQuantiles: {
      p10: quantile(ratios, 0.1),
      p25: quantile(ratios, 0.25),
      p50: quantile(ratios, 0.5),
      p75: quantile(ratios, 0.75),
      p90: quantile(ratios, 0.9),
    },
  };
}

function sharesChain(candidate: SnapshotProtocol, peer: SnapshotProtocol): boolean {
  if (candidate.chains.length === 0 || peer.chains.length === 0) return false;
  const peerChains = new Set(peer.chains);
  return candidate.chains.some((chain) => peerChains.has(chain));
}

function peerStats(candidate: SnapshotProtocol, index: PeerIndex): PeerStats {
  const sameCategoryChain = index.all.filter(({ protocol }) => protocol.category === candidate.category && sharesChain(candidate, protocol));
  if (candidate.category !== null && sameCategoryChain.length >= 4) {
    return { label: `${candidate.category} · shared chain`, values: sameCategoryChain.map((peer) => peer.ratio) };
  }

  const sameCategory = index.all.filter(({ protocol }) => protocol.category === candidate.category);
  if (candidate.category !== null && sameCategory.length >= 6) {
    return { label: `${candidate.category} peers`, values: sameCategory.map((peer) => peer.ratio) };
  }

  const sharedChain = index.all.filter(({ protocol }) => sharesChain(candidate, protocol));
  if (sharedChain.length >= 10) {
    return { label: 'Shared-chain peers', values: sharedChain.map((peer) => peer.ratio) };
  }

  return { label: 'Market-wide token peers', values: index.all.map((peer) => peer.ratio) };
}

function logBlend(local: number, global: number, weight: number): number {
  if (local <= 0) return global;
  if (global <= 0) return local;
  return Math.exp(Math.log(local) * weight + Math.log(global) * (1 - weight));
}

function estimatePeerRatio(candidate: SnapshotProtocol, index: PeerIndex): {
  label: string;
  count: number;
  p25: number;
  median: number;
  p75: number;
  weight: number;
  globalMedian: number;
} {
  const peers = peerStats(candidate, index);
  const values = peers.values.map((ratio) => clamp(ratio, index.globalQuantiles.p10, index.globalQuantiles.p90));
  const count = values.length;
  const weight = count / (count + PEER_SHRINKAGE_PRIOR);
  const global = index.globalQuantiles;
  return {
    label: peers.label,
    count,
    p25: logBlend(quantile(values, 0.25), global.p25, weight),
    median: logBlend(median(values), global.p50, weight),
    p75: logBlend(quantile(values, 0.75), global.p75, weight),
    weight,
    globalMedian: global.p50,
  };
}

function growthMultiplier(change7d: number | null): { pct: number | null; multiplier: number } {
  if (change7d === null || !Number.isFinite(change7d)) return { pct: null, multiplier: 1 };
  const bounded = clamp(change7d, GROWTH_BOUNDS[0], GROWTH_BOUNDS[1]);
  return { pct: bounded, multiplier: clamp(1 + (bounded / 100) * GROWTH_WEIGHT, 0.9, 1.2) };
}

function tenureMultiplier(age: number | null): number {
  if (age === null) return 1;
  const saturation = 1 - Math.exp(-Math.max(0, age) / TENURE_HALF_LIFE_DAYS);
  return TENURE_FLOOR + TENURE_RANGE * saturation;
}

function breadthMultiplier(chainCount: number): number {
  if (chainCount <= 1) return 1;
  return Math.min(1.12, 1 + BREADTH_WEIGHT_PER_DOUBLING * Math.log2(chainCount));
}

function valueDollars(value: number): number {
  return clamp(Math.round(value), 1, MAX_IMPLIED_VALUE);
}

function confidenceFor(sampleCount: number, completeness: number): { level: BoardRow['confidence']; note: string } {
  if (sampleCount >= 24 && completeness >= 0.75) {
    return { level: 'High', note: `${sampleCount} comparable live-token protocols; key snapshot fields are present.` };
  }
  if (sampleCount >= 10 && completeness >= 0.5) {
    return { level: 'Moderate', note: `${sampleCount} comparable live-token protocols; some evidence is sparse or missing.` };
  }
  return { level: 'Thin', note: `${sampleCount} peers in the selected cohort; treat the estimate as a broad reference, not a forecast.` };
}

function categoryAction(protocol: SnapshotProtocol, chainLabel: string): string {
  const category = (protocol.category ?? '').toLowerCase();
  const name = protocol.name;
  if (/(lend|credit|collateral|cdp)/.test(category)) {
    return `If ${name} exposes a live lending market on ${chainLabel}, make one small, over-collateralized supply action; repay any test borrow and verify withdrawal before increasing exposure.`;
  }
  if (/(dex|exchange|liquidity|yield|farm)/.test(category)) {
    return `If ${name} has a live pool on ${chainLabel}, use its smallest practical swap or liquidity position, then check slippage and the unwind path before repeating.`;
  }
  if (/(derivative|basis|perpetual|interest rate)/.test(category)) {
    return `If ${name} supports a low-risk demo or small position on ${chainLabel}, inspect margin and liquidation rules first; use a capped, hedged action and close it after verification.`;
  }
  if (/(allocator|curator|vault|index)/.test(category)) {
    return `If ${name} lists a live vault on ${chainLabel}, inspect its underlying assets and withdrawal terms, then test the smallest deposit and redemption supported.`;
  }
  if (/(rwa|stable)/.test(category)) {
    return `If ${name} offers an eligible public flow on ${chainLabel}, check issuer and redemption terms, test the minimum useful action, and confirm the exit route first.`;
  }
  if (/(staking|restak)/.test(category)) {
    return `If ${name} offers native participation on ${chainLabel}, verify lock-up and exit rules, then use only an amount you can leave locked for the full term.`;
  }
  if (/(prediction|marketplace|payments|insurance)/.test(category)) {
    return `If ${name} has a live public workflow on ${chainLabel}, complete one genuine, low-value use case and confirm any settlement, cancellation or claim path.`;
  }
  return `Use ${name}'s official documentation to identify one genuine core action on ${chainLabel}; test the smallest supported amount and verify its exit path before repeating.`;
}

function farmPlan(protocol: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = protocol.chains[0] ?? 'the listed deployment';
  const holdDays = age !== null && age < 180 ? 14 : 7;
  return [
    {
      title: 'Confirm the opportunity',
      action: `Check ${protocol.name}'s official documentation and app for an announced points, rewards or eligibility program; DefiLlama's missing token fields do not confirm an airdrop.`,
      cost: '$0; do not pay to claim or register',
      time: '5–10 min',
    },
    {
      title: 'Verify the deployment',
      action: `Confirm the official domain, contract and ${chain} deployment from the protocol's own documentation; compare the page's listed TVL and product category with this snapshot.`,
      cost: '$0 before any transaction',
      time: '5 min',
    },
    {
      title: 'Set a bounded wallet',
      action: 'Use a separate wallet with no unrelated funds, protect its recovery phrase offline, and decide a maximum amount and fee before signing anything.',
      cost: 'No deposit required; gas is quoted by the wallet',
      time: '5 min',
    },
    {
      title: 'Make one useful interaction',
      action: categoryAction(protocol, chain),
      cost: 'Only the minimum practical capital plus the quoted network fee; skip if either is not acceptable',
      time: '10–20 min',
    },
    {
      title: 'Keep evidence, not noise',
      action: `Record the date, transaction, amount and receipt for ${protocol.name}; repeat a useful action no more often than its official rules allow, and never automate or split activity to evade eligibility rules.`,
      cost: 'Each transaction has its own quoted fee; a log costs $0',
      time: '5 min now; review weekly only while an official program is active',
    },
    {
      title: 'Review and unwind',
      action: `Recheck ${protocol.name}'s official terms after ${holdDays} days; if no verified incentive or useful position remains, close or withdraw using the documented exit path and retain the transaction record.`,
      cost: 'Exit fee only if a position was opened; quote before signing',
      time: `${holdDays} days before review; 5–10 min to close`,
    },
  ];
}

function stepLine(step: FarmStep, index: number): string {
  return `${String(index + 1).padStart(2, '0')} · ${step.title}: ${step.action} Cost: ${step.cost}. Time: ${step.time}.`;
}

function completenessOf(protocol: SnapshotProtocol): number {
  return (protocol.category !== null ? 0.25 : 0) + (protocol.chains.length > 0 ? 0.25 : 0) +
    (protocol.change_7d !== null ? 0.25 : 0) + (protocol.listed_at !== null ? 0.25 : 0);
}

function scoreCandidate(protocol: SnapshotProtocol, asOf: string, peers: PeerIndex): Omit<BoardRow, 'rank'> {
  const age = ageDays(asOf, protocol.listed_at);
  const benchmark = estimatePeerRatio(protocol, peers);
  const growth = growthMultiplier(protocol.change_7d);
  const tenure = tenureMultiplier(age);
  const breadth = breadthMultiplier(protocol.chains.length);
  const adjustedRatio = benchmark.median * growth.multiplier * tenure * breadth;
  const low = valueDollars(protocol.tvl_usd * benchmark.p25 * growth.multiplier * tenure * breadth);
  const high = valueDollars(protocol.tvl_usd * benchmark.p75 * growth.multiplier * tenure * breadth);
  const implied = valueDollars(protocol.tvl_usd * adjustedRatio);
  const plan = farmPlan(protocol, age);
  const confidence = confidenceFor(benchmark.count, completenessOf(protocol));

  return {
    ...protocol,
    token_status: 'no token recorded',
    age_days: age,
    implied_value_usd: implied,
    value_range_usd: { low: Math.min(low, implied), high: Math.max(high, implied) },
    confidence: confidence.level,
    confidence_note: confidence.note,
    model: {
      peer_set: benchmark.label,
      peer_count: benchmark.count,
      peer_ratio_p25: round4(benchmark.p25),
      peer_ratio_median: round4(benchmark.median),
      peer_ratio_p75: round4(benchmark.p75),
      global_ratio_median: round4(benchmark.globalMedian),
      shrinkage_weight: round4(benchmark.weight),
      growth_pct: growth.pct,
      growth_multiplier: round4(growth.multiplier),
      tenure_days: age,
      tenure_multiplier: round4(tenure),
      chain_count: protocol.chains.length,
      breadth_multiplier: round4(breadth),
      adjusted_peer_ratio: round4(adjustedRatio),
    },
    farm_steps: plan.map(stepLine),
    farm_plan: plan,
  };
}

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const protocolBySlug = new Map(snapshot.protocols.map((protocol) => [protocol.slug, protocol]));
  const watchlist = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter((protocol) => watchlist.has(protocol.slug) || isEarlyCandidate(protocol));
  const peers = buildPeerIndex(snapshot.protocols);
  const scored = candidates.map((protocol) => scoreCandidate(protocol, snapshot.as_of, peers));
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || bySlug(a, b));

  // The map is intentionally checked separately: a broken input may not silently drop a required row.
  if (snapshot.watchlist.some((slug) => !protocolBySlug.has(slug))) {
    throw new SnapshotError('watchlist contains a slug with no protocol record');
  }
  return scored.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((protocol) => !isPreToken(protocol) && protocol.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || bySlug(a, b))
    .slice(0, 24)
    .map((protocol) => ({
      ...protocol,
      market_cap_to_tvl: protocol.mcap_usd !== null && protocol.tvl_usd > 0 ? round4(protocol.mcap_usd / protocol.tvl_usd) : null,
    }));
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const categories = [...new Set(board.map((row) => row.category ?? 'Other'))].sort((a, b) => a.localeCompare(b));
  const chains = [...new Set(board.flatMap((row) => row.chains))].sort((a, b) => a.localeCompare(b));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((row) => !snapshot.watchlist.includes(row.slug)).length,
    live_size: live.length,
    peer_size: buildPeerIndex(snapshot.protocols).all.length,
    model: {
      version: 'peer-relative-v2',
      formula: 'TVL × shrunk comparable-token market-cap/TVL median × bounded 7d growth × tenure × chain breadth',
      growth_weight: GROWTH_WEIGHT,
      growth_bounds_pct: GROWTH_BOUNDS,
      tenure_floor: TENURE_FLOOR,
      tenure_range: TENURE_RANGE,
      tenure_half_life_days: TENURE_HALF_LIFE_DAYS,
      breadth_weight_per_doubling: BREADTH_WEIGHT_PER_DOUBLING,
      peer_shrinkage_prior: PEER_SHRINKAGE_PRIOR,
      limitations: [
        'The snapshot records no token launch probability, circulating supply, unlock schedule or protocol revenue.',
        'Peer market-cap/TVL ratios are descriptive snapshot analogues, not causal forecasts or promised returns.',
        'A missing token field means DefiLlama records none in this snapshot; it does not prove a token does not exist.',
      ],
    },
    rows: board,
    live,
    categories,
    chains,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json must be an object');
  const value = raw as Record<string, unknown>;
  if (typeof value.as_of !== 'string' || !validDate(value.as_of)) throw new SnapshotError('snapshot.json has an invalid as_of date');
  if (typeof value.source !== 'string' || value.source.length === 0) throw new SnapshotError('snapshot.json has no source label');
  if (typeof value.floor_usd !== 'number' || !Number.isSafeInteger(value.floor_usd) || value.floor_usd < 1) throw new SnapshotError('snapshot.json has an invalid floor_usd');
  if (!Array.isArray(value.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(value.watchlist) || value.watchlist.some((slug) => typeof slug !== 'string')) throw new SnapshotError('snapshot.json has no valid watchlist');

  const protocols = value.protocols.map((entry, index): SnapshotProtocol => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new SnapshotError(`protocol ${index} is not an object`);
    const protocol = entry as Record<string, unknown>;
    if (typeof protocol.slug !== 'string' || protocol.slug.trim().length === 0 || /\s/.test(protocol.slug)) throw new SnapshotError(`protocol ${index} has an invalid slug`);
    if (typeof protocol.name !== 'string' || protocol.name.trim().length === 0) throw new SnapshotError(`protocol ${protocol.slug} has no name`);
    if (typeof protocol.tvl_usd !== 'number' || !Number.isFinite(protocol.tvl_usd) || protocol.tvl_usd < 0) throw new SnapshotError(`protocol ${protocol.slug} has an invalid TVL`);
    const nullableNumber = (field: string): number | null => {
      const candidate = protocol[field];
      if (candidate === null || candidate === undefined) return null;
      if (typeof candidate !== 'number' || !Number.isFinite(candidate)) throw new SnapshotError(`protocol ${protocol.slug} has an invalid ${field}`);
      return candidate;
    };
    const nullableString = (field: string): string | null => {
      const candidate = protocol[field];
      if (candidate === null || candidate === undefined) return null;
      if (typeof candidate !== 'string') throw new SnapshotError(`protocol ${protocol.slug} has an invalid ${field}`);
      return candidate;
    };
    if (!Array.isArray(protocol.chains) || protocol.chains.some((chain) => typeof chain !== 'string')) throw new SnapshotError(`protocol ${protocol.slug} has invalid chains`);
    const category = nullableString('category');
    const listedAt = nullableString('listed_at');
    if (listedAt !== null && !validDate(listedAt)) throw new SnapshotError(`protocol ${protocol.slug} has an invalid listed_at date`);
    return {
      slug: protocol.slug,
      name: protocol.name,
      category,
      chains: [...new Set(protocol.chains as string[])],
      tvl_usd: protocol.tvl_usd,
      change_7d: nullableNumber('change_7d'),
      mcap_usd: nullableNumber('mcap_usd'),
      listed_at: listedAt,
      gecko_id: nullableString('gecko_id'),
      symbol: nullableString('symbol') === '-' ? null : nullableString('symbol'),
    };
  });

  const slugs = new Set<string>();
  for (const protocol of protocols) {
    if (slugs.has(protocol.slug)) throw new SnapshotError(`duplicate protocol slug ${protocol.slug}`);
    slugs.add(protocol.slug);
  }
  const watchlist = value.watchlist as string[];
  if (new Set(watchlist).size !== watchlist.length) throw new SnapshotError('watchlist contains duplicate slugs');
  if (watchlist.some((slug) => !slugs.has(slug))) throw new SnapshotError('watchlist contains a slug with no protocol record');

  return { as_of: value.as_of, source: value.source, floor_usd: value.floor_usd, protocols, watchlist };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4_000) return `board has ${board.length} rows; it needs 100 to 4,000`;
  const source = new Map(snapshot.protocols.map((protocol) => [protocol.slug, protocol]));
  const slugs = new Set<string>();
  for (let index = 0; index < board.length; index++) {
    const row = board[index]!;
    if (slugs.has(row.slug)) return `duplicate row for ${row.slug}`;
    slugs.add(row.slug);
    if (!source.has(row.slug)) return `unknown protocol ${row.slug}`;
    if (row.rank !== index + 1) return `rank ${index + 1} is ${row.rank}`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > MAX_IMPLIED_VALUE) return `${row.slug} has an invalid implied value`;
    if (index > 0 && row.implied_value_usd > board[index - 1]!.implied_value_usd) return `${row.slug} rises above the previous implied value`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    if (row.farm_steps.some((step) => step.trim().length < 20 || step.trim().length > 600)) return `${row.slug} has a farm step outside the 20–600 character limit`;
  }
  for (const slug of snapshot.watchlist) if (!slugs.has(slug)) return `board misses watchlist protocol ${slug}`;
  if (board.length > 1 && board.every((row) => row.implied_value_usd === board[0]!.implied_value_usd)) return 'all board rows share one implied value';
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
