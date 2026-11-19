import {
  FALLBACK_ARTICLES,
  FALLBACK_LEAGUES,
  FALLBACK_MANAGERS,
  FALLBACK_PLAYERS,
  FALLBACK_TRANSFERS,
  FALLBACK_WORLD_MATCHES,
} from '../data/fallbackData';
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
  applyTelemetryToPlayer,
  clearLeagueStatsCache,
  computeRadarFromStats,
  estimateMarketValueFromProfile,
  fetchLeaguePlayerStats,
  type LeaguePlayerTelemetry,
} from './fotmobStats';

export const DEFAULT_GAS_API_URL =
  'https://script.google.com/macros/s/AKfycbyo9NgU03Twi9TuJW78LqULD6lUhaaqs_W-1gPU_GsyHjLZlgYfkp_nKSW3s_9kdCbR1w/exec';

export const PLAYERS_UPDATED_EVENT = 'footyfables:players-updated';

const KEYS = {
  GAS_URL: 'footyfables_gas_api_url',
  ADMIN_PIN: 'footyfables_admin_pin',
  PLAYERS_CACHE: 'footyfables_players_cache_v2',
  LEGACY_PLAYERS_CACHE: 'footyfables_players_cache_v1',
  ARTICLES_CACHE: 'footyfables_articles_cache_v1',
  MANAGERS_CACHE: 'footyfables_managers_cache_v1',
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
    // Clear legacy v1 cache that stored uncalibrated €15M/0-stat entries
    if (localStorage.getItem(KEYS.LEGACY_PLAYERS_CACHE)) {
      localStorage.removeItem(KEYS.LEGACY_PLAYERS_CACHE);
    }
    const raw = localStorage.getItem(KEYS.PLAYERS_CACHE);
    if (raw) {
      const parsed = JSON.parse(raw) as Player[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = parsed.filter((p) => p && p.fotmobId && !isCorruptedLegacyPlayer(p));
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

export function getCachedManagers(): TeamManagerProfile[] {
  try {
    const raw = localStorage.getItem(KEYS.MANAGERS_CACHE);
    if (raw) {
      const parsed = JSON.parse(raw) as TeamManagerProfile[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback
  }
  return FALLBACK_MANAGERS;
}

export function saveCachedManagers(managers: TeamManagerProfile[]): void {
  try {
    localStorage.setItem(KEYS.MANAGERS_CACHE, JSON.stringify(managers));
  } catch {
    // ignore
  }
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
          date: String(m.date || '').slice(0, 7) || '2025-01',
          valueEur: Number(m.value_eur ?? m.valueEur ?? 0) || marketValueEur,
          club: String(m.club_at_date || m.club || clubName),
        }))
      : existing?.marketValueHistory && existing.marketValueHistory.length > 1
      ? existing.marketValueHistory
      : fallbackMatch?.marketValueHistory || [
          {
            date: '2025-01',
            valueEur: marketValueEur,
            club: clubName,
          },
        ];

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
      raw.contract_until || existing?.contractUntil || fallbackMatch?.contractUntil || '2027-06-30'
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
        '2025-01'
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

  return telemetry ? applyTelemetryToPlayer(basePlayer, telemetry) : basePlayer;
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

export async function getLeague(leagueId: string): Promise<LeagueInfo> {
  const remote = await gasGet('getLeague', { id: leagueId });
  const fallbackLeague =
    FALLBACK_LEAGUES.find((l) => l.id === leagueId) || FALLBACK_LEAGUES[0];

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

export async function getTeam(
  teamId: string,
  options?: { forceRefresh?: boolean }
): Promise<{ club: LeagueClub; players: Player[] } | null> {
  const queryParams: Record<string, string> = { id: teamId };
  if (options?.forceRefresh) {
    queryParams.refresh = '1';
    queryParams._t = String(Date.now());
  }

  const remote = await gasGet('getTeam', queryParams);
  const allPlayers = getCachedPlayers();
  const cachedById = new Map<string, Player>(allPlayers.map((p) => [p.fotmobId, p]));

  // Parse FotMob team squad shape returned by GAS proxy
  const squadGroups = remote?.data?.squad?.squad || remote?.data?.squad;
  if (remote?.data?.details && Array.isArray(squadGroups)) {
    let coachName = 'First Team Manager';
    const membersList: Player[] = [];
    const clubName = String(remote.data.details.name || 'Club');

    // Extract live league/season telemetry URLs provided in FotMob team payload
    const primaryLeagueId = remote?.data?.stats?.primaryLeagueId || remote?.data?.details?.primaryLeagueId;
    const primarySeasonId = remote?.data?.stats?.primarySeasonId;
    const customUrls: string[] = Array.isArray(remote?.data?.stats?.players)
      ? remote.data.stats.players
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((s: any) => String(s?.fetchAllUrl || ''))
          .filter(Boolean)
      : [];

    const telemetryMap =
      primaryLeagueId && primarySeasonId
        ? await fetchLeaguePlayerStats(primaryLeagueId, primarySeasonId, customUrls).catch(
            () => new Map<string, LeaguePlayerTelemetry>()
          )
        : new Map<string, LeaguePlayerTelemetry>();

    const leagueMeta = FALLBACK_LEAGUES.find((lg) =>
      lg.id === String(primaryLeagueId || '') ||
      lg.clubs.some((c) => c.id === String(teamId))
    );

    for (const group of squadGroups) {
      if (group.title === 'coach' && Array.isArray(group.members) && group.members[0]) {
        coachName = String(group.members[0].name || coachName);
        continue;
      }
      if (Array.isArray(group.members)) {
        for (const m of group.members) {
          const memberId = String(m.id || '');
          const normalized = normalizeGasPlayer(
            {
              ...m,
              fotmob_id: memberId,
              club: clubName,
              club_id: String(remote.data.details.id || teamId),
              league: leagueMeta?.name || remote.data.details.primaryLeagueName || undefined,
              position: m.positionIdsDesc || m.role?.fallback || 'CM',
              rating: m.rating,
              transferValue: m.transferValue,
            },
            undefined,
            undefined,
            {
              existing: cachedById.get(memberId),
              telemetry: telemetryMap.get(memberId),
            }
          );
          membersList.push(normalized);
        }
      }
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
  return false;
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

  const remote = await gasGet('getPlayer', queryParams);

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

  let candidate: Player | null = null;
  if (rawRemotePlayer && remoteNameValid) {
    candidate = normalizeGasPlayer(
      {
        ...rawRemotePlayer,
        fotmob_id: params.fotmobId || rawRemotePlayer.fotmob_id,
        club_id: params.clubId || rawRemotePlayer.club_id,
      },
      remote?.marketHistory,
      remote?.transferHistory,
      { existing }
    );
  } else if (existing) {
    candidate = existing;
  }

  // Resolve clubId for full live FotMob squad + league stats hydration
  let targetClubId = params.clubId || candidate?.clubId || existing?.clubId || '';
  if (!targetClubId && (params.name || candidate?.name)) {
    const lookupName = params.name || candidate!.name;
    const searchRes = await searchGlobal(lookupName);
    const matched = searchRes.players.find(
      (sp) => sp.fotmobId === params.fotmobId || namesRoughlyMatch(lookupName, sp.name)
    );
    if (matched?.clubId) targetClubId = matched.clubId;
  }

  // Pull live club squad + CORS-open data.fotmob.com league stats whenever requested or sparse
  if (targetClubId && (params.forceRefresh || needsTelemetryHydration(candidate || undefined))) {
    const teamBundle = await getTeam(targetClubId, { forceRefresh: params.forceRefresh });
    if (teamBundle) {
      const liveMember =
        teamBundle.players.find((m) => m.fotmobId === params.fotmobId) ||
        (params.name
          ? teamBundle.players.find((m) => namesRoughlyMatch(params.name!, m.name))
          : undefined);

      if (liveMember) {
        const mergedPlayer: Player = candidate
          ? {
              ...candidate,
              ...liveMember,
              fotmobId: liveMember.fotmobId || candidate.fotmobId,
              tmId: candidate.tmId || liveMember.tmId,
              marketValueEur:
                liveMember.marketValueEur > 0 ? liveMember.marketValueEur : candidate.marketValueEur,
              marketValueHistory:
                candidate.marketValueHistory.length > 1
                  ? candidate.marketValueHistory
                  : liveMember.marketValueHistory,
              transferHistory:
                candidate.transferHistory.length > 0
                  ? candidate.transferHistory
                  : liveMember.transferHistory,
              syncedToSheets: true,
            }
          : { ...liveMember, syncedToSheets: true };

        mergePlayersIntoCache([mergedPlayer]);
        return mergedPlayer;
      }
    }
  }

  if (candidate) {
    const synced = { ...candidate, syncedToSheets: true };
    mergePlayersIntoCache([synced]);
    return synced;
  }

  return null;
}

export async function getTransfers(): Promise<TransferTickerItem[]> {
  const remote = await gasGet('getTransfers');
  const rawTransfers = remote?.data?.transfers || remote?.transfers;
  if (Array.isArray(rawTransfers) && rawTransfers.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rawTransfers.slice(0, 25).map((t: any, idx: number) => {
      const feeText = t.fee?.feeText || (t.onLoan ? 'Loan' : 'Undisclosed');
      const amt = t.amountEuroEstimated;
      const feeLabel = amt
        ? `€${(Number(amt) / 1_000_000).toFixed(1)}M`
        : String(feeText);
      const dateStr = t.transferDate ? String(t.transferDate).slice(0, 10) : 'Recent';
      return {
        id: `live-tr-${t.playerId || idx}`,
        playerFotmobId: String(t.playerId || ''),
        playerName: String(t.name || 'Player'),
        position: String(t.position?.label || 'CM'),
        age: Number(t.age || 24),
        fromClub: String(t.fromClub || 'Previous Club'),
        toClub: String(t.toClub || 'Destination'),
        feeLabel,
        status: t.contractExtension || t.transferType?.text ? 'Confirmed' : 'Rumor',
        reliability: 'FotMob Live',
        updatedAt: dateStr,
      };
    });
  }
  return FALLBACK_TRANSFERS;
}

export async function getWorldMatches(leagueId?: string): Promise<WorldMatch[]> {
  if (leagueId && leagueId !== 'all') {
    const remote = await gasGet('getLeague', { id: leagueId });
    const rawMatches =
      remote?.data?.fixtures?.allMatches ||
      remote?.data?.overview?.leagueOverviewMatches ||
      remote?.data?.matches?.allMatches;

    const leagueMeta = FALLBACK_LEAGUES.find((l) => l.id === leagueId);

    if (Array.isArray(rawMatches) && rawMatches.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedLive: WorldMatch[] = rawMatches.slice(0, 12).map((m: any, idx: number) => {
        const homeName = String(m.home?.name || m.home?.shortName || 'Home Club');
        const awayName = String(m.away?.name || m.away?.shortName || 'Away Club');
        const finished = Boolean(m.status?.finished);
        const started = Boolean(m.status?.started);
        const status: WorldMatch['status'] = finished
          ? 'Finished'
          : started
          ? 'Live'
          : 'Upcoming';

        return {
          id: `live-match-${leagueId}-${m.id || idx}`,
          leagueId,
          leagueName: String(remote?.data?.details?.name || leagueMeta?.name || 'League'),
          country: String(remote?.data?.details?.country || leagueMeta?.country || 'World'),
          round: m.roundName ? `Matchday ${m.roundName}` : 'Season Fixture',
          kickoffIso: String(m.status?.utcTime || new Date().toISOString()),
          kickoffDisplay: finished
            ? 'FT'
            : started
            ? String(m.status?.liveTime?.short || 'Live')
            : String(m.status?.utcTime || '').slice(5, 16).replace('T', ' '),
          status,
          scoreDisplay: m.status?.scoreStr ? String(m.status.scoreStr) : undefined,
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

      if (mappedLive.length > 0) {
        return mappedLive;
      }
    }

    return FALLBACK_WORLD_MATCHES.filter((m) => m.leagueId === leagueId);
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
  const remote = await gasGet<TeamManagerProfile[]>('getManagers');
  if (remote && Array.isArray(remote) && remote.length > 0) {
    saveCachedManagers(remote);
    return remote;
  }
  return getCachedManagers();
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
  const cached = getCachedPlayers();
  const dynamicClubIds = Array.from(
    new Set([
      ...CORE_REFRESH_CLUB_IDS,
      ...cached.map((p) => p.clubId).filter(Boolean),
    ])
  ).slice(0, 10);

  const [gasRes, ...clubResults] = await Promise.allSettled([
    gasPost<{ refreshedCount?: number; status?: string }>('refreshCache', { force: true }),
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
