import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSquadBalance,
  calculateComparisonEfficiency,
  calculateMatchPrediction,
  calculateTacticalFit,
  formatMarketValue,
  getInitials,
  getPlayerRecentMatches,
} from './analytics';
import type { FormationSlot, Player } from '../types/footy';

const samplePlayers: Player[] = [
  {
    fotmobId: '675088',
    tmId: '357565',
    name: 'Rodri',
    nationality: 'Spain',
    age: 28,
    heightCm: 191,
    preferredFoot: 'Right',
    primaryPosition: 'DM',
    secondaryPositions: ['CM'],
    roleTag: 'Deep-Lying Playmaker',
    club: 'Manchester City',
    clubId: '8456',
    league: 'Premier League',
    contractUntil: '2027-06-30',
    marketValueEur: 130_000_000,
    marketValueChangePct: 8.3,
    highestMarketValueEur: 130_000_000,
    highestMarketValueDate: '2024-10-01',
    syncedToSheets: true,
    stats: {
      rating: 7.98,
      minutes: 2840,
      appearances: 32,
      goals: 8,
      assists: 9,
      xG: 5.1,
      xA: 6.4,
      keyPassesPer90: 1.8,
      progressiveCarriesPer90: 2.9,
      tacklesInterceptionsPer90: 3.6,
      passAccuracy: 92.6,
    },
    radar: {
      attacking: 74,
      creativity: 84,
      progression: 96,
      defending: 91,
      workrate: 88,
      efficiency: 95,
    },
    marketValueHistory: [],
    transferHistory: [],
  },
  {
    fotmobId: '1083323',
    tmId: '683840',
    name: 'Pedri',
    nationality: 'Spain',
    age: 22,
    heightCm: 174,
    preferredFoot: 'Right',
    primaryPosition: 'CM',
    secondaryPositions: ['CAM', 'DM'],
    roleTag: 'Tempo Controller',
    club: 'Barcelona',
    clubId: '8634',
    league: 'La Liga',
    contractUntil: '2026-06-30',
    marketValueEur: 100_000_000,
    marketValueChangePct: 11.1,
    highestMarketValueEur: 100_000_000,
    highestMarketValueDate: '2025-01-01',
    syncedToSheets: true,
    stats: {
      rating: 7.76,
      minutes: 2410,
      appearances: 28,
      goals: 5,
      assists: 7,
      xG: 3.9,
      xA: 7.1,
      keyPassesPer90: 2.5,
      progressiveCarriesPer90: 3.8,
      tacklesInterceptionsPer90: 2.3,
      passAccuracy: 90.4,
    },
    radar: {
      attacking: 72,
      creativity: 93,
      progression: 94,
      defending: 69,
      workrate: 84,
      efficiency: 91,
    },
    marketValueHistory: [],
    transferHistory: [],
  },
];

test('formatMarketValue formats millions and thousands cleanly', () => {
  assert.equal(formatMarketValue(130_000_000), '€130M');
  assert.equal(formatMarketValue(45_500_000), '€45.5M');
  assert.equal(formatMarketValue(850_000), '€850K');
  assert.equal(getInitials('Lamine Yamal'), 'LY');
});

test('calculateTacticalFit returns bounded scores and ranked similar players', () => {
  const fit = calculateTacticalFit(
    samplePlayers[0],
    {
      pressingIntensity: 85,
      possessionFocus: 90,
      transitionSpeed: 55,
      buildUpStyle: 92,
      defensiveLine: 82,
      aerialPhysicality: 68,
    },
    samplePlayers
  );

  assert.ok(fit.overallScore >= 0 && fit.overallScore <= 100);
  assert.ok(fit.subScores.systemFit >= 70);
  assert.equal(fit.similarPlayers.length, 1);
  assert.equal(fit.similarPlayers[0].player.fotmobId, '1083323');
});

test('analyzeSquadBalance computes average age, total MV, and warns on incomplete XI', () => {
  const slots: FormationSlot[] = [
    {
      slotId: 'dm',
      label: 'DM',
      roleTitle: 'Regista',
      positionGroup: 'MID',
      inPossession: { x: 50, y: 65 },
      outOfPossession: { x: 50, y: 70 },
    },
    {
      slotId: 'cm',
      label: 'CM',
      roleTitle: 'Mezzala',
      positionGroup: 'MID',
      inPossession: { x: 65, y: 48 },
      outOfPossession: { x: 60, y: 55 },
    },
  ];

  const report = analyzeSquadBalance(slots, {
    dm: samplePlayers[0],
    cm: samplePlayers[1],
  });

  assert.equal(report.filledCount, 2);
  assert.equal(report.averageAge, 25);
  assert.equal(report.totalMarketValueEur, 230_000_000);
  assert.ok(report.balanceScore > 75);
});

test('calculateComparisonEfficiency identifies best per-metric leaders and MV per G+A', () => {
  const summary = calculateComparisonEfficiency(samplePlayers);
  assert.deepEqual(summary.bestByMetric.rating, ['675088']);
  assert.deepEqual(summary.bestByMetric.keyPassesPer90, ['1083323']);
  assert.equal(summary.mvPerGA['675088'], Math.round(130_000_000 / 17));
});

test('getPlayerRecentMatches returns 10 bounded match ratings deterministically', () => {
  const matches = getPlayerRecentMatches(samplePlayers[0]);
  assert.equal(matches.length, 10);
  for (const m of matches) {
    assert.ok(m.rating >= 5.5 && m.rating <= 9.9, `rating out of range: ${m.rating}`);
    assert.ok(m.opponent.length > 0);
  }
  const secondRun = getPlayerRecentMatches(samplePlayers[0]);
  assert.deepEqual(matches, secondRun);
});

test('calculateMatchPrediction returns valid probabilities summing to 100 and reacts to player placement', () => {
  const slots: FormationSlot[] = [
    {
      slotId: 'dm',
      label: 'DM',
      roleTitle: 'Pivot',
      positionGroup: 'MID',
      inPossession: { x: 50, y: 55 },
      outOfPossession: { x: 50, y: 55 },
    },
    {
      slotId: 'cm',
      label: 'CM',
      roleTitle: 'Mezzala',
      positionGroup: 'MID',
      inPossession: { x: 65, y: 40 },
      outOfPossession: { x: 65, y: 40 },
    },
  ];

  const basePred = calculateMatchPrediction({
    homeSlots: slots,
    homeAssignments: { dm: samplePlayers[0], cm: samplePlayers[1] },
    homeMentality: 'Balanced',
    awaySlots: slots,
    awayAssignments: { dm: samplePlayers[1] },
    awayMentality: 'Balanced',
  });

  assert.equal(basePred.homeWinPct + basePred.drawPct + basePred.awayWinPct, 100);
  assert.ok(basePred.homeWinPct > basePred.awayWinPct);
  assert.ok(basePred.projectedHomeXg > 0.4 && basePred.projectedAwayXg > 0.3);

  const emptyHomePred = calculateMatchPrediction({
    homeSlots: slots,
    homeAssignments: {},
    homeMentality: 'Counter Block',
    awaySlots: slots,
    awayAssignments: { dm: samplePlayers[0], cm: samplePlayers[1] },
    awayMentality: 'High Press',
  });

  assert.equal(emptyHomePred.homeWinPct + emptyHomePred.drawPct + emptyHomePred.awayWinPct, 100);
  assert.ok(emptyHomePred.awayWinPct > emptyHomePred.homeWinPct);
});

