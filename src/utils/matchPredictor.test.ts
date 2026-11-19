import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSquadManagerSynergy,
  evaluateSlotFit,
  predictMatchFromLineups,
} from './matchPredictor';
import type { FormationSlot, Player, TeamManagerProfile } from '../types/footy';

function makePlayer(overrides: Partial<Player> & { fotmobId: string; name: string }): Player {
  return {
    tmId: '',
    nationality: 'England',
    age: 25,
    heightCm: 182,
    preferredFoot: 'Right',
    primaryPosition: 'CM',
    secondaryPositions: [],
    roleTag: 'Specialist',
    club: 'Test FC',
    clubId: '1',
    league: 'Premier League',
    contractUntil: '2028-06-30',
    marketValueEur: 55_000_000,
    marketValueChangePct: 0,
    highestMarketValueEur: 55_000_000,
    highestMarketValueDate: '2025-01',
    syncedToSheets: true,
    stats: {
      rating: 7.45,
      minutes: 2100,
      appearances: 25,
      goals: 5,
      assists: 5,
      xG: 4.4,
      xA: 4.2,
      keyPassesPer90: 1.8,
      progressiveCarriesPer90: 2.9,
      tacklesInterceptionsPer90: 2.4,
      passAccuracy: 87.5,
    },
    radar: {
      attacking: 78,
      creativity: 80,
      progression: 84,
      defending: 74,
      workrate: 82,
      efficiency: 85,
    },
    marketValueHistory: [],
    transferHistory: [],
    ...overrides,
  };
}

const sampleSlots: FormationSlot[] = [
  {
    slotId: 'gk',
    label: 'GK',
    roleTitle: 'Goalkeeper',
    positionGroup: 'GK',
    inPossession: { x: 50, y: 90 },
    outOfPossession: { x: 50, y: 90 },
  },
  {
    slotId: 'cb',
    label: 'CB',
    roleTitle: 'Center Back',
    positionGroup: 'DEF',
    inPossession: { x: 50, y: 74 },
    outOfPossession: { x: 50, y: 76 },
  },
  {
    slotId: 'cm',
    label: 'CM',
    roleTitle: 'Central Midfielder',
    positionGroup: 'MID',
    inPossession: { x: 50, y: 50 },
    outOfPossession: { x: 50, y: 52 },
  },
  {
    slotId: 'st',
    label: 'ST',
    roleTitle: 'Striker',
    positionGroup: 'FWD',
    inPossession: { x: 50, y: 20 },
    outOfPossession: { x: 50, y: 25 },
  },
];

test('evaluateSlotFit distinguishes natural, adjacent, and out-of-position placements', () => {
  assert.equal(evaluateSlotFit('ST', 'FWD'), 'natural');
  assert.equal(evaluateSlotFit('CM', 'FWD'), 'adjacent');
  assert.equal(evaluateSlotFit('ST', 'DEF'), 'outOfPosition');
  assert.equal(evaluateSlotFit('GK', 'FWD'), 'outOfPosition');
  assert.equal(evaluateSlotFit('ST', 'GK'), 'outOfPosition');
});

