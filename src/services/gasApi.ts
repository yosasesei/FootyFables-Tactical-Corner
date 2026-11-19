import {
  FALLBACK_ARTICLES,
  FALLBACK_LEAGUES,
  FALLBACK_MANAGERS,
  FALLBACK_PLAYERS,
  FALLBACK_TRANSFERS,
  FALLBACK_WORLD_MATCHES,
} from '../data/fallbackData';
import {
  WORLD_MANAGERS,
  buildDynamicManagerProfile,
  normalizeCoachKey,
} from '../data/worldManagers';
import type {
  Article,
  GlobalSearchResult,
  LeagueClub,
  LeagueInfo,
  MarketValuePoint,
  Player,
  PlayerRadarPercentiles,
  PreferredFoot,
  TeamManagerProfile,
  TransferRecord,
  TransferTickerItem,
  WorldMatch,
} from '../types/footy';
import {
  ensureUpToDatePlayerCareer,
  extractTeamTransfersMap,
  type ExtractedTeamTransferData,
} from '../utils/careerHistory';
import {
  applyTelemetryToPlayer,
  clearLeagueStatsCache,
  computeRadarFromStats,
  estimateMarketValueFromProfile,
  extractOptaSeasonFromUrls,
  fetchLeaguePlayerStats,
  getRegisteredLeagueOptaInfo,
  registerLeagueOptaUrls,
  type LeaguePlayerTelemetry,
} from './fotmobStats';
import {
  clearExternalSourcesCache,
  extractTeamRecentMatches,
  fetchTmScraperPlayerBundle,
  getExternalSourcesConfig,
  getSalimtInjuriesMap,
  getSalimtLatestMarketValues,
  lookupSalimtEnrichment,
  normalizeLeagueTransfersToTicker,
  selectCurrentMatchWindow,
} from './externalSources';

export const DEFAULT_GAS_API_URL =
  'https://script.google.com/macros/s/AKfycbyo9NgU03Twi9TuJW78LqULD6lUhaaqs_W-1gPU_GsyHjLZlgYfkp_nKSW3s_9kdCbR1w/exec';

export const PLAYERS_UPDATED_EVENT = 'footyfables:players-updated';
export const MANAGERS_UPDATED_EVENT = 'footyfables:managers-updated';

const KEYS = {
  GAS_URL: 'footyfables_gas_api_url',
  ADMIN_PIN: 'footyfables_admin_pin',
  PLAYERS_CACHE: 'footyfables_players_cache_v3',
  LEGACY_PLAYERS_CACHE_V1: 'footyfables_players_cache_v1',
  LEGACY_PLAYERS_CACHE_V2: 'footyfables_players_cache_v2',
  ARTICLES_CACHE: 'footyfables_articles_cache_v1',
  MANAGERS_CACHE: 'footyfables_managers_cache_v2',
  LEGACY_MANAGERS_CACHE_V1: 'footyfables_managers_cache_v1',
};

export function getGasApiUrl(): string {
  try {
    const local = localStorage.getItem(KEYS.GAS_URL);
    if (local !== null && local.trim() !== '') return local.trim();
  } catch {
    // ignore storage errors
  }
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_GAS_API_URL as string | undefined)
      : undefined;
  if (envUrl && envUrl.trim() !== '') return envUrl.trim();
  return DEFAULT_GAS_API_URL;
}

export function setGasApiUrl(url: string): void {
  try {
    localStorage.setItem(KEYS.GAS_URL, url.trim() || DEFAULT_GAS_API_URL);
  } catch {
    // ignore storage errors
  }
}

export function getAdminPin(): string {
  try {
    return localStorage.getItem(KEYS.ADMIN_PIN) || '2026';
  } catch {
    return '2026';
  }
}

export function setAdminPin(newPin: string): void {
  try {
    if (newPin.trim().length >= 4) {
      localStorage.setItem(KEYS.ADMIN_PIN, newPin.trim());
    }
  } catch {
    // ignore storage errors
  }
}

function isCorruptedLegacyPlayer(p: Player): boolean {
  const zeroCoreStats =
    (p.stats?.xG ?? 0) === 0 &&
    (p.stats?.xA ?? 0) === 0 &&
    (p.stats?.passAccuracy ?? 0) === 0 &&
    (p.stats?.keyPassesPer90 ?? 0) === 0;
  return p.marketValueEur === 15_000_000 && zeroCoreStats;
}

export function getCachedPlayers(): Player[] {
  try {
    // Clear legacy v1/v2 caches that stored stale 2025 MV trends or uniform 2027-06-30 contracts
    if (localStorage.getItem(KEYS.LEGACY_PLAYERS_CACHE_V1)) {
      localStorage.removeItem(KEYS.LEGACY_PLAYERS_CACHE_V1);
    }
    if (localStorage.getItem(KEYS.LEGACY_PLAYERS_CACHE_V2)) {
      localStorage.removeItem(KEYS.LEGACY_PLAYERS_CACHE_V2);
    }
    const raw = localStorage.getItem(KEYS.PLAYERS_CACHE);
    if (raw) {
      const parsed = JSON.parse(raw) as Player[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = parsed
          .filter((p) => p && p.fotmobId && !isCorruptedLegacyPlayer(p))
          .map((p) => ensureUpToDatePlayerCareer(p));
        if (cleaned.length > 0) return cleaned;
      }
    }
  } catch {
    // fallback
  }
  return FALLBACK_PLAYERS;
}

export function saveCachedPlayers(players: Player[]): void {
  try {
    localStorage.setItem(KEYS.PLAYERS_CACHE, JSON.stringify(players));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(PLAYERS_UPDATED_EVENT, { detail: players }));
    }
  } catch {
    // ignore
  }
}

export function mergePlayersIntoCache(incoming: Player[]): Player[] {
  const current = getCachedPlayers();
  const byId = new Map<string, Player>();
  for (const p of current) {
    byId.set(p.fotmobId, p);
  }
  for (const inc of incoming) {
    if (!inc?.fotmobId) continue;
    const prev = byId.get(inc.fotmobId);
    if (!prev) {
      byId.set(inc.fotmobId, inc);
      continue;
    }
    // Keep whichever record has richer verified metrics (never let 0 overwrite non-zero)
    byId.set(inc.fotmobId, {
      ...prev,
      ...inc,
      tmId: inc.tmId || prev.tmId,
      clubId: inc.clubId || prev.clubId,
      secondaryPositions:
        inc.secondaryPositions.length > 0 ? inc.secondaryPositions : prev.secondaryPositions,
      marketValueEur: inc.marketValueEur > 0 ? inc.marketValueEur : prev.marketValueEur,
      highestMarketValueEur: Math.max(
        inc.highestMarketValueEur || 0,
        prev.highestMarketValueEur || 0,
        inc.marketValueEur || 0
      ),
      marketValueHistory:
        inc.marketValueHistory.length >= prev.marketValueHistory.length
          ? inc.marketValueHistory
          : prev.marketValueHistory,
      transferHistory:
        inc.transferHistory.length >= prev.transferHistory.length
          ? inc.transferHistory
          : prev.transferHistory,
      recentMatches:
        inc.recentMatches && inc.recentMatches.some((m) => m.isLiveFixture)
          ? inc.recentMatches
          : inc.recentMatches && inc.recentMatches.length > 0
          ? inc.recentMatches
          : prev.recentMatches,
      optaExtras: {
        ...prev.optaExtras,
        ...inc.optaExtras,
      },
      injuryStatus: inc.injuryStatus !== undefined ? inc.injuryStatus : prev.injuryStatus,
      dataSources: Array.from(
        new Set([...(prev.dataSources || []), ...(inc.dataSources || [])])
      ),
      stats: {
        rating: inc.stats.rating > 0 ? inc.stats.rating : prev.stats.rating,
        minutes: inc.stats.minutes > 0 ? inc.stats.minutes : prev.stats.minutes,
        appearances: inc.stats.appearances > 0 ? inc.stats.appearances : prev.stats.appearances,
        goals: inc.stats.minutes > 0 ? inc.stats.goals : Math.max(inc.stats.goals, prev.stats.goals),
        assists: inc.stats.minutes > 0 ? inc.stats.assists : Math.max(inc.stats.assists, prev.stats.assists),
        xG: inc.stats.xG > 0 ? inc.stats.xG : prev.stats.xG,
        xA: inc.stats.xA > 0 ? inc.stats.xA : prev.stats.xA,
        keyPassesPer90:
          inc.stats.keyPassesPer90 > 0 ? inc.stats.keyPassesPer90 : prev.stats.keyPassesPer90,
        progressiveCarriesPer90:
          inc.stats.progressiveCarriesPer90 > 0
            ? inc.stats.progressiveCarriesPer90
            : prev.stats.progressiveCarriesPer90,
        tacklesInterceptionsPer90:
          inc.stats.tacklesInterceptionsPer90 > 0
            ? inc.stats.tacklesInterceptionsPer90
            : prev.stats.tacklesInterceptionsPer90,
        passAccuracy:
          inc.stats.passAccuracy > 0 ? inc.stats.passAccuracy : prev.stats.passAccuracy,
      },
    });
  }
  const merged = Array.from(byId.values());
  saveCachedPlayers(merged);
  return merged;
}

