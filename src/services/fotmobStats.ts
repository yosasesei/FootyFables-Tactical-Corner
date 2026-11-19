import type { Player, PlayerRadarPercentiles, PlayerSeasonStats } from '../types/footy';

export interface FotmobStatEntry {
  participantId: string;
  name: string;
  teamId: string;
  teamName: string;
  countryCode: string;
  statValue: number;
  subStatValue: number;
  minutesPlayed: number;
  matchesPlayed: number;
}

export interface LeaguePlayerTelemetry {
  fotmobId: string;
  rating?: number;
  minutes?: number;
  appearances?: number;
  goals?: number;
  assists?: number;
  xG?: number;
  xA?: number;
  keyPassesPer90?: number;
  accuratePassesPer90?: number;
  passAccuracy?: number;
  successfulDribblesPer90?: number;
  lineBreakingPassesPer90?: number;
  tacklesPer90?: number;
  interceptionsPer90?: number;
  possWonAtt3rdPer90?: number;
  savePercentage?: number;
  topSpeedKmh?: number;
  bigChancesCreated?: number;
  defensiveActionsPer90?: number;
  ballRecoveriesPer90?: number;
}

const STAT_FILES = [
  { key: 'rating', file: 'rating.json' },
  { key: 'mins_played', file: 'mins_played.json' },
  { key: 'goals', file: 'goals.json' },
  { key: 'goal_assist', file: 'goal_assist.json' },
  { key: 'expected_goals', file: 'expected_goals.json' },
  { key: 'expected_assists', file: 'expected_assists.json' },
  { key: 'total_att_assist', file: 'total_att_assist.json' },
  { key: 'accurate_pass', file: 'accurate_pass.json' },
  { key: 'won_contest', file: 'won_contest.json' },
  { key: 'lbp_total', file: 'lbp_total.json' },
  { key: 'total_tackle', file: 'total_tackle.json' },
  { key: 'interception', file: 'interception.json' },
  { key: 'poss_won_att_3rd', file: 'poss_won_att_3rd.json' },
  { key: 'save_percentage', file: '_save_percentage.json' },
  { key: 'phys_ts', file: 'phys_ts.json' },
  { key: 'big_chance_created', file: 'big_chance_created.json' },
  { key: 'defensive_contributions', file: 'defensive_contributions.json' },
  { key: 'ball_recovery', file: 'ball_recovery.json' },
] as const;

type StatFileKey = (typeof STAT_FILES)[number]['key'];

const leagueStatsCache = new Map<string, Promise<Map<string, LeaguePlayerTelemetry>>>();
const leagueOptaUrlRegistry = new Map<string, { seasonId: string; urls: string[] }>();

export function clearLeagueStatsCache(): void {
  leagueStatsCache.clear();
}

