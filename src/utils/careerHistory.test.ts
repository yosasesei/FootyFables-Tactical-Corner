import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_VALUATION_MONTH,
  buildTransferHistory,
  buildUpToDateMarketValueHistory,
  ensureUpToDatePlayerCareer,
  extractTeamTransfersMap,
  resolveContractUntil,
} from './careerHistory';
import { WORLD_MANAGERS, buildDynamicManagerProfile } from '../data/worldManagers';
import type { Player } from '../types/footy';

function makeMinimalPlayer(overrides: Partial<Player> = {}): Player {
  return {
    fotmobId: '999999',
    tmId: '',
    name: 'Test Player',
    nationality: 'Spain',
    age: 23,
    heightCm: 180,
    preferredFoot: 'Right',
    primaryPosition: 'CM',
    secondaryPositions: [],
    roleTag: 'Playmaker',
    club: 'Arsenal',
    clubId: '9825',
    league: 'Premier League',
    contractUntil: '2027-06-30',
    marketValueEur: 62_000_000,
    marketValueChangePct: 0,
    highestMarketValueEur: 62_000_000,
    highestMarketValueDate: '2024-06',
    syncedToSheets: true,
    stats: {
      rating: 7.4,
      minutes: 2100,
      appearances: 25,
      goals: 5,
      assists: 7,
      xG: 4.1,
      xA: 5.5,
      keyPassesPer90: 2.0,
      progressiveCarriesPer90: 3.1,
      tacklesInterceptionsPer90: 2.2,
      passAccuracy: 88.5,
    },
    radar: {
      attacking: 76,
      creativity: 85,
      progression: 87,
      defending: 70,
      workrate: 81,
      efficiency: 84,
    },
    marketValueHistory: [],
    transferHistory: [],
    ...overrides,
  };
}

test('buildUpToDateMarketValueHistory anchors latest point to 2026-11 and backfills sparse history', () => {
  const { history } = buildUpToDateMarketValueHistory({
    fotmobId: '999999',
    name: 'Test Player',
    age: 23,
    club: 'Arsenal',
    currentMvEur: 62_000_000,
    rawHistory: [{ date: '2024-10-01', valueEur: 48_000_000, club: 'Arsenal' }],
  });

  assert.ok(history.length >= 3);
  assert.equal(history[history.length - 1].date, CURRENT_VALUATION_MONTH);
  assert.equal(history[history.length - 1].date, '2026-11');
  assert.equal(history[history.length - 1].valueEur, 62_000_000);
});

test('resolveContractUntil replaces legacy 2027-06-30 placeholder with curated or age-curved contracts', () => {
  const haalandContract = resolveContractUntil({
    fotmobId: '737066',
    name: 'Erling Haaland',
    age: 26,
    rawContract: '2027-06-30',
  });
  assert.equal(haalandContract, '2034-06-30');

  const youngUnknown = resolveContractUntil({
    fotmobId: '881234',
    name: 'Young Prospect',
    age: 21,
    rawContract: '2027-06-30',
  });
  assert.notEqual(youngUnknown, '2027-06-30');
  assert.match(youngUnknown, /^20(29|30|31)-06-30$/);
});

test('buildTransferHistory never returns an empty timeline and merges curated or team transfer events', () => {
  const rodriTransfers = buildTransferHistory({
    fotmobId: '675088',
    name: 'Rodri',
    age: 30,
    club: 'Manchester City',
  });
  assert.ok(rodriTransfers.length >= 2);
  assert.equal(rodriTransfers[0].toClub, 'Manchester City');

  const fallbackTransfers = buildTransferHistory({
    fotmobId: '777777',
    name: 'Academy Graduate',
    age: 20,
    club: 'Ajax',
  });
  assert.ok(fallbackTransfers.length >= 1);
  assert.equal(fallbackTransfers[0].toClub, 'Ajax');
});

test('extractTeamTransfersMap parses FotMob getTeam transfers payload into transfers, contracts, and MV points', () => {
  const map = extractTeamTransfersMap({
    transfers: {
      data: {
        'Players in': [
          {
            playerId: 123456,
            name: 'New Signing',
            fromClub: 'Valencia CF',
            toClub: 'Arsenal',
            transferDate: '2025-07-12T00:00:00.000Z',
            toDate: '2030-06-30',
            amountEuroEstimated: 45_000_000,
            marketValue: 50_000_000,
            fee: { value: 45_000_000, feeText: '€45M' },
          },
        ],
      },
    },
  });

  const entry = map.get('123456');
  assert.ok(entry);
  assert.equal(entry.contractUntil, '2030-06-30');
  assert.equal(entry.transfers.length, 1);
  assert.equal(entry.transfers[0].fromClub, 'Valencia CF');
  assert.equal(entry.transfers[0].toClub, 'Arsenal');
});

test('ensureUpToDatePlayerCareer enriches player with 2026-11 MV point and non-empty transfers', () => {
  const enriched = ensureUpToDatePlayerCareer(
    makeMinimalPlayer({ fotmobId: '955406', name: 'William Saliba', club: 'Arsenal' })
  );
  assert.equal(enriched.contractUntil, '2030-06-30');
  assert.equal(enriched.marketValueHistory[enriched.marketValueHistory.length - 1].date, '2026-11');
  assert.ok(enriched.transferHistory.length >= 2);
});

test('WORLD_MANAGERS and buildDynamicManagerProfile provide global coaching telemetry and live team enrichment', () => {
  assert.ok(WORLD_MANAGERS.length >= 35);
  assert.ok(WORLD_MANAGERS.every((m) => typeof m.pointsPerGame === 'number' && typeof m.winRatePct === 'number'));

  const dynamic = buildDynamicManagerProfile({
    name: 'Thomas Tuchel',
    clubName: 'England',
    league: 'International',
    coachHistory: [{ name: 'Thomas Tuchel', win: 270, draw: 75, loss: 75 }],
  });
  assert.equal(dynamic.managerName, 'Thomas Tuchel');
  assert.ok((dynamic.winRatePct ?? 0) >= 55);
  assert.ok((dynamic.pointsPerGame ?? 0) >= 1.7);
});
