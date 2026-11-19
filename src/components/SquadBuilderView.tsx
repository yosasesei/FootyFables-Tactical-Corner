import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Layers,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { TACTICAL_FORMATIONS } from '../data/fallbackData';
import type { FormationSlot, Player } from '../types/footy';
import { analyzeSquadBalance, formatMarketValue } from '../utils/analytics';
import { PlayerAvatar } from './PlayerAvatar';

interface SquadBuilderViewProps {
  players: Player[];
  onOpenPlayer: (player: Player) => void;
}

const DEFAULT_SLOT_ASSIGNMENTS: Record<string, string> = {
  gk: '664516',
  lb: '1073884',
  lcb: '286943',
  ccb: '1073884',
  rcb: '955406',
  rb: '904970',
  lwb: '1073884',
  rwb: '904970',
  dm: '675088',
  ldm: '675088',
  rdm: '743533',
  lcm: '1083323',
  rcm: '534670',
  lam: '1103594',
  ram: '1077894',
  cam: '1103594',
  lw: '1137705',
  rw: '1467236',
  st: '737066',
  lst: '701154',
  rst: '737066',
};

export function SquadBuilderView({ players, onOpenPlayer }: SquadBuilderViewProps) {
  const [formationId, setFormationId] = useState<string>(TACTICAL_FORMATIONS[0].id);
  const [phase, setPhase] = useState<'inPossession' | 'outOfPossession'>('inPossession');
  const [assignments, setAssignments] = useState<Record<string, string>>(DEFAULT_SLOT_ASSIGNMENTS);
  const [summoningSlot, setSummoningSlot] = useState<FormationSlot | null>(null);
  const [summonQuery, setSummonQuery] = useState('');

  const formation = useMemo(
    () => TACTICAL_FORMATIONS.find((f) => f.id === formationId) || TACTICAL_FORMATIONS[0],
    [formationId]
  );

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of players) map.set(p.fotmobId, p);
    return map;
  }, [players]);

  const assignedPlayersBySlot = useMemo(() => {
    const out: Record<string, Player | undefined> = {};
    for (const slot of formation.slots) {
      const pid = assignments[slot.slotId];
      out[slot.slotId] = pid ? playerMap.get(pid) : undefined;
    }
    return out;
  }, [formation, assignments, playerMap]);

  const balance = useMemo(
    () => analyzeSquadBalance(formation.slots, assignedPlayersBySlot),
    [formation.slots, assignedPlayersBySlot]
  );

  const filteredSummonPlayers = useMemo(() => {
    const q = summonQuery.trim().toLowerCase();
    return players.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.club.toLowerCase().includes(q) ||
        p.primaryPosition.toLowerCase().includes(q)
    );
  }, [players, summonQuery]);

  const handleAssignPlayer = (slotId: string, fotmobId: string) => {
    setAssignments((prev) => ({ ...prev, [slotId]: fotmobId }));
    setSummoningSlot(null);
    setSummonQuery('');
  };

  const handleClearXI = () => {
    setAssignments({});
  };

  const handleResetDemoXI = () => {
    setAssignments(DEFAULT_SLOT_ASSIGNMENTS);
  };

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-[#DCE8E6] dark:border-[#1B3335]">
        <div>
          <p className="text-xs font-medium text-[#136F73] dark:text-[#2DD4BF] mb-1 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            Interactive Tactical Squad Builder
          </p>
          <h1 className="font-display text-3xl font-semibold text-slate-900 dark:text-slate-50">
            Papan Taktik 2D &amp; Summon Pemain Dunia
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Klik lingkaran posisi mana pun untuk memanggil pemain dunia, lalu ubah fase serangan dan
            bertahan secara real-time.
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0">
          <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-[#DCE8E6] dark:border-[#1B3335]">
            <button
              type="button"
              onClick={() => setPhase('inPossession')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                phase === 'inPossession'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              In Possession
            </button>
            <button
              type="button"
              onClick={() => setPhase('outOfPossession')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                phase === 'outOfPossession'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Out of Possession
            </button>
          </div>

          <button
            type="button"
            onClick={handleClearXI}
            className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Kosongkan XI
          </button>
          <button
            type="button"
            onClick={handleResetDemoXI}
            aria-label="Muat Ulang Best XI"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Demo XI
          </button>
        </div>
      </div>

      {/* Formation Selector */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-[#E4EFED] dark:bg-[#0D1A1C] border border-[#D4E3E0] dark:border-[#1B3335] w-fit">
        {TACTICAL_FORMATIONS.map((f) => {
          const active = f.id === formationId;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormationId(f.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#136F73] text-white shadow-sm'
                  : 'text-[#486563] dark:text-[#8FB3B0] hover:text-[#132928] dark:hover:text-white'
              }`}
            >
              {f.name}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 2D Interactive Pitch */}
        <section className="lg:col-span-8">
          <div
            data-testid="tactical-pitch"
            data-phase={phase}
            data-formation={formation.id}
            className="relative w-full aspect-[4/4.8] sm:aspect-[16/14] rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-[#0F2A1D] select-none shadow-inner"
          >
            {/* Pitch SVG Markings */}
            <svg
              viewBox="0 0 100 115"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
            >
              {/* Grass Stripes */}
              {Array.from({ length: 10 }).map((_, idx) => (
                <rect
                  key={idx}
                  x="0"
                  y={idx * 11.5}
                  width="100"
                  height="11.5"
                  fill={idx % 2 === 0 ? '#133524' : '#0E281B'}
                />
              ))}
              {/* Outer Boundary */}
              <rect
                x="4"
                y="4"
                width="92"
                height="107"
                fill="none"
                stroke="#A7F3D0"
                strokeWidth="0.45"
              />
              {/* Halfway Line & Center Circle */}
              <line x1="4" y1="57.5" x2="96" y2="57.5" stroke="#A7F3D0" strokeWidth="0.4" />
              <circle cx="50" cy="57.5" r="10.5" fill="none" stroke="#A7F3D0" strokeWidth="0.4" />
              <circle cx="50" cy="57.5" r="0.7" fill="#A7F3D0" />
              {/* Top Penalty Area */}
              <rect
                x="24"
                y="4"
                width="52"
                height="17"
                fill="none"
                stroke="#A7F3D0"
                strokeWidth="0.4"
              />
              <rect
                x="36"
                y="4"
                width="28"
                height="6.5"
                fill="none"
                stroke="#A7F3D0"
                strokeWidth="0.4"
              />
              {/* Bottom Penalty Area */}
              <rect
                x="24"
                y="94"
                width="52"
                height="17"
                fill="none"
                stroke="#A7F3D0"
                strokeWidth="0.4"
              />
              <rect
                x="36"
                y="104.5"
                width="28"
                height="6.5"
                fill="none"
                stroke="#A7F3D0"
                strokeWidth="0.4"
              />
            </svg>

            {/* Phase Badge on Pitch */}
            <div className="hidden sm:block absolute top-3 left-3 z-10 px-3 py-1 rounded-lg bg-slate-950/70 backdrop-blur-xs border border-white/10 text-[11px] font-medium text-slate-200">
              {formation.name} ·{' '}
              <span
                className={
                  phase === 'inPossession' ? 'text-emerald-400' : 'text-amber-400'
                }
              >
                {phase === 'inPossession' ? 'Fase Build-Up' : 'Fase High Press / Block'}
              </span>
            </div>

            {/* Interactive Slot Nodes */}
            {formation.slots.map((slot) => {
              const coords = phase === 'inPossession' ? slot.inPossession : slot.outOfPossession;
              const player = assignedPlayersBySlot[slot.slotId];

              return (
                <button
                  key={slot.slotId}
                  type="button"
                  onClick={() => setSummoningSlot(slot)}
                  aria-label={`Slot ${slot.label} ${slot.roleTitle}${
                    player ? ` terisi ${player.name}` : ' kosong'
                  }`}
                  style={{
                    left: `${coords.x}%`,
                    top: `${coords.y}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ease-out group flex flex-col items-center focus:outline-none z-10"
                >
                  {player ? (
                    <div className="relative scale-90 sm:scale-100">
                      <div className="p-0.5 rounded-full bg-teal-500/90 group-hover:scale-110 transition-transform shadow-lg">
                        <PlayerAvatar fotmobId={player.fotmobId} name={player.name} size="md" />
                      </div>
                      <span className="absolute -top-1.5 -right-2 px-1.5 py-0.5 rounded bg-slate-950/90 text-[10px] font-mono-num font-semibold text-teal-300 border border-teal-500/40">
                        {player.stats.rating.toFixed(1)}
                      </span>
                    </div>
                  ) : (
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 border-dashed border-teal-300/70 bg-slate-950/60 group-hover:bg-teal-600/40 group-hover:border-teal-300 flex items-center justify-center text-teal-200 transition-colors">
                      <Plus className="w-4 h-4" />
                    </div>
                  )}

                  <div className="mt-1 px-1.5 sm:px-2 py-0.5 rounded bg-slate-950/85 border border-white/10 text-center max-w-[78px] sm:max-w-[116px]">
                    <div className="text-[10px] sm:text-[11px] font-semibold text-white truncate">
                      {player ? player.name.split(' ').slice(-1)[0] : slot.label}
                    </div>
                    <div className="hidden sm:block text-[9px] text-teal-300/90 truncate">
                      {slot.roleTitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {formation.description}
          </p>
        </section>

        {/* Tactical Balance Analyzer Sidebar */}
        <aside className="lg:col-span-4 space-y-5">
          <div className="p-6 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20] space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Tactical Balance Analyzer
              </h2>
              <span className="font-mono-num text-xs text-slate-500">
                {balance.filledCount}/{formation.slots.length} XI
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60">
                <div className="text-[11px] text-slate-500">Skor Keseimbangan</div>
                <div className="mt-1 font-mono-num text-2xl font-semibold text-[#136F73] dark:text-[#2DD4BF]">
                  {balance.balanceScore}/99
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60">
                <div className="text-[11px] text-slate-500">Rata-rata Usia</div>
                <div className="mt-1 font-mono-num text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {balance.averageAge > 0 ? `${balance.averageAge} thn` : '—'}
                </div>
              </div>
              <div className="col-span-2 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
                <span className="text-xs text-slate-500">Total Market Value XI</span>
                <span className="font-mono-num text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {formatMarketValue(balance.totalMarketValueEur)}
                </span>
              </div>
            </div>

            {/* Line Ratings */}
            <div className="space-y-3 pt-2">
              {[
                { label: 'Lini Serang (Attack)', val: balance.lineRatings.attack },
                { label: 'Poros Tengah (Midfield)', val: balance.lineRatings.midfield },
                { label: 'Struktur Pertahanan (Defense)', val: balance.lineRatings.defense },
                { label: 'Kesiapan Pressing', val: balance.pressingReadiness },
              ].map((line) => (
                <div key={line.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-300">{line.label}</span>
                    <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                      {line.val}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${line.val}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Tactical Warnings */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Catatan Struktur
              </div>
              {balance.warnings.length === 0 ? (
                <p className="text-xs text-[#136F73] dark:text-[#2DD4BF]">
                  Seluruh 11 peran selaras dengan posisi natural dan kebutuhan pressing formasi.
                </p>
              ) : (
                <ul className="space-y-2">
                  {balance.warnings.map((w, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Filled Squad Quick List */}
          <div className="p-5 rounded-2xl border border-[#DCE8E6] dark:border-[#1B3335] bg-white dark:bg-[#0F1E20]">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-emerald-500" />
              Daftar Skuad Aktif
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
              {formation.slots.map((slot) => {
                const pl = assignedPlayersBySlot[slot.slotId];
                return (
                  <div
                    key={slot.slotId}
                    className="py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-mono-num font-semibold text-slate-400 mr-2">
                        {slot.label}
                      </span>
                      {pl ? (
                        <button
                          type="button"
                          onClick={() => onOpenPlayer(pl)}
                          className="font-medium text-slate-800 dark:text-slate-200 hover:text-emerald-500 truncate"
                        >
                          {pl.name}
                        </button>
                      ) : (
                        <span className="text-slate-400 italic">Kosong</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSummoningSlot(slot)}
                      className="text-[#136F73] dark:text-[#2DD4BF] hover:underline shrink-0"
                    >
                      {pl ? 'Ganti' : 'Summon'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* Summon Global Player Modal */}
      {summoningSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={() => setSummoningSlot(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Summon pemain untuk ${summoningSlot.roleTitle}`}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0F1E20] border border-[#DCE8E6] dark:border-[#1B3335] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#DCE8E6] dark:border-[#1B3335] flex items-center justify-between">
              <div>
                <div className="text-xs text-[#136F73] dark:text-[#2DD4BF] font-semibold">
                  Summon Pemain Dunia
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Slot {summoningSlot.label} · {summoningSlot.roleTitle}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSummoningSlot(null)}
                aria-label="Tutup modal summon"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={summonQuery}
                onChange={(e) => setSummonQuery(e.target.value)}
                placeholder="Cari pemain dunia (misal: Rodri, Saka, Saliba)..."
                className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
              />
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSummonPlayers.map((p) => (
                <button
                  key={p.fotmobId}
                  type="button"
                  onClick={() => handleAssignPlayer(summoningSlot.slotId, p.fotmobId)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <PlayerAvatar fotmobId={p.fotmobId} name={p.name} size="sm" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {p.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.club} · {p.primaryPosition} · {p.roleTag}
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono-num text-xs shrink-0">
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
    </div>
  );
}