export function getCachedArticles(): Article[] {
  try {
    const raw = localStorage.getItem(KEYS.ARTICLES_CACHE);
    if (raw) {
      const parsed = JSON.parse(raw) as Article[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback
  }
  return FALLBACK_ARTICLES;
}

export function saveCachedArticles(articles: Article[]): void {
  try {
    localStorage.setItem(KEYS.ARTICLES_CACHE, JSON.stringify(articles));
  } catch {
    // ignore
  }
}

export function mergeManagersList(
  base: TeamManagerProfile[],
  incoming: TeamManagerProfile[]
): TeamManagerProfile[] {
  const byName = new Map<string, TeamManagerProfile>();
  for (const m of base) {
    if (!m?.managerName) continue;
    byName.set(normalizeCoachKey(m.managerName), m);
  }
  for (const inc of incoming) {
    if (!inc?.managerName) continue;
    const key = normalizeCoachKey(inc.managerName);
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, inc);
    } else {
      byName.set(key, {
        ...prev,
        ...inc,
        id: prev.id || inc.id,
        nationality: inc.nationality || prev.nationality,
        age: inc.age || prev.age,
        fotmobCoachId: inc.fotmobCoachId || prev.fotmobCoachId,
        pointsPerGame: inc.pointsPerGame ?? prev.pointsPerGame,
        winRatePct: inc.winRatePct ?? prev.winRatePct,
        matchesManaged: inc.matchesManaged ?? prev.matchesManaged,
        tacticalArchetype: prev.tacticalArchetype || inc.tacticalArchetype,
        trophiesCount: prev.trophiesCount ?? inc.trophiesCount,
        tacticalSummary:
          prev.tacticalSummary && prev.tacticalSummary.length > (inc.tacticalSummary?.length || 0)
            ? prev.tacticalSummary
            : inc.tacticalSummary || prev.tacticalSummary,
        syncedLive: Boolean(prev.syncedLive || inc.syncedLive),
      });
    }
  }
  return Array.from(byName.values());
}

export function getCachedManagers(): TeamManagerProfile[] {
  try {
    if (localStorage.getItem(KEYS.LEGACY_MANAGERS_CACHE_V1)) {
      localStorage.removeItem(KEYS.LEGACY_MANAGERS_CACHE_V1);
    }
    const raw = localStorage.getItem(KEYS.MANAGERS_CACHE);
    if (raw) {
      const parsed = JSON.parse(raw) as TeamManagerProfile[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return mergeManagersList(WORLD_MANAGERS, parsed);
      }
    }
  } catch {
    // fallback
  }
  return FALLBACK_MANAGERS;
}

export function saveCachedManagers(managers: TeamManagerProfile[]): void {
  try {
    localStorage.setItem(KEYS.MANAGERS_CACHE, JSON.stringify(managers));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(MANAGERS_UPDATED_EVENT, { detail: managers }));
    }
  } catch {
    // ignore
  }
}

export function mergeManagersIntoCache(incoming: TeamManagerProfile[]): TeamManagerProfile[] {
  const merged = mergeManagersList(getCachedManagers(), incoming);
  saveCachedManagers(merged);
  return merged;
}

