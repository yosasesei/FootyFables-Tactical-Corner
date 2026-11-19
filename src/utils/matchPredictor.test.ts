import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSlotFit, predictMatchFromLineups } from './matchPredictor';
import type { FormationSlot, Player } from '../types/footy';

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
