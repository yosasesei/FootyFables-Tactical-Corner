import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Award, CheckCircle2, Compass, Search, Sliders, Users } from 'lucide-react';
import type { Player, TacticalParameters, TeamManagerProfile } from '../types/footy';
import {
  calculateTacticalFit,
  formatMarketValue,
  rankManagersForPlayer,
} from '../utils/analytics';
import { PlayerAvatar } from './PlayerAvatar';

interface TacticalFitViewProps {
  players: Player[];
  managers: TeamManagerProfile[];
  initialPlayerId?: string;
  initialManagerId?: string;
  onOpenPlayer: (player: Player) => void;
}

export function TacticalFitView({
  players,
  managers,
  initialPlayerId,
  initialManagerId,
  onOpenPlayer,
}: TacticalFitViewProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    initialPlayerId || players[0]?.fotmobId || ''
  );
  const [mode, setMode] = useState<'manager' | 'custom'>('manager');
  const [selectedManagerId, setSelectedManagerId] = useState<string>(
    initialManagerId || managers[0]?.id || ''
  );
  const [managerLeagueFilter, setManagerLeagueFilter] = useState<string>('all');
  const [managerSearch, setManagerSearch] = useState<string>('');

  useEffect(() => {
    if (initialPlayerId) setSelectedPlayerId(initialPlayerId);
  }, [initialPlayerId]);

  useEffect(() => {
    if (initialManagerId) {
      setSelectedManagerId(initialManagerId);
      setMode('manager');
    }
  }, [initialManagerId]);

  const [customParams, setCustomParams] = useState<TacticalParameters>({
    pressingIntensity: 84,
    possessionFocus: 86,
    transitionSpeed: 68,
    buildUpStyle: 85,
    defensiveLine: 80,
    aerialPhysicality: 70,
  });

  const selectedPlayer = useMemo(
    () => players.find((p) => p.fotmobId === selectedPlayerId) || players[0],
    [players, selectedPlayerId]
  );

  const managerLeagues = useMemo(() => {
    const unique = Array.from(new Set(managers.map((m) => m.league).filter(Boolean)));
    return unique;
  }, [managers]);

  const filteredManagers = useMemo(() => {
    const q = managerSearch.trim().toLowerCase();
    return managers.filter((m) => {
      if (managerLeagueFilter !== 'all' && m.league !== managerLeagueFilter) return false;
      if (!q) return true;
      return (
        m.managerName.toLowerCase().includes(q) ||
        m.clubName.toLowerCase().includes(q) ||
        m.league.toLowerCase().includes(q) ||
        (m.tacticalArchetype || '').toLowerCase().includes(q)
      );
    });
  }, [managers, managerLeagueFilter, managerSearch]);

  const selectedManager = useMemo(
    () =>
      managers.find((m) => m.id === selectedManagerId) ||
      filteredManagers[0] ||
      managers[0],
    [managers, filteredManagers, selectedManagerId]
  );

  const activeParams: TacticalParameters = useMemo(() => {
    if (mode === 'manager' && selectedManager) {
      return {
        pressingIntensity: selectedManager.pressingIntensity,
        possessionFocus: selectedManager.possessionFocus,
        transitionSpeed: selectedManager.transitionSpeed,
        buildUpStyle: selectedManager.buildUpStyle,
        defensiveLine: selectedManager.defensiveLine,
        aerialPhysicality: selectedManager.aerialPhysicality,
      };
    }
    return customParams;
  }, [mode, selectedManager, customParams]);

  const fitResult = useMemo(() => {
    if (!selectedPlayer) return null;
    return calculateTacticalFit(selectedPlayer, activeParams, players);
  }, [selectedPlayer, activeParams, players]);

  const topManagerMatches = useMemo(() => {
    if (!selectedPlayer) return [];
    return rankManagersForPlayer(selectedPlayer, managers, 5);
  }, [selectedPlayer, managers]);

  if (!selectedPlayer || !fitResult) return null;

  const subScoreCards = [
    { label: 'System Fit', value: fitResult.subScores.systemFit },
    { label: 'Role Compatibility', value: fitResult.subScores.roleCompatibility },
    { label: 'Physical & Pressing Demand', value: fitResult.subScores.physicalPressingDemand },
    { label: 'Market Value ROI', value: fitResult.subScores.marketValueROI },
  ];

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7">
      <div className="pb-6 border-b border-[#DCE8E6] dark:border-[#1B3335]">
        <p className="text-xs font-medium text-[#136F73] dark:text-[#2DD4BF] mb-1 flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5" />
          Algorithmic Scouting &amp; Tactical Fit Engine
        </p>
        <h1 className="font-display text-3xl font-semibold text-slate-900 dark:text-slate-50">
          Simulasi Kecocokan Taktik &amp; Rekomendasi Pemain Serupa
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Evaluasi kompatibilitas pemain terhadap filosofi pelatih top atau parameter taktis kustom,
          lengkap dengan 3 alternatif pemain serupa.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Controls */}
        <section className="lg:col-span-5 p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] space-y-6">
          <div>
            <label
              htmlFor="fit-player-select"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2"
            >
              1. Pilih Pemain Target
            </label>
            <select
              id="fit-player-select"
              value={selectedPlayer.fotmobId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              {players.map((p) => (
                <option key={p.fotmobId} value={p.fotmobId}>
                  {p.name} — {p.club} ({p.primaryPosition})
                </option>
              ))}
            </select>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                2. Profil Sistem &amp; Pelatih
              </span>
              <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-[#DCE8E6] dark:border-[#1B3335]">
                <button
                  type="button"
                  onClick={() => setMode('manager')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    mode === 'manager'
                      ? 'bg-white dark:bg-[#182133] text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  Database Pelatih
                </button>
                <button
                  type="button"
                  onClick={() => setMode('custom')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    mode === 'custom'
                      ? 'bg-white dark:bg-[#182133] text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  Parameter Kustom
                </button>
              </div>
            </div>

            {mode === 'manager' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    aria-label="Filter Liga Pelatih"
                    value={managerLeagueFilter}
                    onChange={(e) => {
                      const nextLeague = e.target.value;
                      setManagerLeagueFilter(nextLeague);
                      const firstInLeague =
                        nextLeague === 'all'
                          ? managers[0]
                          : managers.find((m) => m.league === nextLeague);
                      if (firstInLeague) setSelectedManagerId(firstInLeague.id);
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">Semua Liga ({managers.length} Pelatih)</option>
                    {managerLeagues.map((lg) => (
                      <option key={lg} value={lg}>
                        {lg}
                      </option>
                    ))}
                  </select>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={managerSearch}
                      onChange={(e) => setManagerSearch(e.target.value)}
                      placeholder="Cari pelatih / klub..."
                      aria-label="Cari pelatih dunia"
                      className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <select
                  aria-label="Pilih Profil Pelatih"
                  value={selectedManager?.id || ''}
                  onChange={(e) => setSelectedManagerId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  {(filteredManagers.length > 0 ? filteredManagers : managers).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.managerName} · {m.clubName} ({m.primaryFormation})
                    </option>
                  ))}
                </select>

                {selectedManager && (
                  <div
                    data-testid="selected-manager-stats"
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {selectedManager.managerName} · {selectedManager.primaryFormation}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {selectedManager.clubName} · {selectedManager.league}
                          {selectedManager.nationality ? ` · ${selectedManager.nationality}` : ''}
                          {selectedManager.age ? ` (${selectedManager.age} thn)` : ''}
                        </div>
                        {selectedManager.tacticalArchetype && (
                          <div className="text-[11px] font-medium text-[#136F73] dark:text-[#2DD4BF] mt-0.5">
                            {selectedManager.tacticalArchetype}
                          </div>
                        )}
                      </div>
                      {selectedManager.syncedLive && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-[#136F73] dark:text-[#2DD4BF] text-[10px] font-semibold shrink-0">
                          Live Sync
                        </span>
                      )}
                    </div>

                    {/* Full Coaching Performance Metrics */}
                    <div className="grid grid-cols-4 gap-2 py-2.5 border-y border-slate-200/70 dark:border-slate-800 text-center font-mono-num">
                      <div>
                        <div className="text-[10px] text-slate-500">PPG</div>
                        <div className="text-sm font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                          {(selectedManager.pointsPerGame ?? 1.82).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Win %</div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {(selectedManager.winRatePct ?? 55.0).toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Laga</div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {selectedManager.matchesManaged ?? 120}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Trofi</div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {selectedManager.trophiesCount ?? 0}
                        </div>
                      </div>
                    </div>

                    {/* 6 Tactical Axis Bars */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {(
                        [
                          ['Pressing', selectedManager.pressingIntensity],
                          ['Possession', selectedManager.possessionFocus],
                          ['Transition', selectedManager.transitionSpeed],
                          ['Build-Up', selectedManager.buildUpStyle],
                          ['Def. Line', selectedManager.defensiveLine],
                          ['Aerial/Phys', selectedManager.aerialPhysicality],
                        ] as Array<[string, number]>
                      ).map(([lbl, val]) => (
                        <div key={lbl} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 dark:text-slate-400">{lbl}</span>
                            <span className="font-mono-num font-semibold text-slate-800 dark:text-slate-200">
                              {val}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#136F73] dark:bg-[#2DD4BF]"
                              style={{ width: `${val}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
                      {selectedManager.tacticalSummary}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3.5">
                {(
                  [
                    ['pressingIntensity', 'Pressing Intensity'],
                    ['possessionFocus', 'Possession Focus'],
                    ['transitionSpeed', 'Transition Speed'],
                    ['buildUpStyle', 'Build-Up Style (Direct → Short)'],
                    ['defensiveLine', 'Defensive Line Height'],
                    ['aerialPhysicality', 'Aerial & Physical Demand'],
                  ] as Array<[keyof TacticalParameters, string]>
                ).map(([key, label]) => (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <Sliders className="w-3 h-3 text-slate-400" />
                        {label}
                      </span>
                      <span className="font-mono-num font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                        {customParams[key]}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={99}
                      value={customParams[key]}
                      onChange={(e) =>
                        setCustomParams((prev) => ({
                          ...prev,
                          [key]: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right Result Engine */}
        <section className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <PlayerAvatar
                  fotmobId={selectedPlayer.fotmobId}
                  name={selectedPlayer.name}
                  size="lg"
                />
                <div>
                  <button
                    type="button"
                    onClick={() => onOpenPlayer(selectedPlayer)}
                    className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-50 hover:text-emerald-500 transition-colors text-left"
                  >
                    {selectedPlayer.name}
                  </button>
                  <div className="text-xs text-slate-500">
                    {selectedPlayer.club} · {selectedPlayer.primaryPosition} ·{' '}
                    {formatMarketValue(selectedPlayer.marketValueEur)}
                  </div>
                </div>
              </div>

              <div className="sm:text-right">
                <div className="text-xs text-slate-500">Tactical Fit Score</div>
                <div className="font-mono-num text-4xl font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                  {fitResult.overallScore}%
                </div>
              </div>
            </div>

            {/* 4 Sub-Scores */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-5">
              {subScoreCards.map((sub) => (
                <div
                  key={sub.label}
                  className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800"
                >
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{sub.label}</div>
                  <div className="mt-1 font-mono-num text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {sub.value}%
                  </div>
                </div>
              ))}
            </div>

            {/* Strengths & Adaptation Risks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-xs font-semibold text-[#136F73] dark:text-[#2DD4BF] mb-2.5 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Kelebihan Taktis
                </h3>
                <ul className="space-y-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {fitResult.strengths.map((s, idx) => (
                    <li key={idx}>· {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  Potensi Risiko Adaptasi
                </h3>
                <ul className="space-y-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {fitResult.risks.map((r, idx) => (
                    <li key={idx}>· {r}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Top 5 World Managers for Selected Player */}
          <div
            data-testid="top-world-managers-ranking"
            className="p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#136F73] dark:text-[#2DD4BF]" />
                Top 5 Pelatih Dunia Paling Cocok untuk {selectedPlayer.name}
              </h2>
              <span className="text-xs text-slate-500 font-mono-num">
                Evaluasi {managers.length} Pelatih Dunia
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {topManagerMatches.map(({ manager, fit }, idx) => {
                const isActive = mode === 'manager' && selectedManager?.id === manager.id;
                return (
                  <button
                    key={manager.id}
                    type="button"
                    onClick={() => {
                      setMode('manager');
                      setSelectedManagerId(manager.id);
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
                      isActive
                        ? 'border-[#136F73] dark:border-[#2DD4BF] bg-[#EBF5F4] dark:bg-[#112A2C]'
                        : 'border-[#DCE8E6] dark:border-[#1B3335] bg-slate-50/60 dark:bg-slate-900/50 hover:border-[#136F73]/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 text-[10px] font-mono-num">
                        <span className="text-slate-500">#{idx + 1}</span>
                        <span className="font-bold text-[#136F73] dark:text-[#2DD4BF] text-sm">
                          {fit.overallScore}%
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate mt-1">
                        {manager.managerName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {manager.clubName} · {manager.league}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-2 text-[10px] font-mono-num text-slate-500 whitespace-nowrap">
                      <span className="whitespace-nowrap">{manager.primaryFormation}</span>
                      <span className="whitespace-nowrap">PPG {(manager.pointsPerGame ?? 1.8).toFixed(2)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3 Similar Players */}
          <div className="p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-emerald-500" />
              3 Rekomendasi Pemain Alternatif Serupa
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {fitResult.similarPlayers.map((sim) => (
                <button
                  key={sim.player.fotmobId}
                  type="button"
                  onClick={() => onOpenPlayer(sim.player)}
                  className="p-4 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] hover:border-emerald-500/60 bg-slate-50/70 dark:bg-slate-900/50 text-left transition-colors flex flex-col justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <PlayerAvatar
                      fotmobId={sim.player.fotmobId}
                      name={sim.player.name}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {sim.player.name}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{sim.player.club}</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {sim.reason}
                  </p>
                  <div className="pt-2 border-t border-[#DCE8E6] dark:border-[#1B3335] flex items-center justify-between font-mono-num text-xs">
                    <span className="text-slate-500">Kemiripan</span>
                    <span className="font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                      {sim.similarityScore}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