function pickPositiveNumber(...values: unknown[]): number {
  for (const val of values) {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function pickNonZeroStat(fallback: number, ...values: unknown[]): number {
  for (const val of values) {
    if (val === undefined || val === null || val === '') continue;
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

function pickCountStat(fallback: number, ...values: unknown[]): number {
  for (const val of values) {
    if (val === undefined || val === null || val === '') continue;
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return fallback;
}

function normalizeNameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export function namesRoughlyMatch(expectedName: string, actualName: string): boolean {
  const expected = normalizeNameTokens(expectedName);
  const actual = normalizeNameTokens(actualName);
  if (expected.length === 0 || actual.length === 0) return true;
  return expected.some((tok) => actual.includes(tok));
}

function splitPositions(
  rawPosition: unknown,
  fallback?: Player
): { primaryPosition: string; secondaryPositions: string[] } {
  const rawStr = String(rawPosition || '').trim();
  if (!rawStr) {
    return {
      primaryPosition: fallback?.primaryPosition || 'CM',
      secondaryPositions: fallback?.secondaryPositions || [],
    };
  }
  const tokens = rawStr
    .split(/[,/|]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (tokens.length === 0) {
    return {
      primaryPosition: fallback?.primaryPosition || 'CM',
      secondaryPositions: fallback?.secondaryPositions || [],
    };
  }
  const primaryPosition = tokens[0];
  const secondaryPositions =
    tokens.length > 1 ? tokens.slice(1) : fallback?.secondaryPositions || [];
  return { primaryPosition, secondaryPositions };
}

function parseRadarJson(
  raw: unknown,
  stats: Player['stats'],
  primaryPosition: string,
  telemetry?: LeaguePlayerTelemetry
): PlayerRadarPercentiles {
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const obj = JSON.parse(raw) as Partial<PlayerRadarPercentiles>;
      const values = [
        obj.attacking,
        obj.creativity,
        obj.progression,
        obj.defending,
        obj.workrate,
        obj.efficiency,
      ].map(Number);
      if (values.some((v) => Number.isFinite(v) && v > 0)) {
        return {
          attacking: Number(obj.attacking ?? 70),
          creativity: Number(obj.creativity ?? 70),
          progression: Number(obj.progression ?? 72),
          defending: Number(obj.defending ?? 60),
          workrate: Number(obj.workrate ?? 75),
          efficiency: Number(obj.efficiency ?? 75),
        };
      }
    } catch {
      // fall through to computed stats radar
    }
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Partial<PlayerRadarPercentiles>;
    return {
      attacking: Number(obj.attacking ?? 70),
      creativity: Number(obj.creativity ?? 70),
      progression: Number(obj.progression ?? 72),
      defending: Number(obj.defending ?? 60),
      workrate: Number(obj.workrate ?? 75),
      efficiency: Number(obj.efficiency ?? 75),
    };
  }

  return computeRadarFromStats(stats, primaryPosition, {
    lineBreakingPassesPer90: telemetry?.lineBreakingPassesPer90,
    possWonAtt3rdPer90: telemetry?.possWonAtt3rdPer90,
    savePercentage: telemetry?.savePercentage,
  });
}

function normalizePreferredFoot(val: unknown): PreferredFoot {
  const str = String(val || 'Right').toLowerCase();
  if (str.includes('left')) return 'Left';
  if (str.includes('both')) return 'Both';
  return 'Right';
}

export interface NormalizePlayerOptions {
  existing?: Player;
  telemetry?: LeaguePlayerTelemetry;
  teamTransferInfo?: ExtractedTeamTransferData;
  isSearchPreview?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeGasPlayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marketHistoryRaw?: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transferHistoryRaw?: any[],
  options?: NormalizePlayerOptions
): Player {
  const fotmobId = String(raw.fotmob_id || raw.fotmobId || raw.id || '');
  const tmId = String(raw.tm_id || raw.tmId || '');
  const name = String(raw.name || 'Unknown Player');
  const existing = options?.existing;
  const telemetry = options?.telemetry;

  // Match curated fallback record only when ID matches or full name aligns unambiguously
  const fallbackMatch = FALLBACK_PLAYERS.find(
    (fp) =>
      (fotmobId && fp.fotmobId === fotmobId) ||
      fp.name.toLowerCase() === name.toLowerCase()
  );

  const { primaryPosition, secondaryPositions } = splitPositions(
    raw.position || raw.primaryPosition || raw.positionIdsDesc || raw.role?.fallback,
    existing || fallbackMatch
  );

  const rating = Number(
    pickNonZeroStat(
      existing?.stats.rating || fallbackMatch?.stats.rating || 6.85,
      telemetry?.rating,
      raw.rating,
      raw.fotmob_rating
    ).toFixed(2)
  );
  const age = pickNonZeroStat(existing?.age || fallbackMatch?.age || 24, raw.age);
  const heightCm = pickNonZeroStat(
    existing?.heightCm || fallbackMatch?.heightCm || 180,
    raw.height_cm,
    raw.height
  );

  const rawMv = pickPositiveNumber(raw.market_value_eur, raw.marketValueEur, raw.transferValue);
  const existingMv = pickPositiveNumber(existing?.marketValueEur, fallbackMatch?.marketValueEur);

  // Detect polluted GAS legacy €15M row that has zero advanced stats
  const looksLikeCorruptedGas15M =
    rawMv === 15_000_000 &&
    Number(raw.xg ?? 0) === 0 &&
    Number(raw.xa ?? 0) === 0 &&
    Number(raw.pass_accuracy ?? 0) === 0;

  let marketValueEur = !looksLikeCorruptedGas15M && rawMv > 0 ? rawMv : existingMv;
  if (marketValueEur <= 0) {
    marketValueEur = estimateMarketValueFromProfile(rating, age, primaryPosition);
  }

  const minutes = pickNonZeroStat(
    existing?.stats.minutes || fallbackMatch?.stats.minutes || (options?.isSearchPreview ? 0 : 1260),
    telemetry?.minutes,
    raw.minutes_played,
    raw.minutes
  );
  const appearances = pickNonZeroStat(
    existing?.stats.appearances || fallbackMatch?.stats.appearances || (minutes > 0 ? Math.max(1, Math.round(minutes / 76)) : 0),
    telemetry?.appearances,
    raw.appearances
  );

  const hasLiveGoalSource =
    telemetry?.goals !== undefined || (raw.goals !== undefined && raw.goals !== null);
  const goals = hasLiveGoalSource
    ? pickCountStat(0, telemetry?.goals, raw.goals)
    : existing?.stats.goals ?? fallbackMatch?.stats.goals ?? 0;
  const hasLiveAssistSource =
    telemetry?.assists !== undefined || (raw.assists !== undefined && raw.assists !== null);
  const assists = hasLiveAssistSource
    ? pickCountStat(0, telemetry?.assists, raw.assists)
    : existing?.stats.assists ?? fallbackMatch?.stats.assists ?? 0;
  const xG = pickNonZeroStat(
    existing?.stats.xG ?? fallbackMatch?.stats.xG ?? 0,
    telemetry?.xG,
    raw.xg,
    raw.xG
  );
  const xA = pickNonZeroStat(
    existing?.stats.xA ?? fallbackMatch?.stats.xA ?? 0,
    telemetry?.xA,
    raw.xa,
    raw.xA
  );
  const keyPassesPer90 = pickNonZeroStat(
    existing?.stats.keyPassesPer90 ?? fallbackMatch?.stats.keyPassesPer90 ?? 0,
    telemetry?.keyPassesPer90,
    raw.key_passes_p90,
    raw.keyPassesPer90
  );
  const progressiveCarriesPer90 = pickNonZeroStat(
    existing?.stats.progressiveCarriesPer90 ?? fallbackMatch?.stats.progressiveCarriesPer90 ?? 0,
    raw.prog_carries_p90,
    raw.progressiveCarriesPer90
  );
  const tacklesInterceptionsPer90 = pickNonZeroStat(
    existing?.stats.tacklesInterceptionsPer90 ??
      fallbackMatch?.stats.tacklesInterceptionsPer90 ??
      0,
    raw.tackles_int_p90,
    raw.tacklesInterceptionsPer90
  );
  const passAccuracy = pickNonZeroStat(
    existing?.stats.passAccuracy ?? fallbackMatch?.stats.passAccuracy ?? 0,
    telemetry?.passAccuracy,
    raw.pass_accuracy,
    raw.passAccuracy
  );

  const stats: Player['stats'] = {
    rating,
    minutes,
    appearances,
    goals,
    assists,
    xG,
    xA,
    keyPassesPer90,
    progressiveCarriesPer90,
    tacklesInterceptionsPer90,
    passAccuracy,
  };

  const clubName = String(raw.club || raw.teamName || existing?.club || fallbackMatch?.club || 'Unattached');

  const marketValueHistory: MarketValuePoint[] =
    Array.isArray(marketHistoryRaw) && marketHistoryRaw.length > 0
      ? marketHistoryRaw.map((m) => ({
          date: String(m.date || '').slice(0, 7) || '2026-06',
          valueEur: Number(m.value_eur ?? m.valueEur ?? 0) || marketValueEur,
          club: String(m.club_at_date || m.club || clubName),
        }))
      : existing?.marketValueHistory && existing.marketValueHistory.length > 1
      ? existing.marketValueHistory
      : fallbackMatch?.marketValueHistory || [];

  const transferHistory: TransferRecord[] =
    Array.isArray(transferHistoryRaw) && transferHistoryRaw.length > 0
      ? transferHistoryRaw.map((t) => ({
          date: String(t.date || ''),
          season: String(t.season || ''),
          fromClub: String(t.from_club || t.fromClub || ''),
          toClub: String(t.to_club || t.toClub || ''),
          feeEur: t.fee_eur ? Number(t.fee_eur) : null,
          feeLabel: String(t.fee_display || t.feeLabel || 'Undisclosed'),
          type: (String(t.transfer_type || '').toLowerCase().includes('loan')
            ? 'Loan'
            : String(t.fee_display || '').toLowerCase().includes('free')
            ? 'Free'
            : 'Permanent') as TransferRecord['type'],
        }))
      : existing?.transferHistory?.length
      ? existing.transferHistory
      : fallbackMatch?.transferHistory || [];

  const basePlayer: Player = {
    fotmobId: fotmobId || existing?.fotmobId || fallbackMatch?.fotmobId || '0',
    tmId: tmId || existing?.tmId || fallbackMatch?.tmId || '',
    name,
    nationality: String(
      raw.nationality || raw.cname || existing?.nationality || fallbackMatch?.nationality || 'International'
    ),
    age,
    heightCm,
    preferredFoot: normalizePreferredFoot(
      raw.preferred_foot || existing?.preferredFoot || fallbackMatch?.preferredFoot
    ),
    primaryPosition,
    secondaryPositions,
    roleTag: String(
      raw.role_tag || existing?.roleTag || fallbackMatch?.roleTag || `${primaryPosition} Specialist`
    ),
    club: clubName,
    clubId: String(raw.club_id || raw.clubId || raw.team_id || existing?.clubId || fallbackMatch?.clubId || ''),
    league: String(raw.league || existing?.league || fallbackMatch?.league || 'Top Flight'),
    contractUntil: String(
      raw.contract_until || raw.contractUntil || existing?.contractUntil || fallbackMatch?.contractUntil || ''
    ),
    marketValueEur,
    marketValueChangePct: Number(
      raw.mv_change_pct ?? existing?.marketValueChangePct ?? fallbackMatch?.marketValueChangePct ?? 0
    ),
    highestMarketValueEur: Math.max(
      pickPositiveNumber(
        raw.highest_mv_eur,
        existing?.highestMarketValueEur,
        fallbackMatch?.highestMarketValueEur
      ),
      marketValueEur,
      ...marketValueHistory.map((m) => m.valueEur || 0)
    ),
    highestMarketValueDate: String(
      raw.highest_mv_date ||
        existing?.highestMarketValueDate ||
        fallbackMatch?.highestMarketValueDate ||
        '2026-11'
    ),
    syncedToSheets: Boolean(raw.is_cached ?? raw.last_synced ?? true),
    stats,
    radar: parseRadarJson(raw.radar_json, stats, primaryPosition, telemetry),
    marketValueHistory,
    transferHistory,
    recentMatches: Array.isArray(raw.recentMatches)
      ? raw.recentMatches
      : existing?.recentMatches || fallbackMatch?.recentMatches,
  };

  const withTelemetry = telemetry ? applyTelemetryToPlayer(basePlayer, telemetry) : basePlayer;
  return ensureUpToDatePlayerCareer(withTelemetry, options?.teamTransferInfo);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gasGet<T = any>(action: string, params: Record<string, string> = {}): Promise<T | null> {
  const baseUrl = getGasApiUrl();
  if (!baseUrl) return null;

  const qs = new URLSearchParams({ action, ...params });
  const separator = baseUrl.includes('?') ? '&' : '?';
  const targetUrl = `${baseUrl}${separator}${qs.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
    });
    if (!response.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    if (data && data.status === 'error') return null;
    return data as T;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gasPost<T = any>(action: string, payload: unknown): Promise<T | null> {
  const baseUrl = getGasApiUrl();
  if (!baseUrl) return null;

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({ action, data: payload }),
    });
    if (!response.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    if (data && data.status === 'error') return null;
    return data as T;
  } catch {
    return null;
  }
}

export async function searchGlobal(query: string): Promise<GlobalSearchResult> {
  const clean = query.trim().toLowerCase();
  const remote = await gasGet('searchGlobal', { q: query.trim() });

  const localPlayers = getCachedPlayers();
  const cachedById = new Map<string, Player>(localPlayers.map((p) => [p.fotmobId, p]));
  const filteredLocalPlayers = clean
    ? localPlayers.filter(
        (p) =>
          p.name.toLowerCase().includes(clean) ||
          p.club.toLowerCase().includes(clean) ||
          p.primaryPosition.toLowerCase().includes(clean) ||
          p.league.toLowerCase().includes(clean)
      )
    : localPlayers.slice(0, 8);

  const localClubs: GlobalSearchResult['clubs'] = [];
  for (const league of FALLBACK_LEAGUES) {
    for (const club of league.clubs) {
      if (
        !clean ||
        club.name.toLowerCase().includes(clean) ||
        club.manager.toLowerCase().includes(clean) ||
        league.name.toLowerCase().includes(clean)
      ) {
        localClubs.push({
          id: club.id,
          name: club.name,
          leagueId: league.id,
          leagueName: league.name,
          manager: club.manager,
        });
      }
    }
  }

  // Handle real GAS response shape: { status: 'success', results: { players: [...], clubs: [...] } }
  const remotePlayersRaw = remote?.results?.players || remote?.players || remote?.data?.players;
  const remoteClubsRaw = remote?.results?.clubs || remote?.clubs || remote?.data?.clubs;

  if (Array.isArray(remotePlayersRaw)) {
    const normalizedRemote = remotePlayersRaw
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => r && (r.fotmob_id || r.fotmobId || r.id))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        const pid = String(r.fotmob_id || r.fotmobId || r.id);
        return normalizeGasPlayer(r, undefined, undefined, {
          existing: cachedById.get(pid),
          isSearchPreview: true,
        });
      });

    const mergedPlayers = [...normalizedRemote];
    for (const lp of filteredLocalPlayers) {
      if (!mergedPlayers.some((rp) => rp.fotmobId === lp.fotmobId)) {
        mergedPlayers.push(lp);
      }
    }

    return {
      players: mergedPlayers,
      clubs:
        Array.isArray(remoteClubsRaw) && remoteClubsRaw.length > 0
          ? remoteClubsRaw
          : localClubs,
      source: 'hybrid-sheets-proxy',
    };
  }

  return {
    players: filteredLocalPlayers,
    clubs: localClubs.slice(0, 6),
    source: 'local-cache',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const leaguePayloadCache = new Map<string, any>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ingestLeagueTelemetryAndCache(leagueId: string, remote: any): void {
  if (!remote?.data) return;
  leaguePayloadCache.set(leagueId, remote);
  const playerStatRows = remote?.data?.stats?.players;
  if (Array.isArray(playerStatRows) && playerStatRows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const urls = playerStatRows.map((p: any) => String(p?.fetchAllUrl || '')).filter(Boolean);
    const extracted = extractOptaSeasonFromUrls(urls);
    if (extracted?.urls.length) {
      registerLeagueOptaUrls(leagueId, extracted.seasonId, extracted.urls);
    }
  }
}

export async function getLeague(leagueId: string): Promise<LeagueInfo> {
  const remote = await gasGet('getLeague', { id: leagueId });
  const fallbackLeague =
    FALLBACK_LEAGUES.find((l) => l.id === leagueId) || FALLBACK_LEAGUES[0];

  ingestLeagueTelemetryAndCache(leagueId, remote);

  // Parse FotMob league table shape returned by GAS proxy
  const rawTable =
    remote?.data?.table?.[0]?.data?.table?.all ||
    remote?.data?.table?.[0]?.data?.tables?.[0]?.table?.all;

  if (remote?.data?.details && Array.isArray(rawTable) && rawTable.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clubs: LeagueClub[] = rawTable.slice(0, 20).map((row: any) => {
      const fbClub = fallbackLeague.clubs.find(
        (c) => c.id === String(row.id) || c.name.toLowerCase() === String(row.name || '').toLowerCase()
      );
      return {
        id: String(row.id),
        name: String(row.name || 'Club'),
        shortName: String(row.shortName || row.name || 'CLB').slice(0, 3).toUpperCase(),
        leagueId: String(remote.data.details.id || leagueId),
        position: Number(row.idx || 1),
        points: Number(row.pts || 0),
        manager: fbClub?.manager || 'First Team Coach',
        formation: fbClub?.formation || '4-3-3',
        squadPlayerIds: fbClub?.squadPlayerIds || [],
      };
    });

    return {
      id: String(remote.data.details.id || leagueId),
      name: String(remote.data.details.name || fallbackLeague.name),
      country: String(remote.data.details.country || fallbackLeague.country),
      tier: fallbackLeague.tier,
      clubs,
    };
  }

  return fallbackLeague;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initialDataBundlePromise: Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marketByPid: Map<string, any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transfersByPid: Map<string, any[]>;
  managers: TeamManagerProfile[];
} | null> | null = null;

function extractPidFromSheetKey(val: unknown): string {
  const s = String(val || '').trim();
  return s.replace(/^PLR-/i, '');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSheetManagerRow(raw: any): TeamManagerProfile | null {
  const name = String(raw?.manager_name || raw?.managerName || '').trim();
  const clubName = String(raw?.team_name || raw?.clubName || '').trim();
  if (!name) return null;
  return buildDynamicManagerProfile({
    coachId: raw?.team_id || raw?.id,
    name,
    clubName: clubName || 'Club',
    league: String(raw?.league || 'Top Flight'),
    formation: String(raw?.primary_formation || raw?.primaryFormation || '4-2-3-1'),
  });
}

async function fetchInitialDataBundle(force = false) {
  if (force || !initialDataBundlePromise) {
    initialDataBundlePromise = gasGet('getInitialData')
      .then((res) => {
        if (!res) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const marketByPid = new Map<string, any[]>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transfersByPid = new Map<string, any[]>();

        if (Array.isArray(res.marketHistory)) {
          for (const row of res.marketHistory) {
            const pid = extractPidFromSheetKey(row?.player_id || row?.fotmob_id);
            if (!pid) continue;
            const list = marketByPid.get(pid) || [];
            list.push(row);
            marketByPid.set(pid, list);
          }
        }
        if (Array.isArray(res.transferHistory)) {
          for (const row of res.transferHistory) {
            const pid = extractPidFromSheetKey(row?.player_id || row?.fotmob_id);
            if (!pid) continue;
            const list = transfersByPid.get(pid) || [];
            list.push(row);
            transfersByPid.set(pid, list);
          }
        }

        const managers: TeamManagerProfile[] = [];
        if (Array.isArray(res.teams)) {
          for (const t of res.teams) {
            const m = normalizeSheetManagerRow(t);
            if (m) managers.push(m);
          }
        }
        if (managers.length > 0) {
          mergeManagersIntoCache(managers);
        }

        return { marketByPid, transfersByPid, managers };
      })
      .catch(() => null);
  }
  return initialDataBundlePromise;
}

export async function getTeam(
  teamId: string,
  options?: { forceRefresh?: boolean }
): Promise<{ club: LeagueClub; players: Player[] } | null> {
  const queryParams: Record<string, string> = { id: teamId };
  if (options?.forceRefresh) {
    queryParams.refresh = '1';
    queryParams._t = String(Date.now());
  }

  const [remote, initialBundle] = await Promise.all([
    gasGet('getTeam', queryParams),
    fetchInitialDataBundle(false),
  ]);
  const allPlayers = getCachedPlayers();
  const cachedById = new Map<string, Player>(allPlayers.map((p) => [p.fotmobId, p]));

  // Parse FotMob team squad shape returned by GAS proxy
  const squadGroups = remote?.data?.squad?.squad || remote?.data?.squad;
  if (remote?.data?.details && Array.isArray(squadGroups)) {
    let coachName = 'First Team Manager';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let coachMeta: any = null;
    const membersList: Player[] = [];
    const clubName = String(remote.data.details.name || 'Club');

    // Extract live league/season telemetry URLs provided in FotMob team payload (or registered league Opta URLs)
    const primaryLeagueId = String(
      remote?.data?.stats?.primaryLeagueId ||
        remote?.data?.details?.primaryLeagueId ||
        remote?.data?.fixtures?.primaryTournamentId ||
        ''
    );
    const registeredOpta = primaryLeagueId
      ? getRegisteredLeagueOptaInfo(primaryLeagueId)
      : undefined;
    const customUrls: string[] = Array.isArray(remote?.data?.stats?.players)
      ? remote.data.stats.players
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((s: any) => String(s?.fetchAllUrl || ''))
          .filter(Boolean)
      : registeredOpta?.urls || [];
    const primarySeasonId = String(
      remote?.data?.stats?.primarySeasonId ||
        registeredOpta?.seasonId ||
        extractOptaSeasonFromUrls(customUrls)?.seasonId ||
        ''
    );

    const sourcesCfg = getExternalSourcesConfig();
    const [telemetryMap, salimtMvMap, salimtInjuryMap] = await Promise.all([
      sourcesCfg.enableOptaFeed && primaryLeagueId && primarySeasonId
        ? fetchLeaguePlayerStats(primaryLeagueId, primarySeasonId, customUrls).catch(
            () => new Map<string, LeaguePlayerTelemetry>()
          )
        : Promise.resolve(new Map<string, LeaguePlayerTelemetry>()),
      sourcesCfg.enableSalimtDataset
        ? getSalimtLatestMarketValues().catch(() => new Map())
        : Promise.resolve(new Map()),
      sourcesCfg.enableSalimtDataset
        ? getSalimtInjuriesMap().catch(() => new Map())
        : Promise.resolve(new Map()),
    ]);

    const teamTransfersMap = extractTeamTransfersMap(remote.data);

    const leagueMeta = FALLBACK_LEAGUES.find(
      (lg) =>
        lg.id === String(primaryLeagueId || '') ||
        lg.clubs.some((c) => c.id === String(teamId))
    );
    const resolvedLeagueName = leagueMeta?.name || remote.data.details.primaryLeagueName || 'Top Flight';

    for (const group of squadGroups) {
      if (group.title === 'coach' && Array.isArray(group.members) && group.members[0]) {
        coachMeta = group.members[0];
        coachName = String(coachMeta.name || coachName);
        continue;
      }
      if (Array.isArray(group.members)) {
        for (const m of group.members) {
          const memberId = String(m.id || '');
          const prevCached = cachedById.get(memberId);
          const tmId = String(m.tmId || prevCached?.tmId || '');
          const salimtMv = tmId ? salimtMvMap.get(tmId) : undefined;
          const salimtInj = tmId ? salimtInjuryMap.get(tmId) : undefined;

          const normalized = normalizeGasPlayer(
            {
              ...m,
              fotmob_id: memberId,
              tm_id: tmId,
              club: clubName,
              club_id: String(remote.data.details.id || teamId),
              league: resolvedLeagueName,
              position: m.positionIdsDesc || m.role?.fallback || 'CM',
              rating: m.rating,
              transferValue: m.transferValue || salimtMv?.valueEur,
            },
            initialBundle?.marketByPid.get(memberId),
            initialBundle?.transfersByPid.get(memberId),
            {
              existing: prevCached,
              telemetry: telemetryMap.get(memberId),
              teamTransferInfo: teamTransfersMap.get(memberId),
            }
          );

          const recentMatches = extractTeamRecentMatches(remote.data, normalized, 10);
          const sources = Array.from(
            new Set([
              ...(normalized.dataSources || []),
              'FotMob Squad Live',
              ...(salimtMv || salimtInj ? ['salimt/football-datasets'] : []),
            ])
          );

          membersList.push({
            ...normalized,
            recentMatches:
              recentMatches.length > 0 ? recentMatches : normalized.recentMatches,
            injuryStatus: salimtInj
              ? {
                  reason: salimtInj.reason,
                  season: salimtInj.season,
                  fromDate: salimtInj.fromDate,
                  endDate: salimtInj.endDate,
                  gamesMissed: salimtInj.gamesMissed,
                  source: 'salimt/football-datasets (2026-09)',
                }
              : normalized.injuryStatus,
            dataSources: sources,
          });
        }
      }
    }

    // Extract & cache live coach profile + FotMob coachHistory telemetry
    if (coachMeta?.name) {
      const coachHistory =
        remote?.data?.overview?.coachHistory ||
        remote?.data?.history?.coachHistory ||
        [];
      const liveCoachProfile = buildDynamicManagerProfile({
        coachId: coachMeta.id,
        name: coachName,
        clubName,
        league: resolvedLeagueName,
        age: Number(coachMeta.age || 0),
        nationality: coachMeta.cname ? String(coachMeta.cname) : undefined,
        coachHistory: Array.isArray(coachHistory) ? coachHistory : [],
      });
      mergeManagersIntoCache([liveCoachProfile]);
    }

    if (membersList.length > 0) {
      mergePlayersIntoCache(membersList);
      return {
        club: {
          id: String(remote.data.details.id || teamId),
          name: clubName,
          shortName: String(remote.data.details.shortName || clubName)
            .slice(0, 3)
            .toUpperCase(),
          leagueId: String(primaryLeagueId || leagueMeta?.id || ''),
          position: 1,
          points: 0,
          manager: coachName,
          formation: '4-3-3',
          squadPlayerIds: membersList.map((p) => p.fotmobId),
        },
        players: membersList,
      };
    }
  }

  for (const league of FALLBACK_LEAGUES) {
    const foundClub = league.clubs.find((c) => c.id === teamId);
    if (foundClub) {
      const players = allPlayers.filter(
        (p) =>
          p.clubId === foundClub.id ||
          foundClub.squadPlayerIds.includes(p.fotmobId) ||
          p.club.toLowerCase() === foundClub.name.toLowerCase()
      );
      return { club: foundClub, players };
    }
  }
  return null;
}

function needsTelemetryHydration(player: Player | undefined): boolean {
  if (!player) return true;
  if (player.marketValueEur <= 0) return true;
  if (player.stats.xG === 0 && player.stats.xA === 0 && player.stats.passAccuracy === 0) return true;
  if (!player.marketValueHistory.some((m) => m.date >= '2026-01')) return true;
  if (player.transferHistory.length === 0) return true;
  if (!player.recentMatches || !player.recentMatches.some((m) => m.isLiveFixture)) return true;
  if (!player.dataSources?.includes('Opta/FotMob Live')) return true;
  return false;
}

async function applyMultiSourceEnrichmentToPlayer(
  basePlayer: Player,
  params: { tmId?: string; name?: string }
): Promise<Player> {
  const sourcesCfg = getExternalSourcesConfig();
  const [tmScraperBundle, salimtInfo] = await Promise.all([
    sourcesCfg.tmScraperUrl
      ? fetchTmScraperPlayerBundle({
          tmId: params.tmId || basePlayer.tmId,
          playerName: params.name || basePlayer.name,
        }).catch(() => null)
      : Promise.resolve(null),
    sourcesCfg.enableSalimtDataset
      ? lookupSalimtEnrichment({
          tmId: params.tmId || basePlayer.tmId,
          name: params.name || basePlayer.name,
          includeProfiles: true,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  let next = { ...basePlayer };
  const sources = new Set<string>(basePlayer.dataSources || []);

  if (salimtInfo) {
    sources.add('salimt/football-datasets');
    next = {
      ...next,
      tmId: next.tmId || salimtInfo.tmId || '',
      contractUntil:
        salimtInfo.contractUntil && salimtInfo.contractUntil > '2026-06-30'
          ? salimtInfo.contractUntil
          : next.contractUntil,
      heightCm: salimtInfo.heightCm && salimtInfo.heightCm > 140 ? salimtInfo.heightCm : next.heightCm,
      preferredFoot: salimtInfo.preferredFoot || next.preferredFoot,
      marketValueEur:
        next.marketValueEur <= 0 && salimtInfo.marketValueEur
          ? salimtInfo.marketValueEur
          : next.marketValueEur,
      injuryStatus: salimtInfo.injuryStatus ?? next.injuryStatus,
    };
  }

  if (tmScraperBundle) {
    sources.add('Transfermarkt Scraper API');
    const p = tmScraperBundle.profile;
    next = {
      ...next,
      tmId: tmScraperBundle.tmId || next.tmId,
      contractUntil: p?.contractUntil || next.contractUntil,
      heightCm: p?.heightCm || next.heightCm,
      preferredFoot: p?.foot || next.preferredFoot,
      marketValueEur: p?.marketValueEur && p.marketValueEur > 0 ? p.marketValueEur : next.marketValueEur,
      marketValueHistory:
        tmScraperBundle.marketHistory.length > 0
          ? [...next.marketValueHistory, ...tmScraperBundle.marketHistory]
          : next.marketValueHistory,
      transferHistory:
        tmScraperBundle.transfers.length > 0
          ? [...tmScraperBundle.transfers, ...next.transferHistory]
          : next.transferHistory,
    };
  }

  next.dataSources = Array.from(sources);
  return ensureUpToDatePlayerCareer(next);
}

export async function getPlayer(params: {
  fotmobId: string;
  tmId?: string;
  name?: string;
  clubId?: string;
  forceRefresh?: boolean;
}): Promise<Player | null> {
  const cachedList = getCachedPlayers();
  const cachedById = cachedList.find((p) => p.fotmobId === params.fotmobId);
  const cachedByName = params.name
    ? cachedList.find((p) => p.name.toLowerCase() === params.name!.toLowerCase())
    : undefined;
  const existing = cachedById || cachedByName;

  if (params.forceRefresh) {
    clearLeagueStatsCache();
  }

  const queryParams: Record<string, string> = { fotmobId: params.fotmobId };
  if (params.tmId) queryParams.tmId = params.tmId;
  if (params.name) queryParams.name = params.name;
  if (params.forceRefresh) {
    queryParams.refresh = '1';
    queryParams.force = '1';
    queryParams._t = String(Date.now());
  }

  const [remote, initialBundle] = await Promise.all([
    gasGet('getPlayer', queryParams),
    fetchInitialDataBundle(false),
  ]);

  // Guard against GAS sheet row ID collisions (e.g. a different player cached under another player's fotmobId)
  const rawRemotePlayer =
    remote?.player && (remote.player.fotmob_id || remote.player.fotmobId || remote.player.name)
      ? remote.player
      : null;

  const remoteNameValid =
    rawRemotePlayer &&
    (!params.name ||
      !rawRemotePlayer.name ||
      namesRoughlyMatch(params.name, String(rawRemotePlayer.name)));

  const initialMvHistory = initialBundle?.marketByPid.get(params.fotmobId);
  const initialTrHistory = initialBundle?.transfersByPid.get(params.fotmobId);

  let candidate: Player | null = null;
  if (rawRemotePlayer && remoteNameValid) {
    const remoteMv =
      Array.isArray(remote?.marketHistory) && remote.marketHistory.length > 0
        ? remote.marketHistory
        : initialMvHistory;
    const remoteTr =
      Array.isArray(remote?.transferHistory) && remote.transferHistory.length > 0
        ? remote.transferHistory
        : initialTrHistory;

    candidate = normalizeGasPlayer(
      {
        ...rawRemotePlayer,
        fotmob_id: params.fotmobId || rawRemotePlayer.fotmob_id,
        club_id: params.clubId || rawRemotePlayer.club_id,
      },
      remoteMv,
      remoteTr,
      { existing }
    );
    candidate.dataSources = Array.from(
      new Set([...(candidate.dataSources || []), 'Google Sheets Proxy'])
    );
  } else if (existing) {
    candidate = ensureUpToDatePlayerCareer(existing);
  }

  // Resolve clubId for full live FotMob/Opta squad + league stats hydration
  let targetClubId = params.clubId || candidate?.clubId || existing?.clubId || '';
  if (!targetClubId && (params.name || candidate?.name)) {
    const lookupName = params.name || candidate!.name;
    const searchRes = await searchGlobal(lookupName);
    const matched = searchRes.players.find(
      (sp) => sp.fotmobId === params.fotmobId || namesRoughlyMatch(lookupName, sp.name)
    );
    if (matched?.clubId) targetClubId = matched.clubId;
  }

  // Pull live club squad + CORS-open data.fotmob.com Opta stats + live fixtures whenever sparse or forced
  if (targetClubId && (params.forceRefresh || needsTelemetryHydration(candidate || undefined))) {
    const teamBundle = await getTeam(targetClubId, { forceRefresh: params.forceRefresh });
    if (teamBundle) {
      const liveMember =
        teamBundle.players.find((m) => m.fotmobId === params.fotmobId) ||
        (params.name
          ? teamBundle.players.find((m) => namesRoughlyMatch(params.name!, m.name))
          : undefined);

      if (liveMember) {
        const baseMerged = candidate
          ? {
              ...candidate,
              ...liveMember,
              fotmobId: liveMember.fotmobId || candidate.fotmobId,
              tmId: candidate.tmId || liveMember.tmId,
              contractUntil: liveMember.contractUntil || candidate.contractUntil,
              marketValueEur:
                liveMember.marketValueEur > 0 ? liveMember.marketValueEur : candidate.marketValueEur,
              marketValueHistory:
                liveMember.marketValueHistory.length >= candidate.marketValueHistory.length
                  ? liveMember.marketValueHistory
                  : candidate.marketValueHistory,
              transferHistory:
                liveMember.transferHistory.length >= candidate.transferHistory.length
                  ? liveMember.transferHistory
                  : candidate.transferHistory,
              recentMatches:
                liveMember.recentMatches && liveMember.recentMatches.length > 0
                  ? liveMember.recentMatches
                  : candidate.recentMatches,
              dataSources: Array.from(
                new Set([...(candidate.dataSources || []), ...(liveMember.dataSources || [])])
              ),
              syncedToSheets: true,
            }
          : { ...liveMember, syncedToSheets: true };

        const enriched = await applyMultiSourceEnrichmentToPlayer(baseMerged, {
          tmId: params.tmId || baseMerged.tmId,
          name: params.name || baseMerged.name,
        });
        mergePlayersIntoCache([enriched]);
        return enriched;
      }
    }
  }

  if (candidate) {
    const enriched = await applyMultiSourceEnrichmentToPlayer(
      { ...candidate, syncedToSheets: true },
      { tmId: params.tmId || candidate.tmId, name: params.name || candidate.name }
    );
    mergePlayersIntoCache([enriched]);
    return enriched;
  }

  return null;
}

const MAJOR_TRANSFER_LEAGUE_IDS = ['47', '87', '54', '55', '53'];

export async function getTransfers(): Promise<TransferTickerItem[]> {
  const [globalRemote, ...leagueResponses] = await Promise.allSettled([
    gasGet('getTransfers'),
    ...MAJOR_TRANSFER_LEAGUE_IDS.map(async (lid) => {
      const cached = leaguePayloadCache.get(lid);
      if (cached) return { lid, res: cached };
      const res = await gasGet('getLeague', { id: lid });
      if (res) ingestLeagueTelemetryAndCache(lid, res);
      return { lid, res };
    }),
  ]);

  const combined: TransferTickerItem[] = [];

  // 1. Live global transfer ticker
  if (globalRemote.status === 'fulfilled' && globalRemote.value) {
    const rawTransfers = globalRemote.value?.data?.transfers || globalRemote.value?.transfers;
    if (Array.isArray(rawTransfers)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [idx, t] of rawTransfers.slice(0, 25).entries() as IterableIterator<[number, any]>) {
        const feeText = t.fee?.feeText || (t.onLoan ? 'Loan' : 'Undisclosed');
        const amt = t.amountEuroEstimated;
        const feeLabel = amt
          ? `€${(Number(amt) / 1_000_000).toFixed(1)}M`
          : String(feeText);
        const dateStr = t.transferDate ? String(t.transferDate).slice(0, 10) : '2026-11';
        combined.push({
          id: `live-tr-${t.playerId || idx}-${dateStr}`,
          playerFotmobId: String(t.playerId || ''),
          playerName: String(t.name || 'Player'),
          position: String(t.position?.label || 'CM'),
          age: Number(t.age || 24),
          fromClub: String(t.fromClub || 'Previous Club'),
          toClub: String(t.toClub || 'Destination'),
          feeLabel,
          status: t.contractExtension || t.transferType?.text ? 'Confirmed' : 'Rumor',
          reliability: 'FotMob Global Live',
          updatedAt: dateStr,
          clubId: String(t.toClubId || t.fromClubId || ''),
          source: 'FotMob Live',
        });
      }
    }
  }

  // 2. Major 5 European Leagues official transfers from live league feeds
  for (const lr of leagueResponses) {
    if (lr.status !== 'fulfilled' || !lr.value?.res?.data) continue;
    const { lid, res } = lr.value;
    const lgName =
      String(res.data?.details?.name || '') ||
      FALLBACK_LEAGUES.find((l) => l.id === lid)?.name ||
      'Major League';
    const rawLeagueTransfers = res.data?.transfers?.data;
    if (Array.isArray(rawLeagueTransfers)) {
      combined.push(...normalizeLeagueTransfersToTicker(rawLeagueTransfers.slice(0, 12), lgName));
    }
  }

  if (combined.length > 0) {
    const deduped = new Map<string, TransferTickerItem>();
    for (const item of combined) {
      const key = `${item.playerName.toLowerCase()}|${item.toClub.toLowerCase()}`;
      if (!deduped.has(key)) {
        deduped.set(key, item);
      }
    }
    return Array.from(deduped.values())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 45);
  }

  return FALLBACK_TRANSFERS;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLeaguePayloadToWorldMatches(leagueId: string, remote: any, limit: number): WorldMatch[] {
  const rawMatches =
    (Array.isArray(remote?.data?.fixtures?.allMatches) && remote.data.fixtures.allMatches) ||
    (Array.isArray(remote?.data?.overview?.leagueOverviewMatches) &&
      remote.data.overview.leagueOverviewMatches) ||
    (Array.isArray(remote?.data?.matches?.allMatches) && remote.data.matches.allMatches) ||
    [];

  if (rawMatches.length === 0) return [];

  const leagueMeta = FALLBACK_LEAGUES.find((l) => l.id === leagueId);
  const windowed = selectCurrentMatchWindow(rawMatches, limit);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return windowed.map((m: any, idx: number) => {
    const homeName = String(m.home?.name || m.home?.shortName || 'Home Club');
    const awayName = String(m.away?.name || m.away?.shortName || 'Away Club');
    const finished = Boolean(m.status?.finished);
    const started = Boolean(m.status?.started);
    const status: WorldMatch['status'] = finished
      ? 'Finished'
      : started
      ? 'Live'
      : 'Upcoming';

    const homeScore = m.home?.score;
    const awayScore = m.away?.score;
    const fallbackScore =
      finished && homeScore !== undefined && awayScore !== undefined
        ? `${homeScore} - ${awayScore}`
        : undefined;

    return {
      id: `live-match-${leagueId}-${m.id || idx}`,
      leagueId,
      leagueName: String(remote?.data?.details?.name || leagueMeta?.name || 'League'),
      country: String(remote?.data?.details?.country || leagueMeta?.country || 'World'),
      round: m.roundName ? `Matchday ${m.roundName}` : 'Season Fixture',
      kickoffIso: String(m.status?.utcTime || new Date().toISOString()),
      kickoffDisplay: finished
        ? `FT · ${String(m.status?.utcTime || '').slice(5, 10)}`
        : started
        ? String(m.status?.liveTime?.short || 'Live')
        : String(m.status?.utcTime || '').slice(5, 16).replace('T', ' '),
      status,
      scoreDisplay: m.status?.scoreStr ? String(m.status.scoreStr) : fallbackScore,
      venue: String(m.venue?.name || 'Match Stadium'),
      homeClubId: String(m.home?.id || ''),
      homeClubName: homeName,
      homeShortName: String(m.home?.shortName || homeName).slice(0, 3).toUpperCase(),
      homeFormation: '4-3-3-holding',
      awayClubId: String(m.away?.id || ''),
      awayClubName: awayName,
      awayShortName: String(m.away?.shortName || awayName).slice(0, 3).toUpperCase(),
      awayFormation: '4-2-3-1',
    };
  });
}

const WORLD_MATCH_LEAGUE_IDS = ['47', '87', '54', '55', '53', '42'];

export async function getWorldMatches(leagueId?: string): Promise<WorldMatch[]> {
  if (leagueId && leagueId !== 'all') {
    const cached = leaguePayloadCache.get(leagueId);
    const remote = cached || (await gasGet('getLeague', { id: leagueId }));
    if (remote) ingestLeagueTelemetryAndCache(leagueId, remote);
    const mapped = mapLeaguePayloadToWorldMatches(leagueId, remote, 15);
    if (mapped.length > 0) return mapped;
    return FALLBACK_WORLD_MATCHES.filter((m) => m.leagueId === leagueId);
  }

  // Live multi-league aggregation across top world competitions
  const results = await Promise.allSettled(
    WORLD_MATCH_LEAGUE_IDS.map(async (lid) => {
      const cached = leaguePayloadCache.get(lid);
      const remote = cached || (await gasGet('getLeague', { id: lid }));
      if (remote) ingestLeagueTelemetryAndCache(lid, remote);
      return mapLeaguePayloadToWorldMatches(lid, remote, 4);
    })
  );

  const liveAll: WorldMatch[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      liveAll.push(...r.value);
    }
  }

  if (liveAll.length > 0) {
    const statusOrder: Record<WorldMatch['status'], number> = {
      Live: 0,
      Upcoming: 1,
      Finished: 2,
    };
    return liveAll.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      if (a.status === 'Finished') {
        return b.kickoffIso.localeCompare(a.kickoffIso);
      }
      return a.kickoffIso.localeCompare(b.kickoffIso);
    });
  }

  return FALLBACK_WORLD_MATCHES;
}

export async function fetchArticles(): Promise<Article[]> {
  const remote = await gasGet<Article[]>('getArticles');
  if (remote && Array.isArray(remote) && remote.length > 0) {
    saveCachedArticles(remote);
    return remote;
  }
  return getCachedArticles();
}

export async function saveArticle(
  article: Article
): Promise<{ ok: boolean; syncedToSheets: boolean; articles: Article[] }> {
  const current = getCachedArticles();
  const exists = current.some((a) => a.id === article.id);
  const next = exists
    ? current.map((a) => (a.id === article.id ? article : a))
    : [article, ...current];
  saveCachedArticles(next);

  const remote = await gasPost<{ ok?: boolean; status?: string }>('saveArticle', article);
  return {
    ok: true,
    syncedToSheets: Boolean(remote && remote.status !== 'error'),
    articles: next,
  };
}

export async function fetchManagers(): Promise<TeamManagerProfile[]> {
  const [remote, initialBundle] = await Promise.all([
    gasGet<TeamManagerProfile[]>('getManagers'),
    fetchInitialDataBundle(false),
  ]);
  const incoming: TeamManagerProfile[] = [
    ...(Array.isArray(remote) ? remote : []),
    ...(initialBundle?.managers || []),
  ];
  const merged = mergeManagersList(getCachedManagers(), incoming);
  saveCachedManagers(merged);
  return merged;
}

export async function saveManager(
  manager: TeamManagerProfile
): Promise<{ ok: boolean; syncedToSheets: boolean; managers: TeamManagerProfile[] }> {
  const current = getCachedManagers();
  const exists = current.some((m) => m.id === manager.id);
  const next = exists
    ? current.map((m) => (m.id === manager.id ? manager : m))
    : [manager, ...current];
  saveCachedManagers(next);

  const remote = await gasPost<{ ok?: boolean; status?: string }>('saveManager', manager);
  return {
    ok: true,
    syncedToSheets: Boolean(remote && remote.status !== 'error'),
    managers: next,
  };
}

const CORE_REFRESH_CLUB_IDS = ['9825', '8456', '8650', '8634', '8633', '9847', '9823', '8636'];

export async function forceRefreshPlayerCache(): Promise<{
  refreshedCount: number;
  syncedToSheets: boolean;
}> {
  clearLeagueStatsCache();
  clearExternalSourcesCache();
  leaguePayloadCache.clear();

  const cached = getCachedPlayers();
  const dynamicClubIds = Array.from(
    new Set([
      ...CORE_REFRESH_CLUB_IDS,
      ...cached.map((p) => p.clubId).filter(Boolean),
    ])
  ).slice(0, 10);

  mergeManagersIntoCache(WORLD_MANAGERS);

  // Pre-warm top league Opta season URLs + live transfers/fixtures before hydrating clubs
  await Promise.allSettled(['47', '87', '54', '55', '53'].map((lid) => getLeague(lid)));

  const [gasRes, , ...clubResults] = await Promise.allSettled([
    gasPost<{ refreshedCount?: number; status?: string }>('refreshCache', { force: true }),
    fetchInitialDataBundle(true),
    ...dynamicClubIds.map((clubId) => getTeam(clubId, { forceRefresh: true })),
  ]);

  const syncedFromTeams = clubResults.some(
    (r) => r.status === 'fulfilled' && r.value && r.value.players.length > 0
  );
  const gasOk =
    gasRes.status === 'fulfilled' && Boolean(gasRes.value && gasRes.value.status !== 'error');

  const updated = getCachedPlayers();
  return {
    refreshedCount: updated.length,
    syncedToSheets: gasOk || syncedFromTeams,
  };
}
