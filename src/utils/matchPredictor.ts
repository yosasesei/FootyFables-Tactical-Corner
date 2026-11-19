import type {
  FormationSlot,
  MatchMentality,
  MatchPredictionResult,
  Player,
} from '../types/footy';
import { clamp, getPositionGroup } from './analytics';

export type SlotFitQuality = 'natural' | 'adjacent' | 'outOfPosition';

export interface EnhancedMatchPrediction extends MatchPredictionResult {
  favoredSide: 'home' | 'away' | 'draw';
  estimatedWinProbabilityPct: number;
  homeOutOfPositionCount: number;
  awayOutOfPositionCount: number;
  homeLineupCompletenessPct: number;
  awayLineupCompletenessPct: number;
  homeSquadMarketValueEur: number;
  awaySquadMarketValueEur: number;
}

export function evaluateSlotFit(playerPosition: string, slotGroup: FormationSlot['positionGroup']): SlotFitQuality {
  const playerGroup = getPositionGroup(playerPosition);
  if (playerGroup === slotGroup) return 'natural';
  if (slotGroup === 'GK' || playerGroup === 'GK') return 'outOfPosition';
  if (
    (playerGroup === 'MID' && (slotGroup === 'DEF' || slotGroup === 'FWD')) ||
    (slotGroup === 'MID' && (playerGroup === 'DEF' || playerGroup === 'FWD'))
  ) {
    return 'adjacent';
  }
  return 'outOfPosition';
}

function getSlotFitMultiplier(fit: SlotFitQuality): number {
  if (fit === 'natural') return 1.03;
  if (fit === 'adjacent') return 0.93;
  return 0.72;
}

function getMentalityModifiers(mentality: MatchMentality) {
  if (mentality === 'High Press') {
    return { atk: 4.5, mid: 2.0, def: -2.5, press: 7.0 };
  }
  if (mentality === 'Counter Block') {
    return { atk: 1.0, mid: -2.0, def: 5.5, press: -4.0 };
  }
  return { atk: 2.0, mid: 3.0, def: 2.0, press: 2.0 };
}