export function extractOptaSeasonFromUrls(urls: string[]): { seasonId: string; urls: string[] } | null {
  const clean = urls.map((u) => String(u || '').trim()).filter(Boolean);
  if (clean.length === 0) return null;
  for (const url of clean) {
    const m = url.match(/\/stats\/\d+\/season\/([^/]+)\//i);
    if (m && m[1]) {
      return { seasonId: m[1], urls: clean };
    }
  }
  return { seasonId: '', urls: clean };
}

export function registerLeagueOptaUrls(
  leagueId: string | number,
  seasonId: string | number | undefined,
  urls: string[]
): void {
  const lId = String(leagueId || '').trim();
  if (!lId || !Array.isArray(urls) || urls.length === 0) return;
  const extracted = extractOptaSeasonFromUrls(urls);
  if (!extracted) return;
  const resolvedSeason = String(seasonId || extracted.seasonId || '').trim();
  if (!resolvedSeason) return;
  leagueOptaUrlRegistry.set(lId, { seasonId: resolvedSeason, urls: extracted.urls });
}

export function getRegisteredLeagueOptaInfo(
  leagueId: string | number
): { seasonId: string; urls: string[] } | undefined {
  return leagueOptaUrlRegistry.get(String(leagueId || '').trim());
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function getPositionGroupShort(pos: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const p = pos.toUpperCase();
  if (p.includes('GK') || p.includes('KEEP')) return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'DEF'].some((k) => p.includes(k))) return 'DEF';
  if (['DM', 'CDM', 'CM', 'CAM', 'AM', 'LM', 'RM', 'MID'].some((k) => p.includes(k))) return 'MID';
  return 'FWD';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFotmobStatJson(rawJson: any): FotmobStatEntry[] {
  const topList = rawJson?.TopLists?.[0]?.StatList;
  if (!Array.isArray(topList)) return [];

  const entries: FotmobStatEntry[] = [];
  for (const row of topList) {
    // Note: FotMob API spells this field "ParticiantId" (with typo) in stat lists
    const pid = row?.ParticiantId ?? row?.ParticipantId ?? row?.participantId ?? row?.id;
    if (!pid) continue;
    entries.push({
      participantId: String(pid),
      name: String(row?.ParticipantName ?? ''),
      teamId: String(row?.TeamId ?? ''),
      teamName: String(row?.TeamName ?? ''),
      countryCode: String(row?.ParticipantCountryCode ?? ''),
      statValue: Number(row?.StatValue ?? 0) || 0,
      subStatValue: Number(row?.SubStatValue ?? 0) || 0,
      minutesPlayed: Number(row?.MinutesPlayed ?? 0) || 0,
      matchesPlayed: Number(row?.MatchesPlayed ?? 0) || 0,
    });
  }
  return entries;
}

export function mergeTelemetryMaps(
  buckets: Partial<Record<StatFileKey, FotmobStatEntry[]>>
): Map<string, LeaguePlayerTelemetry> {
  const result = new Map<string, LeaguePlayerTelemetry>();

  const ensure = (id: string): LeaguePlayerTelemetry => {
    let entry = result.get(id);
    if (!entry) {
      entry = { fotmobId: id };
      result.set(id, entry);
    }
    return entry;
  };

  for (const row of buckets.mins_played || []) {
    const t = ensure(row.participantId);
    t.minutes = Math.round(row.statValue || row.minutesPlayed);
    t.appearances = Math.round(row.subStatValue || row.matchesPlayed);
  }

  for (const row of buckets.rating || []) {
    const t = ensure(row.participantId);
    if (row.statValue > 0) t.rating = Number(row.statValue.toFixed(2));
    if (!t.minutes && row.minutesPlayed > 0) t.minutes = row.minutesPlayed;
    if (!t.appearances && row.matchesPlayed > 0) t.appearances = row.matchesPlayed;
  }

  for (const row of buckets.goals || []) {
    const t = ensure(row.participantId);
    t.goals = Math.round(row.statValue);
    if (!t.minutes && row.minutesPlayed > 0) t.minutes = row.minutesPlayed;
    if (!t.appearances && row.matchesPlayed > 0) t.appearances = row.matchesPlayed;
  }

  for (const row of buckets.goal_assist || []) {
    const t = ensure(row.participantId);
    t.assists = Math.round(row.statValue);
  }

  for (const row of buckets.expected_goals || []) {
    const t = ensure(row.participantId);
    t.xG = Number(row.statValue.toFixed(2));
    if (t.goals === undefined && row.subStatValue > 0) t.goals = Math.round(row.subStatValue);
    if (!t.minutes && row.minutesPlayed > 0) t.minutes = row.minutesPlayed;
    if (!t.appearances && row.matchesPlayed > 0) t.appearances = row.matchesPlayed;
  }

  for (const row of buckets.expected_assists || []) {
    const t = ensure(row.participantId);
    t.xA = Number(row.statValue.toFixed(2));
    if (t.assists === undefined && row.subStatValue > 0) t.assists = Math.round(row.subStatValue);
  }

  for (const row of buckets.total_att_assist || []) {
    const t = ensure(row.participantId);
    const per90 =
      row.subStatValue > 0
        ? row.subStatValue
        : row.minutesPlayed > 0
        ? (row.statValue / row.minutesPlayed) * 90
        : 0;
    t.keyPassesPer90 = Number(per90.toFixed(2));
  }

  for (const row of buckets.accurate_pass || []) {
    const t = ensure(row.participantId);
    t.accuratePassesPer90 = Number(row.statValue.toFixed(1));
    if (row.subStatValue > 0) t.passAccuracy = Number(row.subStatValue.toFixed(1));
  }

  for (const row of buckets.won_contest || []) {
    const t = ensure(row.participantId);
    t.successfulDribblesPer90 = Number(row.statValue.toFixed(2));
  }

  for (const row of buckets.lbp_total || []) {
    const t = ensure(row.participantId);
    t.lineBreakingPassesPer90 = Number(row.statValue.toFixed(2));
  }

  for (const row of buckets.total_tackle || []) {
    const t = ensure(row.participantId);
    t.tacklesPer90 = Number(row.statValue.toFixed(2));
  }

  for (const row of buckets.interception || []) {
    const t = ensure(row.participantId);
    t.interceptionsPer90 = Number(row.statValue.toFixed(2));
  }

  for (const row of buckets.poss_won_att_3rd || []) {
    const t = ensure(row.participantId);
    t.possWonAtt3rdPer90 = Number(row.statValue.toFixed(2));
  }

  for (const row of buckets.save_percentage || []) {
    const t = ensure(row.participantId);
    t.savePercentage = Number(row.statValue.toFixed(1));
  }

  for (const row of buckets.phys_ts || []) {
    const t = ensure(row.participantId);
    if (row.statValue > 10) t.topSpeedKmh = Number(row.statValue.toFixed(1));
  }

  for (const row of buckets.big_chance_created || []) {
    const t = ensure(row.participantId);
    t.bigChancesCreated = Math.round(row.statValue);
  }

  for (const row of buckets.defensive_contributions || []) {
    const t = ensure(row.participantId);
    t.defensiveActionsPer90 = Number(row.statValue.toFixed(2));
  }

  for (const row of buckets.ball_recovery || []) {
    const t = ensure(row.participantId);
    t.ballRecoveriesPer90 = Number(row.statValue.toFixed(2));
  }

  return result;
}

export async function fetchLeaguePlayerStats(
  leagueId: string | number,
  seasonId: string | number,
  customUrls?: string[]
): Promise<Map<string, LeaguePlayerTelemetry>> {
  const lId = String(leagueId || '').trim();
  const sId = String(seasonId || '').trim();
  if (!lId || !sId) return new Map();

  if (Array.isArray(customUrls) && customUrls.length > 0) {
    registerLeagueOptaUrls(lId, sId, customUrls);
  }
  const effectiveUrls = customUrls?.length ? customUrls : leagueOptaUrlRegistry.get(lId)?.urls;

  const cacheKey = `${lId}:${sId}`;
  const existingPromise = leagueStatsCache.get(cacheKey);
  if (existingPromise) return existingPromise;

  const task = (async () => {
    const urlByKey = new Map<StatFileKey, string>();
    for (const sf of STAT_FILES) {
      const matchedCustom = effectiveUrls?.find((u) => u.endsWith(`/${sf.file}`));
      urlByKey.set(
        sf.key,
        matchedCustom || `https://data.fotmob.com/stats/${lId}/season/${sId}/${sf.file}`
      );
    }

    const buckets: Partial<Record<StatFileKey, FotmobStatEntry[]>> = {};
    await Promise.allSettled(
      STAT_FILES.map(async (sf) => {
        const url = urlByKey.get(sf.key)!;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) return;
        const json = await res.json();
        buckets[sf.key] = parseFotmobStatJson(json);
      })
    );

    return mergeTelemetryMaps(buckets);
  })();

  leagueStatsCache.set(cacheKey, task);
  return task;
}

