import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Loader2, Search, X } from 'lucide-react';
import { searchGlobal } from '../services/gasApi';
import type { GlobalSearchResult, Player } from '../types/footy';
import { formatMarketValue } from '../utils/analytics';
import { PlayerAvatar } from './PlayerAvatar';

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelectPlayer: (player: Player) => void;
  onSelectClub: (clubId: string, leagueId: string) => void;
}

export function GlobalSearchModal({
  open,
  onClose,
  onSelectPlayer,
  onSelectClub,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult>({
    players: [],
    clubs: [],
    source: 'local-cache',
  });

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const res = await searchGlobal(query);
      setResults(res);
      setLoading(false);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-950/70 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Global Player and Club Search"
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#0F1E20] border border-[#DCE8E6] dark:border-[#1B3335] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#DCE8E6] dark:border-[#1B3335]">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari pemain dunia, klub, posisi, atau liga..."
            className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          {loading && <Loader2 className="w-4 h-4 text-emerald-500 animate-spin shrink-0" />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pencarian"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
          {/* Players Section */}
          <div className="p-3">
            <div className="px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Pemain ({results.players.length})</span>
              <span className="font-mono-num text-[11px] text-slate-400">
                {results.source === 'hybrid-sheets-proxy'
                  ? 'Live Proxy + Sheets'
                  : 'Sheets Cache'}
              </span>
            </div>

            {results.players.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500">
                Tidak ada pemain yang cocok dengan pencarian &ldquo;{query}&rdquo;.
              </div>
            ) : (
              <div className="mt-1 space-y-1">
                {results.players.map((player) => (
                  <button
                    key={player.fotmobId}
                    type="button"
                    onClick={() => {
                      onSelectPlayer(player);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PlayerAvatar fotmobId={player.fotmobId} name={player.name} size="sm" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {player.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                          <span>{player.club}</span>
                          <span aria-hidden="true">·</span>
                          <span>{player.primaryPosition}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num">{player.age} thn</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-mono-num font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                          {formatMarketValue(player.marketValueEur)}
                        </div>
                        <div className="text-[11px] font-mono-num text-slate-500">
                          FotMob {player.stats.rating.toFixed(2)}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clubs Section */}
          {results.clubs.length > 0 && (
            <div className="p-3">
              <div className="px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Klub ({results.clubs.length})
              </div>
              <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {results.clubs.map((club) => (
                  <button
                    key={club.id}
                    type="button"
                    onClick={() => {
                      onSelectClub(club.id, club.leagueId);
                      onClose();
                    }}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {club.name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {club.leagueName} · {club.manager}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
