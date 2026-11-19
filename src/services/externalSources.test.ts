import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTeamRecentMatches,
  normalizeLeagueTransfersToTicker,
  normalizeTmScraperMarketHistory,
  normalizeTmScraperProfile,
  normalizeTmScraperTransfers,
  parseCsvLine,
  parseLatestMarketValuesCsv,
  parsePlayerInjuriesCsv,
  parsePlayerProfilesCsv,
  parseTmMoneyToEur,
  parseTransferHistoryCsv,
  selectCurrentMatchWindow,
} from './externalSources';
import {
  applyTelemetryToPlayer,
  extractOptaSeasonFromUrls,
  mergeTelemetryMaps,
  parseFotmobStatJson,
} from './fotmobStats';
import { FALLBACK_PLAYERS } from '../data/fallbackData';

test('parseCsvLine parses quoted fields and escaped quotes cleanly', () => {
  const row = parseCsvLine('418560,"Haaland, ""Erling""",Manchester City,2034-06-30');
  assert.deepEqual(row, ['418560', 'Haaland, "Erling"', 'Manchester City', '2034-06-30']);
});

test('parseLatestMarketValuesCsv maps Transfermarkt player_id -> EUR values and ignores noise', () => {
  const csv = [
    'player_id,date_unix,value',
    '1,2009-04-22,0.0',
    '418560,2025-05-29,180000000.0',
    '418560,2026-06-01,185000000.0',
    '937958,2026-06-08,200000000.0',
  ].join('\n');

  const map = parseLatestMarketValuesCsv(csv);
  assert.equal(map.get('1'), undefined);
  assert.equal(map.get('418560')?.valueEur, 185_000_000);
  assert.equal(map.get('418560')?.date, '2026-06-01');
  assert.equal(map.get('937958')?.valueEur, 200_000_000);
});

test('parsePlayerInjuriesCsv picks most recent injury entry from salimt injuries CSV', () => {
  const csv = [
    'player_id,season_name,injury_reason,from_date,end_date,days_missed,games_missed',
    '418560,23/24,Foot injury,2023-12-06,2024-01-31,56.0,10',
    '418560,25/26,Knee bruise,2026-03-10,2026-03-22,12.0,2',
  ].join('\n');

  const map = parsePlayerInjuriesCsv(csv);
  assert.equal(map.get('418560')?.reason, 'Knee bruise');
  assert.equal(map.get('418560')?.season, '25/26');
  assert.equal(map.get('418560')?.gamesMissed, 2);
});

test('parsePlayerProfilesCsv extracts contract expiry, height, and foot from salimt schema', () => {
  const csv = [
    'player_id,player_slug,player_name,player_image_url,name_in_home_country,date_of_birth,place_of_birth,country_of_birth,height,citizenship,is_eu,position,main_position,foot,current_club_id,current_club_name,joined,contract_expires',
    '418560,erling-haaland,Erling Haaland (418560),https://img,Erling Braut Haaland,2000-07-21,Leeds,England,195.0,Norway,True,Attack - Centre-Forward,Attack,left,281,Manchester City,2022-07-01,2034-06-30',
  ].join('\n');

  const { byId, byName } = parsePlayerProfilesCsv(csv);
  const haaland = byId.get('418560');
  assert.ok(haaland);
  assert.equal(haaland.contractExpires, '2034-06-30');
  assert.equal(haaland.heightCm, 195);
  assert.equal(haaland.foot, 'Left');
  assert.equal(byName.get('erling haaland')?.tmId, '418560');
});

test('parseTransferHistoryCsv parses LFS transfer history CSV sorted newest first', () => {
  const csv = [
    'player_id,season_name,transfer_date,from_team_id,from_team_name,to_team_id,to_team_name,transfer_type,value_at_transfer,transfer_fee',
    '418560,19/20,2020-01-01,409,RB Salzburg,16,Borussia Dortmund,Transfer,45000000,20000000',
    '418560,22/23,2022-07-01,16,Borussia Dortmund,281,Manchester City,Transfer,150000000,60000000',
  ].join('\n');

  const map = parseTransferHistoryCsv(csv, '418560');
  const records = map.get('418560') || [];
  assert.equal(records.length, 2);
  assert.equal(records[0].toClub, 'Manchester City');
  assert.equal(records[0].feeLabel, '€60.0M');
  assert.equal(records[1].fromClub, 'RB Salzburg');
});

test('Transfermarkt Scraper API normalizers parse money, profile, MV history, and transfers', () => {
  assert.equal(parseTmMoneyToEur('€180.00m'), 180_000_000);
  assert.equal(parseTmMoneyToEur('€500k'), 500_000);
  assert.equal(parseTmMoneyToEur('free transfer'), 0);

  const profile = normalizeTmScraperProfile({
    id: '418560',
    name: 'Erling Haaland',
    age: 26,
    height: '1,95m',
    foot: 'left',
    marketValue: '€180.00m',
    club: { name: 'Manchester City', contractExpires: 'Jun 30, 2034' },
    citizenship: ['Norway'],
  });
  assert.equal(profile?.tmId, '418560');
  assert.equal(profile?.heightCm, 195);
  assert.equal(profile?.foot, 'Left');
  assert.equal(profile?.marketValueEur, 180_000_000);
  assert.equal(profile?.contractUntil, '2034-06-30');

  const mvHist = normalizeTmScraperMarketHistory({
    marketValueHistory: [
      { date: '2025-10-01', clubName: 'Manchester City', value: '€180.00m' },
      { date: '2026-06-15', clubName: 'Manchester City', value: '€185.00m' },
    ],
  });
  assert.equal(mvHist.length, 2);
  assert.equal(mvHist[1].date, '2026-06');
  assert.equal(mvHist[1].valueEur, 185_000_000);

  const transfers = normalizeTmScraperTransfers({
    transfers: [
      {
        dateUnformatted: '2022-07-01',
        season: '22/23',
        clubFrom: { name: 'Borussia Dortmund' },
        clubTo: { name: 'Manchester City' },
        fee: '€60.00m',
      },
    ],
  });
  assert.equal(transfers[0].feeEur, 60_000_000);
  assert.equal(transfers[0].fromClub, 'Borussia Dortmund');
});