export function computeRadarFromStats(
  stats: PlayerSeasonStats,
  position: string,
  extra?: {
    lineBreakingPassesPer90?: number;
    possWonAtt3rdPer90?: number;
    savePercentage?: number;
  }
): PlayerRadarPercentiles {
  const group = getPositionGroupShort(position);
  const mins90 = Math.max(1, stats.minutes / 90);
  const xgPer90 = stats.xG / mins90;
  const gPer90 = stats.goals / mins90;
  const xaPer90 = stats.xA / mins90;

  if (group === 'GK') {
    const savePct = extra?.savePercentage ?? 71;
    const ratingBoost = clamp((stats.rating - 6.3) * 20, 0, 22);
    return {
      attacking: Math.round(clamp(12 + stats.assists * 5, 10, 32)),
      creativity: Math.round(clamp(32 + stats.keyPassesPer90 * 40, 28, 65)),
      progression: Math.round(clamp(48 + (stats.passAccuracy - 55) * 0.9, 40, 92)),
      defending: Math.round(clamp(62 + (savePct - 60) * 0.8 + ratingBoost * 0.45, 55, 97)),
      workrate: Math.round(clamp(60 + ratingBoost * 0.6, 55, 88)),
      efficiency: Math.round(clamp(60 + (savePct - 62) * 0.85 + ratingBoost * 0.5, 56, 96)),
    };
  }

  const attackingRaw =
    group === 'DEF'
      ? 35 + gPer90 * 95 + xgPer90 * 80 + stats.keyPassesPer90 * 6
      : 48 + gPer90 * 45 + xgPer90 * 48 + stats.keyPassesPer90 * 7;

  const creativityRaw =
    group === 'DEF'
      ? 42 + stats.keyPassesPer90 * 20 + xaPer90 * 75
      : 45 + stats.keyPassesPer90 * 14 + xaPer90 * 65;

  const lbpBonus = (extra?.lineBreakingPassesPer90 ?? 0) * 1.1;
  const progressionRaw =
    46 +
    stats.progressiveCarriesPer90 * 8.5 +
    Math.max(0, stats.passAccuracy - 70) * 0.75 +
    lbpBonus;

  const defBase = group === 'DEF' ? 60 : group === 'MID' ? 46 : 28;
  const defendingRaw = defBase + stats.tacklesInterceptionsPer90 * 9.5;

  const pressBonus = (extra?.possWonAtt3rdPer90 ?? 0) * 14;
  const workrateRaw =
    54 + stats.tacklesInterceptionsPer90 * 5.5 + pressBonus + clamp((stats.rating - 6.5) * 10, 0, 18);

  const conversion = stats.xG > 0.5 ? clamp(stats.goals / stats.xG, 0.7, 1.35) : 1;
  const efficiencyRaw =
    52 +
    clamp((stats.rating - 6.4) * 16, 0, 26) +
    Math.max(0, stats.passAccuracy - 74) * 0.6 +
    (conversion - 1) * 15;

  return {
    attacking: Math.round(clamp(attackingRaw, 28, 99)),
    creativity: Math.round(clamp(creativityRaw, 30, 99)),
    progression: Math.round(clamp(progressionRaw, 35, 98)),
    defending: Math.round(clamp(defendingRaw, 25, 98)),
    workrate: Math.round(clamp(workrateRaw, 42, 98)),
    efficiency: Math.round(clamp(efficiencyRaw, 45, 98)),
  };
}