function computeTeamTelemetry(
  slots: FormationSlot[],
  assignments: Record<string, Player | undefined>,
  mentality: MatchMentality
) {
  const filledEntries = slots
    .map((slot) => ({ slot, player: assignments[slot.slotId] }))
    .filter((entry): entry is { slot: FormationSlot; player: Player } => Boolean(entry.player));

  const mods = getMentalityModifiers(mentality);
  const completeness = slots.length > 0 ? filledEntries.length / slots.length : 0;

  if (filledEntries.length === 0) {
    return {
      filledCount: 0,
      completenessPct: 0,
      outOfPositionCount: 0,
      avgRating: 6.4,
      totalMarketValueEur: 0,
      attack: 36,
      midfield: 36,
      defense: 36,
      pressing: 36,
      strength: 32,
    };
  }

  let outOfPositionCount = 0;
  let totalFitMultiplier = 0;
  let ratingSum = 0;
  let totalMarketValueEur = 0;

  const fwdScores: number[] = [];
  const midScores: number[] = [];
  const defScores: number[] = [];
  const workrates: number[] = [];

  for (const { slot, player } of filledEntries) {
    const fit = evaluateSlotFit(player.primaryPosition, slot.positionGroup);
    if (fit === 'outOfPosition') outOfPositionCount += 1;
    const fitMult = getSlotFitMultiplier(fit);
    totalFitMultiplier += fitMult;

    const mins90 = Math.max(1, player.stats.minutes / 90);
    const xgPer90 = player.stats.xG / mins90;
    const xaPer90 = player.stats.xA / mins90;
    const ratingFactor = clamp(player.stats.rating * 10.5, 58, 96);

    ratingSum += player.stats.rating * (fit === 'outOfPosition' ? 0.88 : fit === 'adjacent' ? 0.96 : 1);
    totalMarketValueEur += player.marketValueEur || 0;
    workrates.push(player.radar.workrate * fitMult);

    if (slot.positionGroup === 'FWD') {
      const threatBonus = clamp(xgPer90 * 24 + xaPer90 * 16 + player.stats.keyPassesPer90 * 3, 0, 18);
      const score = (player.radar.attacking * 0.48 + player.radar.efficiency * 0.27 + ratingFactor * 0.25 + threatBonus * 0.35) * fitMult;
      fwdScores.push(score);
    } else if (slot.positionGroup === 'MID') {
      const controlBonus = clamp(
        player.stats.keyPassesPer90 * 4 + (player.stats.passAccuracy - 72) * 0.5 + xaPer90 * 20,
        0,
        18
      );
      const score =
        (player.radar.progression * 0.36 +
          player.radar.creativity * 0.34 +
          player.radar.efficiency * 0.16 +
          ratingFactor * 0.14 +
          controlBonus * 0.35) *
        fitMult;
      midScores.push(score);
    } else {
      const defBonus = clamp(
        player.stats.tacklesInterceptionsPer90 * 2.5 + (player.stats.passAccuracy - 74) * 0.35,
        0,
        14
      );
      const score =
        (player.radar.defending * 0.5 +
          player.radar.efficiency * 0.25 +
          ratingFactor * 0.25 +
          defBonus * 0.35) *
        fitMult;
      defScores.push(score);
    }
  }

  const avg = (arr: number[], fallback: number) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : fallback;

  const avgFit = totalFitMultiplier / filledEntries.length;
  const completenessScale = 0.35 + 0.65 * completeness;

  const attack = Math.round(clamp((avg(fwdScores, 60) + mods.atk) * completenessScale, 32, 99));
  const midfield = Math.round(clamp((avg(midScores, 60) + mods.mid) * completenessScale, 32, 99));
  const defense = Math.round(clamp((avg(defScores, 60) + mods.def) * completenessScale, 32, 99));
  const pressing = Math.round(clamp((avg(workrates, 68) + mods.press) * completenessScale, 32, 99));

  const avgRating = ratingSum / filledEntries.length;
  const mvLogBoost = clamp(Math.log10(Math.max(10_000_000, totalMarketValueEur) / 10_000_000) * 3.2, 0, 7);
  const mismatchPenalty = outOfPositionCount * 4.2;

  const rawStrength =
    ((attack * 0.29 + midfield * 0.31 + defense * 0.28 + pressing * 0.12) * 0.65 +
      (avgRating - 6.0) * 18 * avgFit +
      mvLogBoost -
      mismatchPenalty) *
    completenessScale;

  const strength = Math.round(clamp(rawStrength, 30, 99));

  return {
    filledCount: filledEntries.length,
    completenessPct: Math.round(completeness * 100),
    outOfPositionCount,
    avgRating,
    totalMarketValueEur,
    attack,
    midfield,
    defense,
    pressing,
    strength,
  };
}

