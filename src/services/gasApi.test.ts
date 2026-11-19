import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GAS_API_URL,
  getGasApiUrl,
  namesRoughlyMatch,
  normalizeGasPlayer,
} from './gasApi';

test('getGasApiUrl falls back to provided live GAS endpoint', () => {
  assert.equal(getGasApiUrl(), DEFAULT_GAS_API_URL);
  assert.ok(DEFAULT_GAS_API_URL.startsWith('https://script.google.com/macros/s/'));
});

test('normalizeGasPlayer maps snake_case GAS payload, radar_json, marketHistory, and transferHistory', () => {
  const normalized = normalizeGasPlayer(
    {
      fotmob_id: '961995',
      tm_id: '357565',
      name: 'Rodri Test',
      club: 'Manchester City',
      league: 'Premier League',
      nationality: 'Spain',
      age: 28,
      height_cm: 191,
      position: 'DM',
      preferred_foot: 'Right',
      fotmob_rating: 8.05,
      minutes_played: 2900,
      goals: 8,
      assists: 9,
      xg: 4.9,
      xa: 6.1,
      key_passes_p90: 1.85,
      prog_carries_p90: 2.95,
      tackles_int_p90: 3.65,
      pass_accuracy: 92.8,
      radar_json: JSON.stringify({
        attacking: 75,
        creativity: 85,
        progression: 97,
        defending: 92,
        workrate: 89,
        efficiency: 96,
      }),
      market_value_eur: 130_000_000,
      mv_change_pct: 8.3,
      contract_until: '2027-06-30',
      is_cached: true,
    },
    [
      {
        date: '2024-10-01',
        club_at_date: 'Manchester City',
        value_eur: 130_000_000,
      },
    ],
    [
      {
        season: '19/20',
        date: '2019-07-04',
        from_club: 'Atlético Madrid',
        to_club: 'Manchester City',
        fee_eur: 70_000_000,
        fee_display: '€70.0M',
        transfer_type: 'Permanent',
      },
    ]
  );

  assert.equal(normalized.fotmobId, '961995');
  assert.equal(normalized.stats.rating, 8.05);
  assert.equal(normalized.radar.progression, 97);
  assert.equal(normalized.marketValueHistory.length, 1);
  assert.equal(normalized.marketValueHistory[0].date, '2024-10');
  assert.equal(normalized.transferHistory.length, 1);
  assert.equal(normalized.transferHistory[0].fromClub, 'Atlético Madrid');
  assert.equal(normalized.syncedToSheets, true);
});

test('normalizeGasPlayer prevents GAS zeros and €15M legacy placeholders from overwriting live transferValue & telemetry', () => {
  const player = normalizeGasPlayer(
    {
      fotmob_id: '737066',
      name: 'Erling Haaland',
      club: 'Manchester City',
      club_id: '8456',
      age: 25,
      positionIdsDesc: 'ST,CF',
      rating: 7.72,
      transferValue: 159_349_200,
      market_value_eur: 0,
      xg: 0,
      xa: 0,
      key_passes_p90: 0,
      pass_accuracy: 0,
    },
    [],
    [],
    {
      telemetry: {
        fotmobId: '737066',
        rating: 7.72,
        minutes: 2450,
        appearances: 28,
        goals: 22,
        assists: 4,
        xG: 20.8,
        xA: 2.9,
        keyPassesPer90: 1.15,
        passAccuracy: 77.4,
      },
    }
  );

  assert.equal(player.marketValueEur, 159_349_200);
  assert.notEqual(player.marketValueEur, 15_000_000);
  assert.equal(player.primaryPosition, 'ST');
  assert.deepEqual(player.secondaryPositions, ['CF']);
  assert.equal(player.stats.xG, 20.8);
  assert.equal(player.stats.xA, 2.9);
  assert.equal(player.stats.keyPassesPer90, 1.15);
  assert.equal(player.stats.passAccuracy, 77.4);
});

test('namesRoughlyMatch detects GAS cache collisions while accepting accented variants', () => {
  assert.equal(namesRoughlyMatch('Bukayo Saka', 'Rodri'), false);
  assert.equal(namesRoughlyMatch('Martin Ødegaard', 'Martin Odegaard'), true);
  assert.equal(namesRoughlyMatch('Erling Haaland', 'Erling Braut Haaland'), true);
});
