import { useMemo, useState } from 'react';
import { GitCompare, Plus, Search, Trophy, X } from 'lucide-react';
import type { Player } from '../types/footy';
import { calculateComparisonEfficiency, formatMarketValue } from '../utils/analytics';
import { PlayerAvatar } from './PlayerAvatar';
import { RADAR_PALETTE, RadarChart } from './RadarChart';

interface CompareLabViewProps {
  players: Player[];
  selectedIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
  onOpenPlayer: (player: Player) => void;
}

export function CompareLabView({
  players,
  selectedIds,
  onChangeSelectedIds,
  onOpenPlayer,
}: CompareLabViewProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const activePlayers = useMemo(
    () =>
      selectedIds
        .map((id) => players.find((p) => p.fotmobId === id))
        .filter((p): p is Player => Boolean(p))
        .slice(0, 4),
    [players, selectedIds]
  );

  const efficiency = useMemo(
    () => calculateComparisonEfficiency(activePlayers),
    [activePlayers]
  );

  const availablePool = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return players.filter(
      (p) =>
        !selectedIds.includes(p.fotmobId) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.club.toLowerCase().includes(q) ||
          p.primaryPosition.toLowerCase().includes(q))
    );
  }, [players, selectedIds, searchQuery]);

  const handleAddPlayer = (id: string) => {
    if (selectedIds.length >= 4 || selectedIds.includes(id)) return;
    onChangeSelectedIds([...selectedIds, id]);
    setPickerOpen(false);
    setSearchQuery('');
  };

  const handleRemovePlayer = (id: string) => {
    onChangeSelectedIds(selectedIds.filter((item) => item !== id));
  };

  const metricRows: Array<{
    key: string;
    label: string;
    format: (p: Player) => string;
  }> = [
    { key: 'rating', label: 'FotMob Rating', format: (p) => p.stats.rating.toFixed(2) },
    { key: 'goals', label: 'Gol Musim Ini', format: (p) => String(p.stats.goals) },
    { key: 'assists', label: 'Assist Musim Ini', format: (p) => String(p.stats.assists) },
    { key: 'xG', label: 'Expected Goals (xG)', format: (p) => p.stats.xG.toFixed(1) },
    { key: 'xA', label: 'Expected Assists (xA)', format: (p) => p.stats.xA.toFixed(1) },
    {
      key: 'keyPassesPer90',
      label: 'Key Passes / 90',
      format: (p) => p.stats.keyPassesPer90.toFixed(2),
    },
    {
      key: 'progressiveCarriesPer90',
      label: 'Progressive Carries / 90',
      format: (p) => p.stats.progressiveCarriesPer90.toFixed(2),
    },
    {
      key: 'tacklesInterceptionsPer90',
      label: 'Tackles + Interceptions / 90',
      format: (p) => p.stats.tacklesInterceptionsPer90.toFixed(2),
    },
    {
      key: 'passAccuracy',
      label: 'Pass Accuracy (%)',
      format: (p) => `${p.stats.passAccuracy.toFixed(1)}%`,
    },
    {
      key: 'mvPerGA',
      label: 'Efisiensi Harga (MV per G+A)',
      format: (p) => {
        const val = efficiency.mvPerGA[p.fotmobId];
        return val ? formatMarketValue(val) : 'N/A';
      },
    },
  ];

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#DCE8E6] dark:border-[#1B3335]">
        <div>
          <p className="text-xs font-medium text-[#136F73] dark:text-[#2DD4BF] mb-1 flex items-center gap-1.5">
            <GitCompare className="w-3.5 h-3.5" />
            Multi-Player Comparison Lab
          </p>
          <h1 className="font-display text-3xl font-semibold text-slate-900 dark:text-slate-50">
            Bandingkan 2 hingga 4 Pemain Dunia
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Radar multi-poligon, matriks statistik per-90 menit dengan sorotan pemimpin metrik, dan
            efisiensi valuasi pasar.
          </p>
        </div>

        {activePlayers.length < 4 && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#136F73] hover:bg-[#0F5D61] text-white transition-colors whitespace-nowrap shrink-0 self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            Tambah Pemain ({activePlayers.length}/4)
          </button>
        )}
      </div>

      {/* Selected Player Slots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {activePlayers.map((player, idx) => {
          const color = RADAR_PALETTE[idx % RADAR_PALETTE.length];
          return (
            <div
              key={player.fotmobId}
              className="p-4 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] flex items-start justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative">
                  <PlayerAvatar fotmobId={player.fotmobId} name={player.name} size="md" />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#121826]"
                    style={{ backgroundColor: color }}
                  />
                </div>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpenPlayer(player)}
                    className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 truncate block text-left"
                  >
                    {player.name}
                  </button>
                  <div className="text-xs text-slate-500 truncate">
                    {player.club} · {player.primaryPosition}
                  </div>
                  <div className="mt-1 text-xs font-mono-num font-semibold text-slate-700 dark:text-slate-300">
                    {formatMarketValue(player.marketValueEur)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRemovePlayer(player.fotmobId)}
                aria-label={`Hapus ${player.name} dari perbandingan`}
                className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {activePlayers.length < 4 && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center justify-center gap-2 text-sm font-medium min-h-[92px]"
          >
            <Plus className="w-4 h-4" />
            Pilih Pemain Ke-{activePlayers.length + 1}
          </button>
        )}
      </div>

      {/* Add Player Modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={() => setPickerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Pilih Pemain untuk Komparasi"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0F1E20] border border-[#DCE8E6] dark:border-[#1B3335] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#DCE8E6] dark:border-[#1B3335]">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama pemain, klub, atau posisi..."
                className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label="Tutup pilihan pemain"
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {availablePool.map((p) => (
                <button
                  key={p.fotmobId}
                  type="button"
                  onClick={() => handleAddPlayer(p.fotmobId)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <PlayerAvatar fotmobId={p.fotmobId} name={p.name} size="sm" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {p.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.club} · {p.primaryPosition} · {p.age} thn
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono-num text-xs">
                    <div className="font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                      {p.stats.rating.toFixed(2)}
                    </div>
                    <div className="text-slate-500">{formatMarketValue(p.marketValueEur)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activePlayers.length < 2 ? (
        <div className="p-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-sm text-slate-500">
          Tambahkan minimal 2 pemain untuk menampilkan Radar Multi-Poligon dan tabel perbandingan.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Overlapping Radar */}
          <section className="lg:col-span-5 p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-100 dark:border-slate-800">
              Overlapping Attribute Radar
            </h2>

            <div className="py-5 flex justify-center">
              <RadarChart
                size={330}
                series={activePlayers.map((p, idx) => ({
                  id: p.fotmobId,
                  label: p.name,
                  color: RADAR_PALETTE[idx % RADAR_PALETTE.length],
                  data: p.radar,
                }))}
              />
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 text-xs">
              {activePlayers.map((p, idx) => (
                <div key={p.fotmobId} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-xs inline-block"
                    style={{ backgroundColor: RADAR_PALETTE[idx % RADAR_PALETTE.length] }}
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {p.name}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Statistical Comparison Matrix */}
          <section className="lg:col-span-7 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Perbandingan Statistik Per-90 &amp; Efisiensi Harga
              </h2>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-emerald-500" />
                Angka terbaik disorot
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#DCE8E6] dark:border-[#1B3335] text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-6">Metrik</th>
                    {activePlayers.map((p, idx) => (
                      <th key={p.fotmobId} className="py-3 px-4 text-right">
                        <span
                          className="inline-block w-2 h-2 rounded-xs mr-1.5"
                          style={{ backgroundColor: RADAR_PALETTE[idx % RADAR_PALETTE.length] }}
                        />
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                  {metricRows.map((row) => {
                    const leaders = efficiency.bestByMetric[row.key] || [];
                    return (
                      <tr
                        key={row.key}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-6 text-xs font-medium text-slate-600 dark:text-slate-300">
                          {row.label}
                        </td>
                        {activePlayers.map((p) => {
                          const isBest = leaders.includes(p.fotmobId);
                          return (
                            <td
                              key={p.fotmobId}
                              className={`py-3 px-4 text-right font-mono-num text-sm ${
                                isBest
                                  ? 'font-bold text-[#136F73] dark:text-[#2DD4BF] bg-emerald-50/60 dark:bg-emerald-950/25'
                                  : 'text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {row.format(p)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
