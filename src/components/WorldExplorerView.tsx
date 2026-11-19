import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Database,
  GitCompare,
  Globe2,
  Loader2,
  Shield,
  TrendingUp,
  Users,
} from 'lucide-react';
import { FALLBACK_LEAGUES } from '../data/fallbackData';
import { getCachedPlayers, getLeague, getPlayer, getTeam } from '../services/gasApi';
import type { LeagueClub, LeagueInfo, Player } from '../types/footy';
import { formatMarketValue } from '../utils/analytics';
import { PlayerAvatar } from './PlayerAvatar';

interface WorldExplorerViewProps {
  initialLeagueId?: string;
  initialClubId?: string;
  onHydratePlayer: (player: Player) => void;
  onAddToCompare?: (fotmobId: string) => void;
}

type PositionFilter = 'ALL' | 'ATTACKERS' | 'MIDFIELDERS' | 'DEFENDERS' | 'GOALKEEPERS';

const POSITION_FILTERS: Array<{ id: PositionFilter; label: string }> = [
  { id: 'ALL', label: 'ALL' },
  { id: 'ATTACKERS', label: 'ATTACKERS' },
  { id: 'MIDFIELDERS', label: 'MIDFIELDERS' },
  { id: 'DEFENDERS', label: 'DEFENDERS' },
  { id: 'GOALKEEPERS', label: 'GOALKEEPERS' },
];

function matchesPositionGroup(pos: string, filter: PositionFilter): boolean {
  if (filter === 'ALL') return true;
  const p = pos.toUpperCase();
  if (filter === 'GOALKEEPERS') return p.includes('GK');
  if (filter === 'DEFENDERS') {
    return ['CB', 'LB', 'RB', 'LWB', 'RWB', 'DEF'].some((k) => p.includes(k));
  }
  if (filter === 'MIDFIELDERS') {
    return ['DM', 'CM', 'CAM', 'LM', 'RM', 'MID'].some((k) => p.includes(k));
  }
  if (filter === 'ATTACKERS') {
    return ['ST', 'CF', 'LW', 'RW', 'FW', 'ATT'].some((k) => p.includes(k));
  }
  return true;
}

const SPOTLIGHT_BAR_COLORS = [
  'bg-amber-400',
  'bg-violet-400',
  'bg-teal-500',
  'bg-rose-400',
  'bg-sky-400',
  'bg-emerald-500',
];

