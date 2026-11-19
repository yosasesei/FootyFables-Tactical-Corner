import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, RefreshCw, TrendingUp } from 'lucide-react';
import { getTransfers } from '../services/gasApi';
import type { Player, TransferTickerItem } from '../types/footy';
import { PlayerAvatar } from './PlayerAvatar';

interface TransferTickerViewProps {
  players: Player[];
  onOpenPlayer: (player: Player) => void;
}

export function TransferTickerView({ players, onOpenPlayer }: TransferTickerViewProps) {
  const [items, setItems] = useState<TransferTickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'Semua' | TransferTickerItem['status']>('Semua');

  const loadData = async () => {
    setLoading(true);
    const res = await getTransfers();
    setItems(res);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    if (filterStatus === 'Semua') return items;
    return items.filter((item) => item.status === filterStatus);
  }, [items, filterStatus]);

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#DCE8E6] dark:border-[#1B3335]">
        <div>
          <p className="text-xs font-medium text-[#136F73] dark:text-[#2DD4BF] mb-1 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Live Transfer Market Ticker
          </p>
          <h1 className="font-display text-3xl font-semibold text-slate-900 dark:text-slate-50">
            Pergerakan Bursa Transfer &amp; Rumor Terkini
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Pemantauan kesepakatan resmi, negosiasi aktif, dan valuasi klausul rilis lintas liga.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F1E20] text-slate-800 dark:text-slate-200 hover:border-emerald-500 transition-colors whitespace-nowrap self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Segarkan Bursa
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-[#E4EFED] dark:bg-[#0D1A1C] border border-[#D4E3E0] dark:border-[#1B3335] w-fit">
        {(['Semua', 'Confirmed', 'Advanced Talks', 'Rumor'] as const).map((status) => {
          const active = filterStatus === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#136F73] text-white shadow-sm'
                  : 'text-[#486563] dark:text-[#8FB3B0] hover:text-[#132928] dark:hover:text-white'
              }`}
            >
              {status}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE8E6] dark:border-[#1B3335] text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3.5 px-6">Pemain</th>
                <th className="py-3.5 px-3">Posisi</th>
                <th className="py-3.5 px-3">Perpindahan</th>
                <th className="py-3.5 px-3 text-right">Nilai / Klausul</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 px-6 text-right">Profil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {filtered.map((item) => {
                const matchedPlayer = players.find(
                  (p) => p.fotmobId === item.playerFotmobId
                );
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar
                          fotmobId={item.playerFotmobId}
                          name={item.playerName}
                          size="sm"
                        />
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.playerName}
                          </div>
                          <div className="text-xs text-slate-500 font-mono-num">
                            {item.age} thn · {item.updatedAt}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-xs font-medium text-slate-700 dark:text-slate-300">
                      {item.position}
                    </td>
                    <td className="py-3.5 px-3 text-xs text-slate-700 dark:text-slate-300">
                      {item.fromClub} →{' '}
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {item.toClub}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-num text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {item.feeLabel}
                    </td>
                    <td className="py-3.5 px-3 text-xs">
                      <span
                        className={`font-medium ${
                          item.status === 'Confirmed'
                            ? 'text-[#136F73] dark:text-[#2DD4BF]'
                            : item.status === 'Advanced Talks'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {item.status} · {item.reliability}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {matchedPlayer ? (
                        <button
                          type="button"
                          onClick={() => onOpenPlayer(matchedPlayer)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#136F73] dark:text-[#2DD4BF] hover:underline whitespace-nowrap"
                        >
                          Inspeksi
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