export function predictMatchFromLineups(options: {
  homeSlots: FormationSlot[];
  homeAssignments: Record<string, Player | undefined>;
  homeMentality: MatchMentality;
  awaySlots: FormationSlot[];
  awayAssignments: Record<string, Player | undefined>;
  awayMentality: MatchMentality;
}): EnhancedMatchPrediction {
  const home = computeTeamTelemetry(options.homeSlots, options.homeAssignments, options.homeMentality);
  const away = computeTeamTelemetry(options.awaySlots, options.awayAssignments, options.awayMentality);

  // Modest home ground edge (+3.2 points)
  const homeStrength = Math.round(clamp(home.strength + (home.filledCount > 0 ? 3.2 : 0), 30, 99));
  const awayStrength = away.strength;

  const diff = homeStrength - awayStrength;
  const drawPct = Math.round(clamp(28 - Math.abs(diff) * 0.45, 12, 31));
  const remaining = 100 - drawPct;
  const homeShare = 1 / (1 + Math.exp(-diff * 0.095));
  const homeWinPct = Math.round(clamp(remaining * homeShare, 6, 84));
  const awayWinPct = Math.max(4, 100 - drawPct - homeWinPct);

  const tempoBoost =
    options.homeMentality === 'High Press' || options.awayMentality === 'High Press' ? 0.22 : 0;
  const blockDrag =
    options.homeMentality === 'Counter Block' && options.awayMentality === 'Counter Block'
      ? -0.25
      : 0;

  const rawHomeXg =
    1.28 + (home.attack - away.defense) * 0.023 + (home.midfield - away.midfield) * 0.012 + tempoBoost + blockDrag;
  const rawAwayXg =
    1.12 + (away.attack - home.defense) * 0.023 + (away.midfield - home.midfield) * 0.012 + tempoBoost + blockDrag;

  const projectedHomeXg = Number(clamp(rawHomeXg, 0.35, 3.6).toFixed(2));
  const projectedAwayXg = Number(clamp(rawAwayXg, 0.3, 3.4).toFixed(2));

  let predHome = Math.round(projectedHomeXg);
  let predAway = Math.round(projectedAwayXg);

  if (homeWinPct > awayWinPct + 8 && predHome <= predAway) {
    predHome = predAway + 1;
  } else if (awayWinPct > homeWinPct + 8 && predAway <= predHome) {
    predAway = predHome + 1;
  }

  const tacticalEdges: MatchPredictionResult['tacticalEdges'] = [
    {
      label: 'Lini Serang',
      homeVal: home.attack,
      awayVal: away.attack,
      winner:
        Math.abs(home.attack - away.attack) <= 2
          ? 'even'
          : home.attack > away.attack
          ? 'home'
          : 'away',
    },
    {
      label: 'Kontrol Tengah',
      homeVal: home.midfield,
      awayVal: away.midfield,
      winner:
        Math.abs(home.midfield - away.midfield) <= 2
          ? 'even'
          : home.midfield > away.midfield
          ? 'home'
          : 'away',
    },
    {
      label: 'Soliditas Bertahan',
      homeVal: home.defense,
      awayVal: away.defense,
      winner:
        Math.abs(home.defense - away.defense) <= 2
          ? 'even'
          : home.defense > away.defense
          ? 'home'
          : 'away',
    },
    {
      label: 'Intensitas Press',
      homeVal: home.pressing,
      awayVal: away.pressing,
      winner:
        Math.abs(home.pressing - away.pressing) <= 2
          ? 'even'
          : home.pressing > away.pressing
          ? 'home'
          : 'away',
    },
  ];

  let keyInsight =
    'Duel seimbang antar lini; kontrol setengah lapangan dan efisiensi peluang akan menentukan pemenang.';
  if (home.outOfPositionCount > 0 && home.outOfPositionCount > away.outOfPositionCount) {
    keyInsight = `Terdapat ${home.outOfPositionCount} pemain tuan rumah di luar posisi natural — menempatkan pemain sesuai peran akan menaikkan Estimated Match Win Probability.`;
  } else if (away.outOfPositionCount > 0 && away.outOfPositionCount > home.outOfPositionCount) {
    keyInsight = `Tim tamu memiliki ${away.outOfPositionCount} pemain di luar posisi natural, membuka celah struktur bagi tuan rumah.`;
  } else if (home.midfield - away.midfield >= 6) {
    keyInsight = `Tuan rumah memegang keunggulan kontrol poros tengah (+${home.midfield - away.midfield} poin), ideal untuk mengurung blok lawan.`;
  } else if (away.attack - home.defense >= 6) {
    keyInsight =
      'Daya ledak lini depan tim tamu berpotensi mengeksploitasi celah di belakang garis pertahanan tuan rumah.';
  } else if (home.attack - away.defense >= 6) {
    keyInsight = `Superioritas final-third tuan rumah memberi proyeksi xG tinggi (${projectedHomeXg.toFixed(2)} xG).`;
  } else if (away.pressing - home.pressing >= 6) {
    keyInsight =
      'Intensitas pressing tim tamu lebih agresif dan siap memaksa kesalahan build-up tuan rumah.';
  }

  const favoredSide: EnhancedMatchPrediction['favoredSide'] =
    Math.abs(homeWinPct - awayWinPct) <= 4 && drawPct >= Math.min(homeWinPct, awayWinPct)
      ? 'draw'
      : homeWinPct >= awayWinPct
      ? 'home'
      : 'away';

  const estimatedWinProbabilityPct =
    favoredSide === 'home' ? homeWinPct : favoredSide === 'away' ? awayWinPct : drawPct;

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
    favoredSide,
    estimatedWinProbabilityPct,
    homeOutOfPositionCount: home.outOfPositionCount,
    awayOutOfPositionCount: away.outOfPositionCount,
    homeLineupCompletenessPct: home.completenessPct,
    awayLineupCompletenessPct: away.completenessPct,
    homeSquadMarketValueEur: home.totalMarketValueEur,
    awaySquadMarketValueEur: away.totalMarketValueEur,
  };
}
