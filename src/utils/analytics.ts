import type {
  FormationSlot,
  MatchMentality,
  MatchPredictionResult,
  MatchRatingPoint,
  Player,
  SquadBalanceReport,
  TacticalFitResult,
  TacticalParameters,
} from '../types/footy';
export {
  evaluateSlotFit,
  predictMatchFromLineups,
  type EnhancedMatchPrediction,
  type SlotFitQuality,
} from './matchPredictor';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function formatMarketValue(valueEur: number): string {
  if (!Number.isFinite(valueEur) || valueEur <= 0) return '€0';
  if (valueEur >= 1_000_000) {
    const millions = valueEur / 1_000_000;
    return `€${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (valueEur >= 1_000) {
    return `€${Math.round(valueEur / 1_000)}K`;
  }
  return `€${Math.round(valueEur)}`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'FF';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function getPositionGroup(pos: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const p = pos.toUpperCase();
  if (p === 'GK') return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p)) return 'DEF';
  if (['DM', 'CDM', 'CM', 'CAM', 'AM', 'LM', 'RM'].includes(p)) return 'MID';
  return 'FWD';
}

export function calculateTacticalFit(
  player: Player,
  params: TacticalParameters,
  pool: Player[]
): TacticalFitResult {
  const r = player.radar;

  // 1. System Fit: alignment between possession/build-up vs progression/creativity & transition vs attacking
  const possessionNorm = params.possessionFocus / 100;
  const buildUpNorm = params.buildUpStyle / 100;
  const transitionNorm = params.transitionSpeed / 100;

  const technicalDemand = r.progression * 0.45 + r.creativity * 0.35 + r.efficiency * 0.2;
  const directDemand = r.attacking * 0.5 + r.workrate * 0.3 + r.progression * 0.2;

  const possessionAlignment =
    100 - Math.abs((possessionNorm * 60 + buildUpNorm * 40) - technicalDemand) * 0.65;
  const transitionAlignment =
    100 - Math.abs(transitionNorm * 100 - directDemand) * 0.45;
  const systemFit = Math.round(clamp(possessionAlignment * 0.6 + transitionAlignment * 0.4, 42, 99));

  // 2. Role Compatibility: how well player's primary/secondary traits serve the tactical line & quality
  const posGroup = getPositionGroup(player.primaryPosition);
  let roleScore = 75;
  if (posGroup === 'DEF') {
    const highLineBonus = params.defensiveLine > 65 ? (r.progression + r.workrate) / 2 : r.defending;
    roleScore = r.defending * 0.5 + highLineBonus * 0.35 + r.efficiency * 0.15;
  } else if (posGroup === 'MID') {
    roleScore = r.progression * 0.35 + r.creativity * 0.3 + r.workrate * 0.2 + r.defending * 0.15;
  } else if (posGroup === 'FWD') {
    roleScore = r.attacking * 0.45 + r.efficiency * 0.3 + r.creativity * 0.25;
  } else {
    roleScore = r.efficiency * 0.6 + r.progression * 0.4;
  }
  const roleCompatibility = Math.round(clamp(roleScore + (player.stats.rating - 7.0) * 6, 45, 99));

  // 3. Physical & Pressing Demand
  const pressGap = params.pressingIntensity - r.workrate;
  const aerialFactor = params.aerialPhysicality > 70 && player.heightCm < 176 ? -7 : 3;
  const pressingPenalty = pressGap > 15 ? (pressGap - 15) * 0.75 : 0;
  const physicalPressingDemand = Math.round(
    clamp(88 - pressingPenalty + aerialFactor + (r.workrate - 70) * 0.2, 38, 98)
  );

  // 4. Market Value ROI (performance output + age curve vs market value)
  const ageFactor = player.age <= 23 ? 14 : player.age <= 27 ? 8 : player.age <= 30 ? 0 : -10;
  const mvMillions = Math.max(1, player.marketValueEur / 1_000_000);
  const perfIndex = player.stats.rating * 10 + (player.stats.goals + player.stats.assists) * 0.8;
  const rawRoi = 68 + ageFactor + (perfIndex / Math.sqrt(mvMillions)) * 1.4;
  const marketValueROI = Math.round(clamp(rawRoi, 40, 98));

  const overallScore = Math.round(
    systemFit * 0.32 +
      roleCompatibility * 0.3 +
      physicalPressingDemand * 0.22 +
      marketValueROI * 0.16
  );

  const strengths: string[] = [];
  const risks: string[] = [];

  if (r.progression >= 82 && params.buildUpStyle >= 60) {
    strengths.push(
      `Progresi bola elite (${r.progression}/99) mendukung fase build-up pendek dari lini belakang.`
    );
  }
  if (r.workrate >= 80 && params.pressingIntensity >= 70) {
    strengths.push(
      `Intensitas pressing tinggi (${r.workrate}/99) siap mengeksekusi counter-pressing secara instan.`
    );
  }
  if (r.creativity >= 82) {
    strengths.push(
      `Kreativitas ruang sempit (${r.creativity}/99) mampu membongkar blok pertahanan rendah.`
    );
  }
  if (r.efficiency >= 80) {
    strengths.push(
      `Efisiensi eksekusi (${r.efficiency}/99) dengan akurasi operan ${player.stats.passAccuracy.toFixed(1)}% menjaga stabilitas penguasaan.`
    );
  }
  if (strengths.length === 0) {
    strengths.push(
      `Profil serba bisa dengan rating FotMob ${player.stats.rating.toFixed(2)} memberi fleksibilitas rotasi di berbagai fase.`
    );
  }

  if (params.pressingIntensity - r.workrate > 18) {
    risks.push(
      `Beban pressing tim (${params.pressingIntensity}) melebihi profil workrate pemain (${r.workrate}), berisiko kelelahan di menit akhir.`
    );
  }
  if (params.defensiveLine > 72 && posGroup === 'DEF' && r.workrate < 75) {
    risks.push(
      `Garis pertahanan tinggi membutuhkan pemulihan sprint lebih cepat saat transisi negatif.`
    );
  }
  if (player.marketValueEur >= 110_000_000) {
    risks.push(
      `Valuasi premium (${formatMarketValue(player.marketValueEur)}) menekan ruang kompromi finansial apabila adaptasi memakan waktu.`
    );
  }
  if (params.aerialPhysicality > 75 && player.heightCm < 176) {
    risks.push(
      `Postur ${player.heightCm} cm memerlukan perlindungan struktur saat duel udara dan bola mati.`
    );
  }
  if (risks.length === 0) {
    risks.push(
      `Periode adaptasi awal diperlukan untuk menyinkronkan pemicu pressing dengan rekan satu sektor.`
    );
  }

  // Similar players based on radar vector distance + position match
  const similarPlayers = pool
    .filter((candidate) => candidate.fotmobId !== player.fotmobId)
    .map((candidate) => {
      const cr = candidate.radar;
      const distSq =
        Math.pow(r.attacking - cr.attacking, 2) +
        Math.pow(r.creativity - cr.creativity, 2) +
        Math.pow(r.progression - cr.progression, 2) +
        Math.pow(r.defending - cr.defending, 2) +
        Math.pow(r.workrate - cr.workrate, 2) +
        Math.pow(r.efficiency - cr.efficiency, 2);
      const rms = Math.sqrt(distSq / 6);
      const sameGroupBonus =
        getPositionGroup(candidate.primaryPosition) === posGroup ? 10 : -8;
      const similarityScore = Math.round(clamp(100 - rms * 1.15 + sameGroupBonus, 35, 98));

      const topTrait =
        cr.creativity >= cr.attacking && cr.creativity >= cr.defending
          ? 'kreativitas & progresi umpan'
          : cr.defending >= cr.attacking
          ? 'soliditas defensif & intersepsi'
          : 'ancaman kotak penalti & final third';

      return {
        player: candidate,
        similarityScore,
        reason: `Kemiripan profil ${topTrait} (${candidate.primaryPosition}, ${formatMarketValue(
          candidate.marketValueEur
        )}).`,
      };
    })
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 3);

  return {
    overallScore,
    subScores: {
      systemFit,
      roleCompatibility,
      physicalPressingDemand,
      marketValueROI,
    },
    strengths: strengths.slice(0, 3),
    risks: risks.slice(0, 3),
    similarPlayers,
  };
}

export function analyzeSquadBalance(
  slots: FormationSlot[],
  assignedBySlot: Record<string, Player | undefined>
): SquadBalanceReport {
  const assignedPlayers = slots
    .map((slot) => ({ slot, player: assignedBySlot[slot.slotId] }))
    .filter((item): item is { slot: FormationSlot; player: Player } => Boolean(item.player));

  const filledCount = assignedPlayers.length;
  if (filledCount === 0) {
    return {
      filledCount: 0,
      averageAge: 0,
      totalMarketValueEur: 0,
      balanceScore: 0,
      lineRatings: { attack: 0, midfield: 0, defense: 0 },
      pressingReadiness: 0,
      warnings: ['Pilih posisi di papan taktik untuk mulai menyusun XI terbaik.'],
    };
  }

  const totalAge = assignedPlayers.reduce((sum, item) => sum + item.player.age, 0);
  const totalMarketValueEur = assignedPlayers.reduce(
    (sum, item) => sum + item.player.marketValueEur,
    0
  );
  const averageAge = Number((totalAge / filledCount).toFixed(1));

  const byGroup = {
    FWD: assignedPlayers.filter((i) => i.slot.positionGroup === 'FWD'),
    MID: assignedPlayers.filter((i) => i.slot.positionGroup === 'MID'),
    DEF: assignedPlayers.filter((i) => i.slot.positionGroup === 'DEF' || i.slot.positionGroup === 'GK'),
  };

  const avgRadar = (
    list: Array<{ slot: FormationSlot; player: Player }>,
    fn: (p: Player) => number
  ) => {
    if (list.length === 0) return 0;
    return Math.round(list.reduce((s, i) => s + fn(i.player), 0) / list.length);
  };

  const attack = avgRadar(byGroup.FWD, (p) => (p.radar.attacking + p.radar.efficiency) / 2);
  const midfield = avgRadar(byGroup.MID, (p) => (p.radar.progression + p.radar.creativity) / 2);
  const defense = avgRadar(byGroup.DEF, (p) => (p.radar.defending + p.radar.efficiency) / 2);

  const pressingReadiness = Math.round(
    assignedPlayers.reduce((s, i) => s + i.player.radar.workrate, 0) / filledCount
  );

  // Check natural position mismatches
  const warnings: string[] = [];
  let mismatchPenalty = 0;
  for (const item of assignedPlayers) {
    const playerGroup = getPositionGroup(item.player.primaryPosition);
    if (playerGroup !== item.slot.positionGroup && item.slot.positionGroup !== 'GK') {
      mismatchPenalty += 4;
      warnings.push(
        `${item.player.name} (${item.player.primaryPosition}) ditempatkan sebagai ${item.slot.roleTitle}.`
      );
    }
  }

  if (filledCount < slots.length) {
    warnings.unshift(`Skuad terisi ${filledCount}/${slots.length} posisi.`);
  }
  if (pressingReadiness < 74 && filledCount >= 5) {
    warnings.push('Rata-rata workrate skuad di bawah 74; rentan saat transisi bertahan.');
  }

  const filledLines = [attack, midfield, defense].filter((v) => v > 0);
  const lineAvg =
    filledLines.length > 0
      ? filledLines.reduce((s, v) => s + v, 0) / filledLines.length
      : 0;
  const completenessFactor = filledCount / slots.length;
  const balanceScore = Math.round(
    clamp((lineAvg * 0.75 + pressingReadiness * 0.25) * completenessFactor - mismatchPenalty, 0, 99)
  );

  return {
    filledCount,
    averageAge,
    totalMarketValueEur,
    balanceScore,
    lineRatings: { attack, midfield, defense },
    pressingReadiness,
    warnings: warnings.slice(0, 4),
  };
}

export interface ComparisonMetricsSummary {
  mvPerGA: Record<string, number | null>;
  bestByMetric: Record<string, string[]>;
}

export function calculateComparisonEfficiency(players: Player[]): ComparisonMetricsSummary {
  const mvPerGA: Record<string, number | null> = {};

  for (const p of players) {
    const ga = p.stats.goals + p.stats.assists;
    mvPerGA[p.fotmobId] = ga > 0 ? Math.round(p.marketValueEur / ga) : null;
  }

  const numericMetrics: Array<{ key: string; getValue: (p: Player) => number; lowerIsBetter?: boolean }> = [
    { key: 'rating', getValue: (p) => p.stats.rating },
    { key: 'goals', getValue: (p) => p.stats.goals },
    { key: 'assists', getValue: (p) => p.stats.assists },
    { key: 'xG', getValue: (p) => p.stats.xG },
    { key: 'xA', getValue: (p) => p.stats.xA },
    { key: 'keyPassesPer90', getValue: (p) => p.stats.keyPassesPer90 },
    { key: 'progressiveCarriesPer90', getValue: (p) => p.stats.progressiveCarriesPer90 },
    { key: 'tacklesInterceptionsPer90', getValue: (p) => p.stats.tacklesInterceptionsPer90 },
    { key: 'passAccuracy', getValue: (p) => p.stats.passAccuracy },
    {
      key: 'mvPerGA',
      getValue: (p) => mvPerGA[p.fotmobId] ?? Number.MAX_SAFE_INTEGER,
      lowerIsBetter: true,
    },
  ];

  const bestByMetric: Record<string, string[]> = {};
  if (players.length > 0) {
    for (const metric of numericMetrics) {
      const vals = players.map((p) => metric.getValue(p));
      const target = metric.lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
      if (metric.key === 'mvPerGA' && target === Number.MAX_SAFE_INTEGER) {
        bestByMetric[metric.key] = [];
      } else {
        bestByMetric[metric.key] = players
          .filter((p) => metric.getValue(p) === target)
          .map((p) => p.fotmobId);
      }
    }
  }

  return { mvPerGA, bestByMetric };
}

const OPPONENTS_BY_LEAGUE: Record<string, string[]> = {
  'Premier League': [
    'Liverpool',
    'Arsenal',
    'Manchester City',
    'Chelsea',
    'Newcastle',
    'Aston Villa',
    'Tottenham',
    'Brighton',
    'West Ham',
    'Bournemouth',
    'Fulham',
  ],
  'La Liga': [
    'Real Madrid',
    'Barcelona',
    'Atlético Madrid',
    'Athletic Club',
    'Villarreal',
    'Real Sociedad',
    'Real Betis',
    'Sevilla',
    'Girona',
    'Valencia',
    'Osasuna',
  ],
  Bundesliga: [
    'Bayern Munich',
    'Bayer Leverkusen',
    'RB Leipzig',
    'Borussia Dortmund',
    'VfB Stuttgart',
    'Eintracht Frankfurt',
    'Freiburg',
    'Wolfsburg',
    'Mainz 05',
    'Werder Bremen',
    'Gladbach',
  ],
  'Serie A': [
    'Inter Milan',
    'Napoli',
    'Atalanta',
    'Juventus',
    'AC Milan',
    'Lazio',
    'Fiorentina',
    'Bologna',
    'AS Roma',
    'Torino',
    'Udinese',
  ],
  'Ligue 1': [
    'PSG',
    'Marseille',
    'Monaco',
    'Lille',
    'Nice',
    'Lyon',
    'Lens',
    'Rennes',
    'Strasbourg',
    'Brest',
    'Toulouse',
  ],
};

const EUROPEAN_OPPONENTS = [
  'Inter Milan',
  'Bayern Munich',
  'PSG',
  'Real Madrid',
  'Arsenal',
  'Borussia Dortmund',
  'Atalanta',
  'Benfica',
  'Sporting CP',
  'Juventus',
  'AC Milan',
];

function seededHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Returns up to 10 recent match FotMob ratings for a player.
 * Uses real GAS/curated records if present, otherwise builds a deterministic,
 * realistic 10-match series anchored to the player's FotMob season rating.
 */
export function getPlayerRecentMatches(player: Player): MatchRatingPoint[] {
  if (Array.isArray(player.recentMatches) && player.recentMatches.length >= 10) {
    return player.recentMatches.slice(-10);
  }

  const base = clamp(player.stats.rating || 7.15, 6.2, 8.6);
  const seedBase = seededHash(`${player.fotmobId}-${player.name}`);
  const pool = (OPPONENTS_BY_LEAGUE[player.league] || EUROPEAN_OPPONENTS).filter(
    (c) => c.toLowerCase() !== player.club.toLowerCase()
  );
  const euroPool = EUROPEAN_OPPONENTS.filter(
    (c) => c.toLowerCase() !== player.club.toLowerCase()
  );
  const posGroup = getPositionGroup(player.primaryPosition);
  const usedOpponents = new Set<string>();

  const matches: MatchRatingPoint[] = [];
  const baseDate = new Date('2025-02-22T00:00:00Z');

  for (let idx = 0; idx < 10; idx++) {
    // Chronological oldest -> newest (9 weeks ago .. most recent)
    const revIdx = 9 - idx;
    const h = seededHash(`${seedBase}-match-${idx}`);
    const wave = Math.sin(idx * 0.9 + (seedBase % 7)) * 0.42;
    const jitter = ((h % 100) / 100 - 0.48) * 0.95;
    const rawRating = base + wave + jitter;
    const rating = Number(clamp(rawRating, 5.7, 9.6).toFixed(2));

    const matchDate = new Date(baseDate.getTime() - revIdx * 6 * 24 * 60 * 60 * 1000);
    const dateStr = matchDate.toISOString().slice(0, 10);
    const activePool = idx % 4 === 2 ? euroPool : pool;
    let opponent = activePool[(seedBase + idx * 3) % Math.max(1, activePool.length)] || 'Sporting CP';
    if (usedOpponents.has(opponent)) {
      const fresh = activePool.find((cand) => !usedOpponents.has(cand));
      if (fresh) opponent = fresh;
    }
    usedOpponents.add(opponent);

    const comp = idx % 4 === 2 ? 'UCL' : player.league === 'BRI Liga 1' ? 'League' : player.league;
    const homeAway: 'H' | 'A' = (h >> 2) % 2 === 0 ? 'H' : 'A';

    const teamGoals = rating >= 8.2 ? 3 : rating >= 7.3 ? 2 : rating >= 6.6 ? 1 : 0;
    const oppGoals = rating >= 7.8 ? (h % 2) : rating >= 6.8 ? 1 + (h % 2) : 2 + (h % 2);
    const score = homeAway === 'H' ? `${teamGoals}-${oppGoals}` : `${oppGoals}-${teamGoals}`;

    const goals =
      posGroup === 'GK'
        ? 0
        : posGroup === 'FWD'
        ? rating >= 8.3
          ? 2
          : rating >= 7.45
          ? 1
          : 0
        : posGroup === 'MID'
        ? rating >= 8.1
          ? 1
          : 0
        : rating >= 8.45
        ? 1
        : 0;

    const assists =
      posGroup === 'GK'
        ? 0
        : rating >= 7.75 && (h >> 4) % 3 === 0
        ? 1
        : posGroup === 'MID' && rating >= 8.2
        ? 1
        : 0;

    const minutes = rating < 6.3 && (h >> 5) % 2 === 0 ? 64 : (h >> 6) % 5 === 0 ? 78 : 90;

    matches.push({
      id: `${player.fotmobId}-m${idx + 1}`,
      date: dateStr,
      competition: comp,
      opponent: opponent === player.club ? 'Atalanta' : opponent,
      homeAway,
      score,
      rating,
      minutes,
      goals,
      assists,
    });
  }

  return matches;
}

export function calculateMatchPrediction(options: {
  homeSlots: FormationSlot[];
  homeAssignments: Record<string, Player | undefined>;
  homeMentality: MatchMentality;
  awaySlots: FormationSlot[];
  awayAssignments: Record<string, Player | undefined>;
  awayMentality: MatchMentality;
}): MatchPredictionResult {
  const homeBalance = analyzeSquadBalance(options.homeSlots, options.homeAssignments);
  const awayBalance = analyzeSquadBalance(options.awaySlots, options.awayAssignments);

  const mentalityMods = (mentality: MatchMentality) => {
    if (mentality === 'High Press') {
      return { atk: 4.5, mid: 2.0, def: -2.5, press: 7.0 };
    }
    if (mentality === 'Counter Block') {
      return { atk: 1.0, mid: -2.0, def: 5.5, press: -4.0 };
    }
    return { atk: 2.0, mid: 3.0, def: 2.0, press: 2.0 };
  };

  const hm = mentalityMods(options.homeMentality);
  const am = mentalityMods(options.awayMentality);

  const avgFotmobRating = (
    slots: FormationSlot[],
    assignments: Record<string, Player | undefined>
  ) => {
    const filled = slots
      .map((s) => assignments[s.slotId])
      .filter((p): p is Player => Boolean(p));
    if (filled.length === 0) return 6.8;
    return filled.reduce((sum, p) => sum + p.stats.rating, 0) / filled.length;
  };

  const homeRatingAvg = avgFotmobRating(options.homeSlots, options.homeAssignments);
  const awayRatingAvg = avgFotmobRating(options.awaySlots, options.awayAssignments);

  const homeAttack = Math.round(clamp(homeBalance.lineRatings.attack + hm.atk, 35, 99));
  const awayAttack = Math.round(clamp(awayBalance.lineRatings.attack + am.atk, 35, 99));

  const homeMid = Math.round(clamp(homeBalance.lineRatings.midfield + hm.mid, 35, 99));
  const awayMid = Math.round(clamp(awayBalance.lineRatings.midfield + am.mid, 35, 99));

  const homeDef = Math.round(clamp(homeBalance.lineRatings.defense + hm.def, 35, 99));
  const awayDef = Math.round(clamp(awayBalance.lineRatings.defense + am.def, 35, 99));

  const homePress = Math.round(clamp(homeBalance.pressingReadiness + hm.press, 35, 99));
  const awayPress = Math.round(clamp(awayBalance.pressingReadiness + am.press, 35, 99));

  const homeStrength = Math.round(
    clamp(
      homeBalance.balanceScore * 0.45 +
        (homeRatingAvg - 6.0) * 18 +
        (homeAttack + homeMid + homeDef) / 6 +
        3.5, // modest home pitch advantage
      30,
      99
    )
  );

  const awayStrength = Math.round(
    clamp(
      awayBalance.balanceScore * 0.45 +
        (awayRatingAvg - 6.0) * 18 +
        (awayAttack + awayMid + awayDef) / 6,
      30,
      99
    )
  );

  const diff = homeStrength - awayStrength;
  const drawPct = Math.round(clamp(28 - Math.abs(diff) * 0.48, 13, 31));
  const remaining = 100 - drawPct;
  const homeShare = 1 / (1 + Math.exp(-diff * 0.085));
  const homeWinPct = Math.round(clamp(remaining * homeShare, 8, 82));
  const awayWinPct = Math.max(5, 100 - drawPct - homeWinPct);

  const tempoBoost =
    options.homeMentality === 'High Press' || options.awayMentality === 'High Press' ? 0.22 : 0;
  const blockDrag =
    options.homeMentality === 'Counter Block' && options.awayMentality === 'Counter Block'
      ? -0.25
      : 0;

  const rawHomeXg =
    1.28 + (homeAttack - awayDef) * 0.022 + (homeMid - awayMid) * 0.012 + tempoBoost + blockDrag;
  const rawAwayXg =
    1.12 + (awayAttack - homeDef) * 0.022 + (awayMid - homeMid) * 0.012 + tempoBoost + blockDrag;

  const projectedHomeXg = Number(clamp(rawHomeXg, 0.45, 3.35).toFixed(2));
  const projectedAwayXg = Number(clamp(rawAwayXg, 0.35, 3.15).toFixed(2));

  let predHome = Math.round(projectedHomeXg);
  let predAway = Math.round(projectedAwayXg);

  // Align predicted integer scoreline cleanly with top probability outcome when marginal
  if (homeWinPct > awayWinPct + 8 && predHome <= predAway) {
    predHome = predAway + 1;
  } else if (awayWinPct > homeWinPct + 8 && predAway <= predHome) {
    predAway = predHome + 1;
  }

  const tacticalEdges: MatchPredictionResult['tacticalEdges'] = [
    {
      label: 'Lini Serang',
      homeVal: homeAttack,
      awayVal: awayAttack,
      winner:
        Math.abs(homeAttack - awayAttack) <= 2
          ? 'even'
          : homeAttack > awayAttack
          ? 'home'
          : 'away',
    },
    {
      label: 'Kontrol Tengah',
      homeVal: homeMid,
      awayVal: awayMid,
      winner:
        Math.abs(homeMid - awayMid) <= 2 ? 'even' : homeMid > awayMid ? 'home' : 'away',
    },
    {
      label: 'Soliditas Bertahan',
      homeVal: homeDef,
      awayVal: awayDef,
      winner:
        Math.abs(homeDef - awayDef) <= 2 ? 'even' : homeDef > awayDef ? 'home' : 'away',
    },
    {
      label: 'Intensitas Press',
      homeVal: homePress,
      awayVal: awayPress,
      winner:
        Math.abs(homePress - awayPress) <= 2
          ? 'even'
          : homePress > awayPress
          ? 'home'
          : 'away',
    },
  ];

  let keyInsight =
    'Duel seimbang antar lini; kontrol setengah lapangan dan efisiensi peluang akan menentukan pemenang.';
  if (homeMid - awayMid >= 6) {
    keyInsight =
      'Tuan rumah memegang keunggulan kontrol poros tengah (+' +
      (homeMid - awayMid) +
      ' poin), ideal untuk mengurung blok lawan.';
  } else if (awayAttack - homeDef >= 6) {
    keyInsight =
      'Daya ledak lini depan tim tamu berpotensi mengeksploitasi celah di belakang garis pertahanan tuan rumah.';
  } else if (homeAttack - awayDef >= 6) {
    keyInsight =
      'Superioritas final-third tuan rumah memberi proyeksi xG tinggi (' +
      projectedHomeXg.toFixed(2) +
      ' xG).';
  } else if (awayPress - homePress >= 6) {
    keyInsight =
      'Intensitas pressing tim tamu lebih agresif dan siap memaksa kesalahan build-up tuan rumah.';
  }

  return {
    homeWinPct,
    drawPct,
    awayWinPct,
    projectedHomeXg,
    projectedAwayXg,
    predictedScore: {
      home: predHome,
      away: predAway,
    },
    homeStrength,
    awayStrength,
    tacticalEdges,
    keyInsight,
  };
}

