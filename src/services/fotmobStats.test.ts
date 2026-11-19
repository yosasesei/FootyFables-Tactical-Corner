import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTelemetryToPlayer,
  computeRadarFromStats,
  estimateMarketValueFromProfile,
  mergeTelemetryMaps,
  parseFotmobStatJson,
} from './fotmobStats';
import type { Player } from '../types/footy';

test('parseFotmobStatJson handles FotMob ParticiantId typo and extracts stat metrics', () => {
  const sampleJson = {
    TopLists: [
      {
        StatList: [
          {
            ParticiantId: 737066,
            ParticipantName: 'Erling Haaland',
            TeamId: 8456,
            TeamName: 'Manchester City',
            StatValue: 21.45,
            SubStatValue: 22,
            MinutesPlayed: 2340,
            MatchesPlayed: 27,
          },
        ],
      },
    ],
  };

  const parsed = parseFotmobStatJson(sampleJson);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].participantId, '737066');
  assert.equal(parsed[0].statValue, 21.45);
  assert.equal(parsed[0].minutesPlayed, 2340);
});

test('mergeTelemetryMaps combines rating, xG, xA, key passes, tackles, and pass accuracy by participantId', () => {
  const merged = mergeTelemetryMaps({
    rating: [
      {
        participantId: '961995',
        name: 'Bukayo Saka',
        teamId: '9825',
        teamName: 'Arsenal',
        countryCode: 'ENG',
        statValue: 7.71,
        subStatValue: 0,
        minutesPlayed: 1980,
        matchesPlayed: 23,
      },
    ],
    expected_goals: [
      {
        participantId: '961995',
        name: 'Bukayo Saka',
        teamId: '9825',
        teamName: 'Arsenal',
        countryCode: 'ENG',
        statValue: 9.8,
        subStatValue: 10,
        minutesPlayed: 1980,
        matchesPlayed: 23,
      },
    ],
    expected_assists: [
      {
        participantId: '961995',
        name: 'Bukayo Saka',
        teamId: '9825',
        teamName: 'Arsenal',
        countryCode: 'ENG',
        statValue: 7.4,
        subStatValue: 8,
        minutesPlayed: 1980,
        matchesPlayed: 23,
      },
    ],
    total_att_assist: [
      {
        participantId: '961995',
        name: 'Bukayo Saka',
        teamId: '9825',
        teamName: 'Arsenal',
        countryCode: 'ENG',
        statValue: 55,
        subStatValue: 2.5,
        minutesPlayed: 1980,
        matchesPlayed: 23,
      },
    ],
    accurate_pass: [
      {
        participantId: '961995',
        name: 'Bukayo Saka',
        teamId: '9825',
        teamName: 'Arsenal',
        countryCode: 'ENG',
        statValue: 32.4,
        subStatValue: 84.9,
        minutesPlayed: 1980,
        matchesPlayed: 23,
      },
    ],
  });

  const saka = merged.get('961995');
  assert.ok(saka);
  assert.equal(saka.rating, 7.71);
  assert.equal(saka.xG, 9.8);
  assert.equal(saka.xA, 7.4);
  assert.equal(saka.keyPassesPer90, 2.5);
  assert.equal(saka.passAccuracy, 84.9);
});

test('estimateMarketValueFromProfile produces realistic age and rating-differentiated values (never static €15M)', () => {
  const wonderkidMv = estimateMarketValueFromProfile(7.65, 20, 'RW');
  const veteranGkMv = estimateMarketValueFromProfile(6.75, 33, 'GK');
  assert.ok(wonderkidMv > 50_000_000);
  assert.ok(veteranGkMv < 5_000_000);
  assert.notEqual(wonderkidMv, 15_000_000);
});