/**
 * Calibrated market value estimator ONLY when neither Transfermarkt nor FotMob
 * reports a transferValue (> 0). Avoids the broken uniform €15M placeholder.
 */
export function estimateMarketValueFromProfile(
  rating: number,
  age: number,
  position: string
): number {
  const safeRating = rating > 0 ? rating : 6.55;
  const group = getPositionGroupShort(position);
  const ageMult = age <= 21 ? 1.35 : age <= 25 ? 1.25 : age <= 28 ? 1.0 : age <= 31 ? 0.65 : 0.35;
  const posMult = group === 'FWD' ? 1.2 : group === 'MID' ? 1.1 : group === 'DEF' ? 0.9 : 0.65;

  let base = 2_200_000;
  if (safeRating >= 7.6) base = 48_000_000;
  else if (safeRating >= 7.3) base = 30_000_000;
  else if (safeRating >= 7.0) base = 18_000_000;
  else if (safeRating >= 6.7) base = 9_500_000;
  else if (safeRating >= 6.4) base = 4_200_000;

  return Math.round((base * ageMult * posMult) / 100_000) * 100_000;
}

export function applyTelemetryToPlayer(
  player: Player,
  telemetry: LeaguePlayerTelemetry | undefined
): Player {
  if (!telemetry) return player;

  const minutes = telemetry.minutes && telemetry.minutes > 0 ? telemetry.minutes : player.stats.minutes;
  const appearances =
    telemetry.appearances && telemetry.appearances > 0
      ? telemetry.appearances
      : player.stats.appearances;
  const rating = telemetry.rating && telemetry.rating > 0 ? telemetry.rating : player.stats.rating;
  const goals = telemetry.goals !== undefined ? telemetry.goals : player.stats.goals;
  const assists = telemetry.assists !== undefined ? telemetry.assists : player.stats.assists;
  const xG = telemetry.xG !== undefined && telemetry.xG > 0 ? telemetry.xG : player.stats.xG;
  const xA = telemetry.xA !== undefined && telemetry.xA > 0 ? telemetry.xA : player.stats.xA;
  const keyPassesPer90 =
    telemetry.keyPassesPer90 !== undefined && telemetry.keyPassesPer90 > 0
      ? telemetry.keyPassesPer90
      : player.stats.keyPassesPer90;
  const passAccuracy =
    telemetry.passAccuracy !== undefined && telemetry.passAccuracy > 0
      ? telemetry.passAccuracy
      : player.stats.passAccuracy;

  // Compute progression carries / take-ons proxy from FotMob dribbles + line-breaking passes when real carries are absent
  const computedProgCarries =
    telemetry.successfulDribblesPer90 !== undefined || telemetry.lineBreakingPassesPer90 !== undefined
      ? Number(
          clamp(
            (telemetry.successfulDribblesPer90 ?? 0) * 1.15 +
              (telemetry.lineBreakingPassesPer90 ?? 0) * 0.22,
            0.2,
            8.5
          ).toFixed(2)
        )
      : player.stats.progressiveCarriesPer90;

  const computedTacklesInt =
    telemetry.tacklesPer90 !== undefined || telemetry.interceptionsPer90 !== undefined
      ? Number(((telemetry.tacklesPer90 ?? 0) + (telemetry.interceptionsPer90 ?? 0)).toFixed(2))
      : telemetry.defensiveActionsPer90 !== undefined && player.stats.tacklesInterceptionsPer90 <= 0
      ? Number((telemetry.defensiveActionsPer90 * 0.48).toFixed(2))
      : player.stats.tacklesInterceptionsPer90;

  const nextStats: PlayerSeasonStats = {
    rating,
    minutes,
    appearances,
    goals,
    assists,
    xG,
    xA,
    keyPassesPer90,
    progressiveCarriesPer90: computedProgCarries,
    tacklesInterceptionsPer90: computedTacklesInt,
    passAccuracy,
  };

  const nextRadar = computeRadarFromStats(nextStats, player.primaryPosition, {
    lineBreakingPassesPer90: telemetry.lineBreakingPassesPer90,
    possWonAtt3rdPer90: telemetry.possWonAtt3rdPer90,
    savePercentage: telemetry.savePercentage,
  });

  const optaExtras = {
    ...player.optaExtras,
    ...(telemetry.topSpeedKmh !== undefined ? { topSpeedKmh: telemetry.topSpeedKmh } : {}),
    ...(telemetry.lineBreakingPassesPer90 !== undefined
      ? { lineBreakingPassesPer90: telemetry.lineBreakingPassesPer90 }
      : {}),
    ...(telemetry.bigChancesCreated !== undefined
      ? { bigChancesCreated: telemetry.bigChancesCreated }
      : {}),
    ...(telemetry.defensiveActionsPer90 !== undefined
      ? { defensiveActionsPer90: telemetry.defensiveActionsPer90 }
      : {}),
    ...(telemetry.ballRecoveriesPer90 !== undefined
      ? { ballRecoveriesPer90: telemetry.ballRecoveriesPer90 }
      : {}),
    ...(telemetry.possWonAtt3rdPer90 !== undefined
      ? { possWonAtt3rdPer90: telemetry.possWonAtt3rdPer90 }
      : {}),
    ...(telemetry.savePercentage !== undefined
      ? { savePercentage: telemetry.savePercentage }
      : {}),
  };

  const sources = Array.from(new Set([...(player.dataSources || []), 'Opta/FotMob Live']));

  return {
    ...player,
    stats: nextStats,
    radar: nextRadar,
    optaExtras: Object.keys(optaExtras).length > 0 ? optaExtras : player.optaExtras,
    dataSources: sources,
  };
}