test('predictMatchFromLineups computes probabilities summing to 100 and penalizes out-of-position placements', () => {
  const gk = makePlayer({ fotmobId: '1', name: 'Keeper', primaryPosition: 'GK' });
  const cb = makePlayer({ fotmobId: '2', name: 'Defender', primaryPosition: 'CB' });
  const cm = makePlayer({ fotmobId: '3', name: 'Midfielder', primaryPosition: 'CM' });
  const st = makePlayer({
    fotmobId: '4',
    name: 'Striker',
    primaryPosition: 'ST',
    marketValueEur: 140_000_000,
    stats: {
      rating: 8.1,
      minutes: 2400,
      appearances: 28,
      goals: 22,
      assists: 4,
      xG: 19.5,
      xA: 3.1,
      keyPassesPer90: 1.5,
      progressiveCarriesPer90: 2.2,
      tacklesInterceptionsPer90: 0.6,
      passAccuracy: 79,
    },
    radar: {
      attacking: 96,
      creativity: 74,
      progression: 76,
      defending: 38,
      workrate: 79,
      efficiency: 92,
    },
  });

  const naturalMatch = predictMatchFromLineups({
    homeSlots: sampleSlots,
    homeAssignments: { gk, cb, cm, st },
    homeMentality: 'High Press',
    awaySlots: sampleSlots,
    awayAssignments: { gk, cb, cm, st },
    awayMentality: 'Balanced',
  });

  assert.equal(naturalMatch.homeWinPct + naturalMatch.drawPct + naturalMatch.awayWinPct, 100);
  assert.equal(naturalMatch.homeOutOfPositionCount, 0);
  assert.ok(naturalMatch.estimatedWinProbabilityPct > 0);

  // Swap GK into ST and ST into GK — out of position penalty should sharply lower homeWinPct
  const scrambledMatch = predictMatchFromLineups({
    homeSlots: sampleSlots,
    homeAssignments: { gk: st, cb: st, cm, st: gk },
    homeMentality: 'High Press',
    awaySlots: sampleSlots,
    awayAssignments: { gk, cb, cm, st },
    awayMentality: 'Balanced',
  });

  assert.equal(scrambledMatch.homeWinPct + scrambledMatch.drawPct + scrambledMatch.awayWinPct, 100);
  assert.ok(scrambledMatch.homeOutOfPositionCount >= 2);
  assert.ok(scrambledMatch.homeWinPct < naturalMatch.homeWinPct);
  assert.ok(scrambledMatch.homeStrength < naturalMatch.homeStrength);
});

test('calculateSquadManagerSynergy and predictMatchFromLineups reflect manager tactical parameters', () => {
  const gk = makePlayer({ fotmobId: '1', name: 'Keeper', primaryPosition: 'GK' });
  const cb = makePlayer({ fotmobId: '2', name: 'Defender', primaryPosition: 'CB' });
  const cm = makePlayer({ fotmobId: '3', name: 'Midfielder', primaryPosition: 'CM' });
  const st = makePlayer({ fotmobId: '4', name: 'Striker', primaryPosition: 'ST' });

  const eliteManager: TeamManagerProfile = {
    id: 'mgr-elite',
    managerName: 'Elite Coach',
    clubName: 'Test FC',
    league: 'Premier League',
    primaryFormation: '4-3-3',
    pointsPerGame: 2.32,
    winRatePct: 72.5,
    pressingIntensity: 84,
    possessionFocus: 85,
    transitionSpeed: 74,
    buildUpStyle: 85,
    defensiveLine: 80,
    aerialPhysicality: 75,
    tacticalSummary: 'Possession & high press.',
  };

  const lowSynergyManager: TeamManagerProfile = {
    id: 'mgr-low',
    managerName: 'Low Pedigree Coach',
    clubName: 'Other FC',
    league: 'Premier League',
    primaryFormation: '5-4-1',
    pointsPerGame: 1.05,
    winRatePct: 28.0,
    pressingIntensity: 99,
    possessionFocus: 30,
    transitionSpeed: 95,
    buildUpStyle: 32,
    defensiveLine: 30,
    aerialPhysicality: 98,
    tacticalSummary: 'Deep direct block.',
  };

  const synHigh = calculateSquadManagerSynergy(sampleSlots, { gk, cb, cm, st }, eliteManager, '4-3-3');
  const synLow = calculateSquadManagerSynergy(sampleSlots, { gk, cb, cm, st }, lowSynergyManager, '4-3-3');
  assert.ok(synHigh.synergyScore > synLow.synergyScore);

  const res = predictMatchFromLineups({
    homeSlots: sampleSlots,
    homeAssignments: { gk, cb, cm, st },
    homeMentality: 'Balanced',
    homeFormationName: '4-3-3',
    homeManager: eliteManager,
    awaySlots: sampleSlots,
    awayAssignments: { gk, cb, cm, st },
    awayMentality: 'Balanced',
    awayFormationName: '4-3-3',
    awayManager: lowSynergyManager,
  });

  assert.ok(res.tacticalEdges.some((e) => e.label === 'Sinergi Pelatih'));
  assert.ok((res.homeManagerSynergyPct ?? 0) > (res.awayManagerSynergyPct ?? 0));
  assert.ok(res.homeWinPct > res.awayWinPct);
});
