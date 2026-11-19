import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Compass,
  GitCompare,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { getPlayer } from '../services/gasApi';
import type { Player } from '../types/footy';
import { formatMarketValue } from '../utils/analytics';
import { MarketValueChart } from './MarketValueChart';
import { MatchRatingTrendChart } from './MatchRatingTrendChart';
import { PlayerAvatar } from './PlayerAvatar';
import { RADAR_PALETTE, RadarChart } from './RadarChart';

interface PlayerProfileViewProps {
  player: Player;
  onBack: () => void;
  onAddToCompare: (fotmobId: string) => void;
  onOpenFitEngine: (fotmobId: string) => void;
  onPlayerUpdated?: (player: Player) => void;
}

export function PlayerProfileView({
  player,
  onBack,
  onAddToCompare,
  onOpenFitEngine,
  onPlayerUpdated,
}: PlayerProfileViewProps) {
  const [refreshing, setRefreshing] = useState(false);
  const isPositiveMv = player.marketValueChangePct >= 0;

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
    </div>
  );
}
