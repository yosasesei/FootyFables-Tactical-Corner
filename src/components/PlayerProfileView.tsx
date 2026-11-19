import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRightLeft,
  Award,
  CheckCircle2,
  Compass,
  GitCompare,
  HeartPulse,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { WORLD_MANAGERS } from '../data/worldManagers';
import { getPlayer } from '../services/gasApi';
import type { Player, TeamManagerProfile } from '../types/footy';
import {
  calculateTacticalFit,
  findClubManager,
  formatMarketValue,
  rankManagersForPlayer,
} from '../utils/analytics';
import { MarketValueChart } from './MarketValueChart';
import { MatchRatingTrendChart } from './MatchRatingTrendChart';
import { PlayerAvatar } from './PlayerAvatar';
import { RADAR_PALETTE, RadarChart } from './RadarChart';

interface PlayerProfileViewProps {
  player: Player;
  managers?: TeamManagerProfile[];
  onBack: () => void;
  onAddToCompare: (fotmobId: string) => void;
  onOpenFitEngine: (fotmobId: string, managerId?: string) => void;
  onPlayerUpdated?: (player: Player) => void;
}

export function PlayerProfileView({
  player,
  managers = WORLD_MANAGERS,
  onBack,
  onAddToCompare,
  onOpenFitEngine,
  onPlayerUpdated,
}: PlayerProfileViewProps) {
  const [refreshing, setRefreshing] = useState(false);
  const autoHydratedIdsRef = useRef<Set<string>>(new Set());
  const isPositiveMv = player.marketValueChangePct >= 0;

  // Automatically hydrate live Opta telemetry, real club fixtures, and salimt datalake if player record is still sparse
  useEffect(() => {
    const hasLiveFixtures = Boolean(player.recentMatches?.some((m) => m.isLiveFixture));
    const hasOpta = Boolean(player.dataSources?.includes('Opta/FotMob Live'));
    if (hasLiveFixtures && hasOpta) return;
    if (autoHydratedIdsRef.current.has(player.fotmobId)) return;

    autoHydratedIdsRef.current.add(player.fotmobId);
    let active = true;
    setRefreshing(true);
    getPlayer({
      fotmobId: player.fotmobId,
      tmId: player.tmId,
      name: player.name,
      clubId: player.clubId,
    })
      .then((hydrated) => {
        if (!active) return;
        setRefreshing(false);
        if (hydrated && onPlayerUpdated) {
          onPlayerUpdated(hydrated);
        }
      })
      .catch(() => {
        if (active) setRefreshing(false);
      });

    return () => {
      active = false;
    };
  }, [player.fotmobId]);

  const clubManager = useMemo(
    () => findClubManager(player.club, managers),
    [player.club, managers]
  );

  const clubManagerFit = useMemo(() => {
    if (!clubManager) return null;
    return calculateTacticalFit(
      player,
      {
        pressingIntensity: clubManager.pressingIntensity,
        possessionFocus: clubManager.possessionFocus,
        transitionSpeed: clubManager.transitionSpeed,
        buildUpStyle: clubManager.buildUpStyle,
        defensiveLine: clubManager.defensiveLine,
        aerialPhysicality: clubManager.aerialPhysicality,
      },
      [player]
    );
  }, [player, clubManager]);

  const topWorldManagers = useMemo(
    () => rankManagersForPlayer(player, managers, 3),
    [player, managers]
  );

  const handleLiveRefresh = async () => {
    setRefreshing(true);
    const refreshed = await getPlayer({
      fotmobId: player.fotmobId,
      tmId: player.tmId,
      name: player.name,
      clubId: player.clubId,
      forceRefresh: true,
    });
    setRefreshing(false);
    if (refreshed && onPlayerUpdated) {
      onPlayerUpdated(refreshed);
    }
  };

  const statItems = [
    { label: 'Rating FotMob', value: player.stats.rating.toFixed(2), highlight: true },
    { label: 'Menit Bermain', value: player.stats.minutes.toLocaleString('id-ID') },
    { label: 'Gol', value: String(player.stats.goals) },
    { label: 'Assist', value: String(player.stats.assists) },
    { label: 'xG', value: player.stats.xG.toFixed(1) },
    { label: 'xA', value: player.stats.xA.toFixed(1) },
    { label: 'Key Passes / 90', value: player.stats.keyPassesPer90.toFixed(2) },
    { label: 'Prog. Carries / 90', value: player.stats.progressiveCarriesPer90.toFixed(2) },
    { label: 'Tackles+Int / 90', value: player.stats.tacklesInterceptionsPer90.toFixed(2) },
    { label: 'Pass Accuracy', value: `${player.stats.passAccuracy.toFixed(1)}%` },
  ];

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleLiveRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F1E20] text-slate-800 dark:text-slate-200 hover:border-[#136F73] dark:hover:border-[#2DD4BF] transition-colors whitespace-nowrap disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#136F73] dark:text-[#2DD4BF] ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Menyinkronkan...' : 'Refresh Data Live'}
          </button>
          <button
            type="button"
            onClick={() => onAddToCompare(player.fotmobId)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F1E20] text-slate-800 dark:text-slate-200 hover:border-emerald-500 transition-colors whitespace-nowrap"
          >
            <GitCompare className="w-3.5 h-3.5 text-emerald-500" />
            Bandingkan Pemain
          </button>
          <button
            type="button"
            onClick={() => onOpenFitEngine(player.fotmobId)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#136F73] hover:bg-[#0F5D61] text-white transition-colors whitespace-nowrap"
          >
            <Compass className="w-3.5 h-3.5" />
            Uji Tactical Fit
          </button>
        </div>
      </div>

      {/* 1. Identity Header */}
      <section className="p-6 sm:p-8 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <PlayerAvatar fotmobId={player.fotmobId} name={player.name} size="xl" />
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {player.club}
                </span>
                <span aria-hidden="true">·</span>
                <span>{player.league}</span>
                <span aria-hidden="true">·</span>
                <span>{player.nationality}</span>
                {player.syncedToSheets && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-[#136F73] dark:text-[#2DD4BF] font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Synced to Sheets
                    </span>
                  </>
                )}
              </div>

              <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-slate-50 mt-1">
                {player.name}
              </h1>

              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {player.roleTag}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
                <div>
                  <span className="text-slate-400">Posisi Utama: </span>
                  <span className="font-semibold">{player.primaryPosition}</span>
                </div>
                {player.secondaryPositions.length > 0 && (
                  <div>
                    <span className="text-slate-400">Sekunder: </span>
                    <span className="font-medium">{player.secondaryPositions.join(', ')}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-400">Usia: </span>
                  <span className="font-mono-num font-semibold">{player.age} thn</span>
                </div>
                <div>
                  <span className="text-slate-400">Tinggi: </span>
                  <span className="font-mono-num font-semibold">{player.heightCm} cm</span>
                </div>
                <div>
                  <span className="text-slate-400">Kaki: </span>
                  <span className="font-semibold">{player.preferredFoot}</span>
                </div>
                <div>
                  <span className="text-slate-400">Kontrak: </span>
                  <span className="font-mono-num font-semibold">{player.contractUntil}</span>
                </div>
              </div>

              {(player.dataSources?.length || player.injuryStatus) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  {(player.dataSources || []).map((src) => (
                    <span
                      key={src}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EBF5F4] dark:bg-[#112A2C] text-[#136F73] dark:text-[#2DD4BF] font-medium"
                    >
                      {src}
                    </span>
                  ))}
                  {player.injuryStatus && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium">
                      <HeartPulse className="w-3 h-3" />
                      Riwayat Cedera: {player.injuryStatus.reason} ({player.injuryStatus.season || '2026'})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Transfermarkt Hero Block */}
          <div className="lg:text-right border-t lg:border-t-0 lg:border-l border-[#DCE8E6] dark:border-[#1B3335] pt-4 lg:pt-0 lg:pl-8 shrink-0">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Market Value Terkini
            </div>
            <div className="font-mono-num text-3xl font-semibold text-slate-900 dark:text-slate-50 mt-1">
              {formatMarketValue(player.marketValueEur)}
            </div>
            <div
              className={`mt-1 inline-flex items-center gap-1 font-mono-num text-xs font-semibold ${
                isPositiveMv
                  ? 'text-[#136F73] dark:text-[#2DD4BF]'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {isPositiveMv ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {isPositiveMv ? '+' : ''}
              {player.marketValueChangePct.toFixed(1)}% vs periode sebelumnya
            </div>
            <div className="mt-2 text-xs text-slate-500 font-mono-num">
              Highest MV: {formatMarketValue(player.highestMarketValueEur)} (
              {player.highestMarketValueDate})
            </div>
          </div>
        </div>
      </section>

      {/* 2. Season Stats (FotMob) + 3. Radar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Statistik Performa Musim Ini (FotMob)
            </h2>
            <span className="text-xs font-mono-num text-slate-500">
              {player.stats.appearances} Penampilan
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-4">
            {statItems.map((item) => (
              <div
                key={item.label}
                className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80"
              >
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {item.label}
                </div>
                <div
                  className={`mt-1 font-mono-num text-xl font-semibold ${
                    item.highlight
                      ? 'text-[#136F73] dark:text-[#2DD4BF]'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 sm:grid-cols-6 gap-3">
            {Object.entries(player.radar).map(([axis, val]) => (
              <div key={axis}>
                <div className="text-[11px] capitalize text-slate-500">{axis}</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${val}%` }}
                    />
                  </div>
                  <span className="font-mono-num text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {val}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {player.optaExtras && Object.keys(player.optaExtras).length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1 font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                <Activity className="w-3.5 h-3.5" />
                Metrik Opta Lanjutan:
              </span>
              {player.optaExtras.topSpeedKmh !== undefined && (
                <span className="font-mono-num">
                  Top Speed: <strong>{player.optaExtras.topSpeedKmh.toFixed(1)} km/h</strong>
                </span>
              )}
              {player.optaExtras.lineBreakingPassesPer90 !== undefined && (
                <span className="font-mono-num">
                  Line-Breaking Pass/90: <strong>{player.optaExtras.lineBreakingPassesPer90.toFixed(2)}</strong>
                </span>
              )}
              {player.optaExtras.bigChancesCreated !== undefined && (
                <span className="font-mono-num">
                  Big Chances Created: <strong>{player.optaExtras.bigChancesCreated}</strong>
                </span>
              )}
              {player.optaExtras.ballRecoveriesPer90 !== undefined && (
                <span className="font-mono-num">
                  Ball Recoveries/90: <strong>{player.optaExtras.ballRecoveriesPer90.toFixed(2)}</strong>
                </span>
              )}
              {player.optaExtras.defensiveActionsPer90 !== undefined && (
                <span className="font-mono-num">
                  Def. Actions/90: <strong>{player.optaExtras.defensiveActionsPer90.toFixed(2)}</strong>
                </span>
              )}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Attribute Radar (0–99 Percentiles)
            </h2>
            <span className="text-xs text-slate-500">Peer Position</span>
          </div>

          <div className="py-4 flex items-center justify-center">
            <RadarChart
              size={300}
              series={[
                {
                  id: player.fotmobId,
                  label: player.name,
                  color: RADAR_PALETTE[0],
                  data: player.radar,
                },
              ]}
            />
          </div>
        </section>
      </div>

      {/* 3.5 Last 10 Matches FotMob Rating Trend */}
      <section className="p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]">
        <MatchRatingTrendChart player={player} />
      </section>

      {/* 4. Valuation Trend & Transfer History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Grafik Tren Market Value (Transfermarkt)
            </h2>
            <span className="text-xs text-slate-500">Arahkan kursor pada titik</span>
          </div>
          <MarketValueChart history={player.marketValueHistory} />
        </section>

        <section className="lg:col-span-5 p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-emerald-500" />
              Timeline Riwayat Transfer
            </h2>
            <span className="text-xs font-mono-num text-slate-500">
              {player.transferHistory.length} Catatan
            </span>
          </div>

          {player.transferHistory.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Belum ada catatan perpindahan klub.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {player.transferHistory.map((tr, idx) => (
                <div key={idx} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-mono-num text-slate-500">
                      {tr.date} · Musim {tr.season}
                    </div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                      {tr.fromClub} → {tr.toClub}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono-num text-sm font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                      {tr.feeLabel}
                    </div>
                    <div className="text-[11px] text-slate-500">{tr.type}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {/* 5. Sinergi Pelatih Klub & Top 3 Pelatih Dunia */}
      <section
        data-testid="player-manager-synergy"
        className="p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#136F73] dark:text-[#2DD4BF]" />
              Sinergi Pelatih Klub &amp; Top 3 Pelatih Dunia ({managers.length} Profil)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Evaluasi kecocokan profil pemain terhadap pelatih klub saat ini serta manajer dunia paling selaras.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenFitEngine(player.fotmobId, clubManager?.id)}
            className="text-xs font-semibold text-[#136F73] dark:text-[#2DD4BF] hover:underline shrink-0"
          >
            Buka Fit Engine Lengkap →
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {clubManager && clubManagerFit ? (
            <div className="lg:col-span-5 p-4 rounded-xl bg-[#EBF5F4] dark:bg-[#112A2C] border border-[#CFE4E2] dark:border-[#1D4446] flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#136F73] dark:text-[#2DD4BF]">
                    Pelatih Klub Saat Ini
                  </span>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mt-0.5">
                    {clubManager.managerName}
                  </h3>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    {clubManager.clubName} · {clubManager.primaryFormation}
                    {clubManager.tacticalArchetype ? ` · ${clubManager.tacticalArchetype}` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono-num text-2xl font-bold text-[#136F73] dark:text-[#2DD4BF]">
                    {clubManagerFit.overallScore}%
                  </div>
                  <div className="text-[10px] text-slate-500">System Fit</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#CFE4E2] dark:border-[#1D4446] text-xs font-mono-num">
                <div>
                  <span className="text-[10px] text-slate-500 block">PPG</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {(clubManager.pointsPerGame ?? 1.85).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Win Rate</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {(clubManager.winRatePct ?? 56).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Trofi</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {clubManager.trophiesCount ?? 0}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {clubManager.tacticalSummary}
              </p>
            </div>
          ) : (
            <div className="lg:col-span-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs text-slate-500 text-center">
              Pelatih klub belum terpetakan langsung — bandingkan kecocokan dengan Top 3 Pelatih Dunia di samping.
            </div>
          )}

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topWorldManagers.map(({ manager, fit }, idx) => (
              <button
                key={manager.id}
                type="button"
                onClick={() => onOpenFitEngine(player.fotmobId, manager.id)}
                className="p-4 rounded-xl border border-[#DCE8E6] dark:border-[#1B3335] bg-slate-50/70 dark:bg-slate-900/50 hover:border-[#136F73] dark:hover:border-[#2DD4BF] text-left transition-colors flex flex-col justify-between gap-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono-num font-semibold text-[#136F73] dark:text-[#2DD4BF] flex items-center gap-1">
                      <Award className="w-3 h-3" />#{idx + 1} Match Dunia
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                      {manager.managerName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {manager.clubName} · {manager.primaryFormation}
                    </div>
                  </div>
                  <div className="font-mono-num text-lg font-bold text-[#136F73] dark:text-[#2DD4BF] shrink-0">
                    {fit.overallScore}%
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                  <span>PPG {(manager.pointsPerGame ?? 1.8).toFixed(2)}</span>
                  <span>Win {(manager.winRatePct ?? 54).toFixed(0)}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