test('applyTelemetryToPlayer enriches sparse player stats and recomputes position-calibrated radar', () => {
  const sparsePlayer: Player = {
    fotmobId: '961995',
    tmId: '',
    name: 'Bukayo Saka',
    nationality: 'England',
    age: 24,
    heightCm: 178,
    preferredFoot: 'Left',
    primaryPosition: 'RW',
    secondaryPositions: ['CAM'],
    roleTag: 'Winger',
    club: 'Arsenal',
    clubId: '9825',
    league: 'Premier League',
    contractUntil: '2027-06-30',
    marketValueEur: 97_092_702,
    marketValueChangePct: 0,
    highestMarketValueEur: 97_092_702,
    highestMarketValueDate: '2025-01',
    syncedToSheets: true,
    stats: {
      rating: 7.71,
      minutes: 0,
      appearances: 0,
      goals: 3,
      assists: 2,
      xG: 0,
      xA: 0,
      keyPassesPer90: 0,
      progressiveCarriesPer90: 0,
      tacklesInterceptionsPer90: 0,
      passAccuracy: 0,
    },
    radar: computeRadarFromStats(
      {
        rating: 7.71,
        minutes: 1000,
        appearances: 12,
        goals: 3,
        assists: 2,
        xG: 0,
        xA: 0,
        keyPassesPer90: 0,
        progressiveCarriesPer90: 0,
        tacklesInterceptionsPer90: 0,
        passAccuracy: 0,
      },
      'RW'
    ),
    marketValueHistory: [],
    transferHistory: [],
  };

  const hydrated = applyTelemetryToPlayer(sparsePlayer, {
    fotmobId: '961995',
    rating: 7.71,
    minutes: 1850,
    appearances: 22,
    goals: 8,
    assists: 7,
    xG: 7.5,
    xA: 6.2,
    keyPassesPer90: 2.45,
    passAccuracy: 85.1,
    successfulDribblesPer90: 2.1,
    lineBreakingPassesPer90: 4.5,
    tacklesPer90: 1.4,
    interceptionsPer90: 0.6,
  });

  assert.equal(hydrated.stats.xG, 7.5);
  assert.equal(hydrated.stats.xA, 6.2);
  assert.equal(hydrated.stats.keyPassesPer90, 2.45);
  assert.equal(hydrated.stats.passAccuracy, 85.1);
  assert.ok(hydrated.stats.progressiveCarriesPer90 > 2);
  assert.equal(hydrated.stats.tacklesInterceptionsPer90, 2);
  assert.ok(hydrated.radar.creativity > 80);
});

test('applyTelemetryToPlayer prefers live current-season goals/assists over stale higher fallback counts', () => {
  const stalePlayer: Player = {
    fotmobId: '737066',
    tmId: '418560',
    name: 'Erling Haaland',
    nationality: 'Norway',
    age: 25,
    heightCm: 195,
    preferredFoot: 'Left',
    primaryPosition: 'ST',
    secondaryPositions: [],
    roleTag: 'Poacher',
    club: 'Manchester City',
    clubId: '8456',
    league: 'Premier League',
    contractUntil: '2034-06-30',
    marketValueEur: 159_349_200,
    marketValueChangePct: 0,
    highestMarketValueEur: 200_000_000,
    highestMarketValueDate: '2024-10',
    syncedToSheets: true,
    stats: {
      rating: 7.7,
      minutes: 2800,
      appearances: 33,
      goals: 27,
      assists: 4,
      xG: 24.5,
      xA: 3.1,
      keyPassesPer90: 0.9,
      progressiveCarriesPer90: 1.5,
      tacklesInterceptionsPer90: 0.3,
      passAccuracy: 74,
    },
    radar: computeRadarFromStats(
      {
        rating: 7.7,
        minutes: 2800,
        appearances: 33,
        goals: 27,
        assists: 4,
        xG: 24.5,
        xA: 3.1,
        keyPassesPer90: 0.9,
        progressiveCarriesPer90: 1.5,
        tacklesInterceptionsPer90: 0.3,
        passAccuracy: 74,
      },
      'ST'
    ),
    marketValueHistory: [],
    transferHistory: [],
  };

  const live = applyTelemetryToPlayer(stalePlayer, {
    fotmobId: '737066',
    rating: 7.69,
    minutes: 890,
    appearances: 10,
    goals: 9,
    assists: 0,
    xG: 7.1,
    xA: 0.9,
    passAccuracy: 66.7,
  });

  assert.equal(live.stats.goals, 9);
  assert.equal(live.stats.assists, 0);
  assert.equal(live.stats.minutes, 890);
  assert.equal(live.stats.appearances, 10);
});