export function WorldExplorerView({
  initialLeagueId,
  initialClubId,
  onHydratePlayer,
  onAddToCompare,
}: WorldExplorerViewProps) {
  const initialLeague = useMemo(
    () => FALLBACK_LEAGUES.find((l) => l.id === (initialLeagueId || FALLBACK_LEAGUES[0].id)) || FALLBACK_LEAGUES[0],
    [initialLeagueId]
  );

  const initialClubObj = useMemo(() => {
    if (initialClubId) {
      const found = initialLeague.clubs.find((c) => c.id === initialClubId);
      if (found) return found;
    }
    return initialLeague.clubs[0] || null;
  }, [initialLeague, initialClubId]);

  const initialFallbackPlayers = useMemo(() => {
    if (!initialClubObj) return [];
    const pool = getCachedPlayers();
    return pool.filter(
      (p) =>
        p.clubId === initialClubObj.id ||
        initialClubObj.squadPlayerIds.includes(p.fotmobId) ||
        p.club.toLowerCase() === initialClubObj.name.toLowerCase()
    );
  }, [initialClubObj]);

  const [selectedLeagueId, setSelectedLeagueId] = useState<string>(initialLeague.id);
  const [leagueData, setLeagueData] = useState<LeagueInfo>(initialLeague);
  const [loadingLeague, setLoadingLeague] = useState(false);

  const [selectedClub, setSelectedClub] = useState<LeagueClub | null>(initialClubObj);
  const [squadPlayers, setSquadPlayers] = useState<Player[]>(initialFallbackPlayers);
  const [loadingTeam, setLoadingTeam] = useState(false);

  const [posFilter, setPosFilter] = useState<PositionFilter>('ALL');
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(
    initialFallbackPlayers[0]?.fotmobId ?? null
  );
  const [hydratingId, setHydratingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialLeagueId) setSelectedLeagueId(initialLeagueId);
  }, [initialLeagueId]);

  useEffect(() => {
    let active = true;
    const fbLeague = FALLBACK_LEAGUES.find((l) => l.id === selectedLeagueId) || FALLBACK_LEAGUES[0];
    setLeagueData(fbLeague);
    const fbTargetClub =
      (initialClubId && fbLeague.clubs.find((c) => c.id === initialClubId)) || fbLeague.clubs[0];
    if (fbTargetClub) {
      const pool = getCachedPlayers();
      const instantPlayers = pool.filter(
        (p) =>
          p.clubId === fbTargetClub.id ||
          fbTargetClub.squadPlayerIds.includes(p.fotmobId) ||
          p.club.toLowerCase() === fbTargetClub.name.toLowerCase()
      );
      if (instantPlayers.length > 0) {
        setSelectedClub(fbTargetClub);
        setSquadPlayers(instantPlayers);
        setFocusedPlayerId(instantPlayers[0].fotmobId);
      }
    }

    setLoadingLeague(true);
    getLeague(selectedLeagueId).then((data) => {
      if (!active) return;
      setLeagueData(data);
      setLoadingLeague(false);

      const targetClubId =
        initialClubId && data.clubs.some((c) => c.id === initialClubId)
          ? initialClubId
          : data.clubs[0]?.id;
      if (targetClubId) {
        loadClubSquad(targetClubId);
      }
    });
    return () => {
      active = false;
    };
  }, [selectedLeagueId, initialClubId]);

  const loadClubSquad = async (clubId: string) => {
    setLoadingTeam(true);
    const res = await getTeam(clubId);
    if (res) {
      setSelectedClub(res.club);
      setSquadPlayers(res.players);
      setFocusedPlayerId(res.players[0]?.fotmobId ?? null);
    }
    setLoadingTeam(false);
  };

  const filteredPlayers = useMemo(() => {
    const list = squadPlayers.filter((p) => matchesPositionGroup(p.primaryPosition, posFilter));
    return list.length > 0 || posFilter !== 'ALL' ? list : squadPlayers;
  }, [squadPlayers, posFilter]);

  const spotlightPlayer = useMemo(() => {
    return (
      filteredPlayers.find((p) => p.fotmobId === focusedPlayerId) ||
      filteredPlayers[0] ||
      squadPlayers[0] ||
      null
    );
  }, [filteredPlayers, focusedPlayerId, squadPlayers]);

  const handleHydrateProfile = async (player: Player) => {
    setHydratingId(player.fotmobId);
    const hydrated = await getPlayer({
      fotmobId: player.fotmobId,
      tmId: player.tmId,
      name: player.name,
      clubId: player.clubId || selectedClub?.id,
    });
    setHydratingId(null);
    onHydratePlayer(hydrated || player);
  };

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
      {/* Top Page Title & League Picker */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#DCE8E6] dark:border-[#1B3335]">
        <div>
          <p className="text-xs font-semibold text-[#136F73] dark:text-[#2DD4BF] mb-1 flex items-center gap-1.5">
            <Globe2 className="w-3.5 h-3.5" />
            World League &amp; Squad Explorer
          </p>
          <h1 className="font-display text-3xl font-semibold text-[#132928] dark:text-white">
            Players &amp; Club Intelligence
          </h1>
          <p className="text-sm text-[#53706E] dark:text-[#8FB3B0] mt-1">
            Pilih liga &amp; klub, inspeksi profil pemain pada panel interaktif, lalu tarik data
            FotMob + Transfermarkt lengkap ke Google Sheets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label
            htmlFor="league-select"
            className="text-xs font-medium text-[#53706E] dark:text-[#8FB3B0] whitespace-nowrap"
          >
            Liga Aktif:
          </label>
          <select
            id="league-select"
            value={selectedLeagueId}
            onChange={(e) => setSelectedLeagueId(e.target.value)}
            className="px-3.5 py-2 rounded-xl text-sm font-medium bg-white dark:bg-[#0F1E20] border border-[#D4E3E0] dark:border-[#1B3335] text-[#172B2A] dark:text-white focus:outline-none focus:border-[#136F73]"
          >
            {FALLBACK_LEAGUES.map((lg) => (
              <option key={lg.id} value={lg.id}>
                {lg.name} ({lg.country})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* League Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-[#E4EFED] dark:bg-[#0D1A1C] border border-[#D4E3E0] dark:border-[#1B3335] w-fit">
        {FALLBACK_LEAGUES.map((lg) => {
          const active = lg.id === selectedLeagueId;
          return (
            <button
              key={lg.id}
              type="button"
              onClick={() => setSelectedLeagueId(lg.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#136F73] text-white shadow-sm'
                  : 'text-[#486563] dark:text-[#8FB3B0] hover:text-[#132928] dark:hover:text-white'
              }`}
            >
              {lg.name}
            </button>
          );
        })}
      </div>

      {/* Club Selector Strip (Live League Standings Clubs) */}
      <section className="rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#136F73] dark:text-[#2DD4BF]" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#355352] dark:text-[#B9D4D1]">
              Klub {leagueData.name} ({leagueData.clubs.length})
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#53706E] dark:text-[#8FB3B0]">
            {loadingLeague && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#136F73]" />}
            <span>{leagueData.country}</span>
          </div>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1.5">
          {leagueData.clubs.map((club) => {
            const isSelected = selectedClub?.id === club.id;
            return (
              <button
                key={club.id}
                type="button"
                onClick={() => loadClubSquad(club.id)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-all shrink-0 ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#136F73] to-[#1A8D91] border-transparent text-white shadow-md'
                    : 'bg-[#F6FAF9] dark:bg-[#132628] border-[#DCE8E6] dark:border-[#1D393B] text-[#172B2A] dark:text-white hover:border-[#136F73]/60'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-mono-num font-bold shrink-0 ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-[#E1ECEA] dark:bg-[#1A3335] text-[#136F73] dark:text-[#2DD4BF]'
                  }`}
                >
                  {club.shortName}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold whitespace-nowrap">{club.name}</div>
                  <div
                    className={`text-[10px] font-mono-num whitespace-nowrap ${
                      isSelected ? 'text-teal-100' : 'text-[#5E7C7A] dark:text-[#7EA7A4]'
                    }`}
                  >
                    #{club.position} · {club.points} pts
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* CoachPro-Inspired Squad Split View */}
      <div className="space-y-4">
        {/* Squad Header & Position Filter Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {POSITION_FILTERS.map((f) => {
              const active = posFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPosFilter(f.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wide transition-all whitespace-nowrap ${
                    active
                      ? 'bg-[#136F73] text-white shadow-sm'
                      : 'bg-[#DCEAE7] dark:bg-[#12282A] text-[#355352] dark:text-[#8FB3B0] hover:bg-[#CEE0DD] dark:hover:bg-[#183436]'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-[#53706E] dark:text-[#8FB3B0] font-mono-num">
            {loadingTeam ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#136F73]" />
                Memuat skuad...
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#136F73] dark:text-[#2DD4BF]" />
                {selectedClub?.name || 'Klub'} · {filteredPlayers.length} Pemain
              </span>
            )}
          </div>
        </div>

        {/* Two-Column CoachPro Cards + Sticky Spotlight */}
        {squadPlayers.length === 0 ? (
          <div className="p-12 rounded-2xl border border-dashed border-[#C7DBD8] dark:border-[#1D393B] bg-white dark:bg-[#0F1E20] text-center text-sm text-[#5E7C7A] dark:text-[#7EA7A4]">
            Pilih klub di atas untuk memuat daftar skuad pemain lengkap.
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="p-10 rounded-2xl border border-dashed border-[#C7DBD8] dark:border-[#1D393B] bg-white dark:bg-[#0F1E20] text-center text-sm text-[#5E7C7A] dark:text-[#7EA7A4]">
            Tidak ada pemain di kategori posisi ini. Pilih filter <strong>ALL</strong> untuk
            melihat seluruh skuad.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Selectable Player Cards (CoachPro Style) */}
            <div className="lg:col-span-6 space-y-3">
              {filteredPlayers.map((player) => {
                const isActive = spotlightPlayer?.fotmobId === player.fotmobId;
                return (
                  <button
                    key={player.fotmobId}
                    type="button"
                    onClick={() => setFocusedPlayerId(player.fotmobId)}
                    className={`w-full relative overflow-hidden rounded-2xl p-4 flex items-center justify-between gap-4 text-left transition-all border ${
                      isActive
                        ? 'bg-gradient-to-br from-[#0F5D61] via-[#137478] to-[#1C8F94] border-transparent text-white shadow-lg shadow-[#136F73]/25'
                        : 'bg-white dark:bg-[#0F1E20] border-[#DCE8E6] dark:border-[#1B3335] text-[#172B2A] dark:text-white hover:border-[#136F73]/60 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0 z-10">
                      <div
                        className={`rounded-2xl p-0.5 shrink-0 ${
                          isActive
                            ? 'bg-white/20'
                            : 'bg-[#E9F2F0] dark:bg-[#142A2C]'
                        }`}
                      >
                        <PlayerAvatar
                          fotmobId={player.fotmobId}
                          name={player.name}
                          size="lg"
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="text-base font-bold leading-snug truncate">
                          {player.name}
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-4 sm:gap-6">
                          <div>
                            <div
                              className={`text-[9px] font-semibold uppercase tracking-wider ${
                                isActive ? 'text-teal-100/80' : 'text-[#738F8D] dark:text-[#6E9390]'
                              }`}
                            >
                              AGE
                            </div>
                            <div className="text-xs font-semibold font-mono-num mt-0.5">
                              {player.age}
                            </div>
                          </div>
                          <div>
                            <div
                              className={`text-[9px] font-semibold uppercase tracking-wider ${
                                isActive ? 'text-teal-100/80' : 'text-[#738F8D] dark:text-[#6E9390]'
                              }`}
                            >
                              NATIONALITY
                            </div>
                            <div className="text-xs font-semibold mt-0.5 truncate max-w-[92px]">
                              {player.nationality}
                            </div>
                          </div>
                          <div>
                            <div
                              className={`text-[9px] font-semibold uppercase tracking-wider ${
                                isActive ? 'text-teal-100/80' : 'text-[#738F8D] dark:text-[#6E9390]'
                              }`}
                            >
                              POSITION
                            </div>
                            <div className="text-xs font-semibold mt-0.5">
                              {player.primaryPosition}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Watermark Rating & Market Value */}
                    <div className="text-right shrink-0 z-10">
                      <div
                        className={`font-mono-num text-2xl sm:text-3xl font-extrabold leading-none tracking-tight ${
                          isActive
                            ? 'text-white/35'
                            : 'text-[#C6D9D7] dark:text-[#1D3B3D]'
                        }`}
                      >
                        {player.stats.rating.toFixed(1)}
                      </div>
                      <div
                        className={`mt-1.5 text-[11px] font-mono-num font-semibold ${
                          isActive ? 'text-teal-100' : 'text-[#136F73] dark:text-[#2DD4BF]'
                        }`}
                      >
                        {formatMarketValue(player.marketValueEur)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Column: Sticky CoachPro Player Spotlight Card */}
            {spotlightPlayer && (
              <div className="lg:col-span-6 lg:sticky lg:top-24">
                <div className="rounded-3xl overflow-hidden border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] shadow-xl">
                  {/* Top Teal Gradient Hero */}
                  <div className="bg-gradient-to-br from-[#0D5458] via-[#136F73] to-[#1E9296] text-white p-6 sm:p-7">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                      <div className="shrink-0">
                        <div className="p-1 rounded-2xl bg-white/15 backdrop-blur-xs inline-block">
                          <PlayerAvatar
                            fotmobId={spotlightPlayer.fotmobId}
                            name={spotlightPlayer.name}
                            size="xl"
                          />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-100/85">
                          {spotlightPlayer.roleTag}
                        </div>
                        <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1 leading-tight">
                          {spotlightPlayer.name}
                        </h2>

                        <div className="mt-5 grid grid-cols-3 gap-4 pt-4 border-t border-white/15">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-100/75">
                              AGE
                            </div>
                            <div className="text-base font-bold font-mono-num mt-0.5">
                              {spotlightPlayer.age}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-100/75">
                              NATIONALITY
                            </div>
                            <div className="text-base font-bold mt-0.5 truncate">
                              {spotlightPlayer.nationality}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-100/75">
                              POSITION
                            </div>
                            <div className="text-base font-bold mt-0.5">
                              {spotlightPlayer.primaryPosition}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Rating + MV Strip */}
                    <div className="mt-5 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-teal-100/75">Klub: </span>
                          <span className="font-semibold">{spotlightPlayer.club}</span>
                        </div>
                        <div>
                          <span className="text-teal-100/75">FotMob: </span>
                          <span className="font-mono-num font-bold">
                            {spotlightPlayer.stats.rating.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono-num font-bold text-sm">
                        <TrendingUp className="w-3.5 h-3.5 text-teal-200" />
                        {formatMarketValue(spotlightPlayer.marketValueEur)}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Attribute Progress Bars */}
                  <div className="p-6 sm:p-7 space-y-4">
                    {(
                      [
                        ['Attacking', spotlightPlayer.radar.attacking],
                        ['Creativity', spotlightPlayer.radar.creativity],
                        ['Progression', spotlightPlayer.radar.progression],
                        ['Defending', spotlightPlayer.radar.defending],
                        ['Workrate & Pressing', spotlightPlayer.radar.workrate],
                        ['Efficiency', spotlightPlayer.radar.efficiency],
                      ] as Array<[string, number]>
                    ).map(([label, val], idx) => (
                      <div key={label}>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold text-[#2E4847] dark:text-[#CFE3E0]">
                            {label}
                          </span>
                          <span className="font-mono-num text-sm font-bold text-[#132928] dark:text-white">
                            {val}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[#E6EFED] dark:bg-[#172C2E] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              SPOTLIGHT_BAR_COLORS[idx % SPOTLIGHT_BAR_COLORS.length]
                            }`}
                            style={{ width: `${val}%` }}
                          />
                        </div>
                      </div>
                    ))}

                    {/* Action Buttons */}
                    <div className="pt-4 border-t border-[#E6EFED] dark:border-[#1B3335] flex flex-wrap items-center justify-between gap-3">
                      {onAddToCompare && (
                        <button
                          type="button"
                          onClick={() => onAddToCompare(spotlightPlayer.fotmobId)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border border-[#D4E3E0] dark:border-[#1D393B] text-[#2E4847] dark:text-[#CFE3E0] hover:border-[#136F73] dark:hover:border-[#2DD4BF] transition-colors"
                        >
                          <GitCompare className="w-3.5 h-3.5 text-[#136F73] dark:text-[#2DD4BF]" />
                          Bandingkan
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleHydrateProfile(spotlightPlayer)}
                        disabled={hydratingId === spotlightPlayer.fotmobId}
                        className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#136F73] hover:bg-[#0F5D61] text-white transition-colors shadow-sm"
                      >
                        {hydratingId === spotlightPlayer.fotmobId ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Auto-Hydrating Sheets...
                          </>
                        ) : (
                          <>
                            <Database className="w-3.5 h-3.5" />
                            Buka Deep Profile (Auto-Hydrate)
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