test('Opta CDN dynamic season extractor and physical/defensive telemetry merger', () => {
  const extracted = extractOptaSeasonFromUrls([
    'https://data.fotmob.com/stats/54/season/1000001451/goals.json',
    'https://data.fotmob.com/stats/54/season/1000001451/phys_ts.json',
  ]);
  assert.equal(extracted?.seasonId, '1000001451');

  const physJson = {
    TopLists: [
      {
        StatList: [
          { ParticiantId: 737066, ParticipantName: 'Erling Haaland', StatValue: 35.8 },
        ],
      },
    ],
  };
  const lbpJson = {
    TopLists: [
      {
        StatList: [
          { ParticiantId: 737066, ParticipantName: 'Erling Haaland', StatValue: 1.4 },
        ],
      },
    ],
  };

  const merged = mergeTelemetryMaps({
    phys_ts: parseFotmobStatJson(physJson),
    lbp_total: parseFotmobStatJson(lbpJson),
  });
  const base = FALLBACK_PLAYERS[0];
  const enriched = applyTelemetryToPlayer(base, merged.get('737066'));
  assert.equal(enriched.optaExtras?.topSpeedKmh, 35.8);
  assert.equal(enriched.optaExtras?.lineBreakingPassesPer90, 1.4);
  assert.ok(enriched.dataSources?.includes('Opta/FotMob Live'));
});

test('selectCurrentMatchWindow prioritizes live + upcoming + most recent finished matches instead of Round 1', () => {
  const nowMs = Date.parse('2026-11-19T12:00:00Z');
  const fixtures = [
    { id: 'aug1', status: { utcTime: '2026-08-15T15:00:00Z', finished: true, started: true } },
    { id: 'nov1', status: { utcTime: '2026-11-08T15:00:00Z', finished: true, started: true } },
    { id: 'live1', status: { utcTime: '2026-11-19T11:30:00Z', finished: false, started: true } },
    { id: 'next1', status: { utcTime: '2026-11-22T16:30:00Z', finished: false, started: false } },
    { id: 'next2', status: { utcTime: '2026-11-29T16:30:00Z', finished: false, started: false } },
  ];

  const picked = selectCurrentMatchWindow(fixtures, 4, nowMs);
  assert.equal(picked[0].id, 'live1');
  assert.equal(picked[1].id, 'next1');
  assert.ok(!picked.some((m) => m.id === 'aug1'));
});

test('extractTeamRecentMatches builds real club match log from getTeam fixtures', () => {
  const teamData = {
    details: { id: 8456, name: 'Manchester City' },
    fixtures: {
      allFixtures: {
        fixtures: [
          {
            id: 5795502,
            home: { id: 8456, name: 'Man City', score: 2 },
            away: { id: 10204, name: 'Brighton', score: 0 },
            opponent: { id: 10204, name: 'Brighton', score: 0 },
            tournament: { name: 'Premier League', leagueId: 47 },
            status: { utcTime: '2026-10-31T15:00:00Z', finished: true, scoreStr: '2 - 0' },
          },
          {
            id: 5795513,
            home: { id: 10203, name: 'Nottm Forest', score: 3 },
            away: { id: 8456, name: 'Man City', score: 1 },
            opponent: { id: 10203, name: 'Nottm Forest', score: 3 },
            tournament: { name: 'Premier League', leagueId: 47 },
            status: { utcTime: '2026-11-08T14:00:00Z', finished: true, scoreStr: '3 - 1' },
          },
        ],
      },
    },
  };

  const haaland = FALLBACK_PLAYERS[0];
  const recent = extractTeamRecentMatches(teamData, haaland, 10);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].opponent, 'Brighton');
  assert.equal(recent[0].homeAway, 'H');
  assert.equal(recent[0].score, '2 - 0');
  assert.equal(recent[0].isLiveFixture, true);
  assert.equal(recent[1].opponent, 'Nottm Forest');
  assert.equal(recent[1].homeAway, 'A');
});

test('normalizeLeagueTransfersToTicker formats major league official transfers cleanly', () => {
  const items = normalizeLeagueTransfersToTicker(
    [
      {
        playerId: 282674,
        name: 'Daniel Carvajal',
        position: { label: 'RB' },
        age: 34,
        transferDate: '2026-10-13T10:26:40Z',
        fromClub: 'Real Madrid',
        toClub: 'Al Sadd',
        fee: { value: 5_000_000 },
      },
    ],
    'LaLiga'
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].feeLabel, '€5.0M');
  assert.equal(items[0].updatedAt, '2026-10-13');
  assert.equal(items[0].source, 'Major Leagues');
});
