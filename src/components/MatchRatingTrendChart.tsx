import { useMemo, useState } from 'react';
import { Activity, TrendingDown, TrendingUp } from 'lucide-react';
import type { Player } from '../types/footy';
import { getPlayerRecentMatches } from '../utils/analytics';

interface MatchRatingTrendChartProps {
  player: Player;
}

export function MatchRatingTrendChart({ player }: MatchRatingTrendChartProps) {
  const matches = useMemo(() => getPlayerRecentMatches(player), [player]);
  const [activeIndex, setActiveIndex] = useState<number>(Math.max(0, matches.length - 1));

  const safeIdx = Math.min(activeIndex, Math.max(0, matches.length - 1));
  const activeMatch = matches[safeIdx];

  const tenMatchAvg = useMemo(() => {
    if (matches.length === 0) return player.stats.rating;
    const total = matches.reduce((s, m) => s + m.rating, 0);
    return Number((total / matches.length).toFixed(2));
  }, [matches, player.stats.rating]);

  const peakMatch = useMemo(() => {
    return matches.reduce((best, cur) => (cur.rating > best.rating ? cur : best), matches[0]);
  }, [matches]);

  const width = 760;
  const height = 220;
  const padLeft = 44;
  const padRight = 22;
  const padTop = 22;
  const padBottom = 34;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const minRating = 5.5;
  const maxRating = 10.0;

  const points = matches.map((m, idx) => {
    const x =
      matches.length <= 1
        ? padLeft + plotW / 2
        : padLeft + (idx / (matches.length - 1)) * plotW;
    const clamped = Math.max(minRating, Math.min(maxRating, m.rating));
    const y = padTop + plotH - ((clamped - minRating) / (maxRating - minRating)) * plotH;
    return { ...m, idx, x, y };
  });

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${padTop + plotH} L ${points[0].x.toFixed(
          1
        )} ${padTop + plotH} Z`
      : '';

  const avgY =
    padTop +
    plotH -
    ((Math.max(minRating, Math.min(maxRating, tenMatchAvg)) - minRating) /
      (maxRating - minRating)) *
      plotH;

  const yTicks = [6.0, 7.0, 8.0, 9.0, 10.0].map((val) => ({
    val,
    y: padTop + plotH - ((val - minRating) / (maxRating - minRating)) * plotH,
  }));

  const getDotColor = (rating: number) => {
    if (rating >= 7.5) return '#14B8A6';
    if (rating >= 6.8) return '#F59E0B';
    return '#F43F5E';
  };

  const getRatingTextClass = (rating: number) => {
    if (rating >= 7.5) return 'text-[#136F73] dark:text-[#2DD4BF]';
    if (rating >= 6.8) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  const deltaVsSeason = activeMatch
    ? Number((activeMatch.rating - player.stats.rating).toFixed(2))
    : 0;

  return (
    <div className="space-y-4" data-testid="match-rating-trend-chart">
      {/* Header & Active Match Inspector Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#136F73] dark:text-[#2DD4BF]" />
            Tren Performa 10 Pertandingan Terakhir (FotMob Rating)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Klik atau arahkan kursor ke titik pertandingan untuk membedah fluktuasi rating per laga.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <span className="text-slate-400">Rata-rata 10 Laga: </span>
            <span className="font-mono-num font-semibold text-[#136F73] dark:text-[#2DD4BF]">
              {tenMatchAvg.toFixed(2)}
            </span>
          </div>
          {peakMatch && (
            <div>
              <span className="text-slate-400">Puncak: </span>
              <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                {peakMatch.rating.toFixed(2)} ({peakMatch.opponent})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Selected Match Callout Strip */}
      {activeMatch && (
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
              Laga {safeIdx + 1}/10
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">{activeMatch.date}</span>
            <span aria-hidden="true">·</span>
            <span>{activeMatch.competition}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activeMatch.homeAway === 'H' ? 'vs' : '@'} {activeMatch.opponent} (
              {activeMatch.score})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono-num">
            <span className="text-slate-500 dark:text-slate-400">
              {activeMatch.minutes}&apos; · {activeMatch.goals}G {activeMatch.assists}A
            </span>
            <span
              className={`inline-flex items-center gap-1 font-semibold ${
                deltaVsSeason >= 0
                  ? 'text-[#136F73] dark:text-[#2DD4BF]'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {deltaVsSeason >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {deltaVsSeason >= 0 ? '+' : ''}
              {deltaVsSeason.toFixed(2)} vs musim
            </span>
            <span className={`text-base font-bold ${getRatingTextClass(activeMatch.rating)}`}>
              {activeMatch.rating.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* SVG Trend Chart */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible"
        role="img"
        aria-label={`Grafik tren rating FotMob 10 pertandingan terakhir ${player.name}`}
      >
        <defs>
          <linearGradient id="ratingTrendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#14B8A6" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y Grid Lines */}
        {yTicks.map((tick) => (
          <g key={tick.val}>
            <line
              x1={padLeft}
              y1={tick.y}
              x2={width - padRight}
              y2={tick.y}
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeDasharray="3 3"
            />
            <text
              x={padLeft - 8}
              y={tick.y + 3}
              textAnchor="end"
              fontSize={10}
              className="fill-slate-400 dark:fill-slate-500 font-mono-num"
            >
              {tick.val.toFixed(1)}
            </text>
          </g>
        ))}

        {/* 10-Match Average Benchmark Line */}
        <line
          x1={padLeft}
          y1={avgY}
          x2={width - padRight}
          y2={avgY}
          stroke="#0D9488"
          strokeWidth={1.2}
          strokeDasharray="5 4"
          opacity={0.7}
        />
        <text
          x={padLeft + 4}
          y={Math.max(padTop + 10, avgY - 6)}
          textAnchor="start"
          fontSize={9.5}
          className="fill-[#136F73] dark:fill-[#2DD4BF] font-mono-num font-semibold"
        >
          AVG {tenMatchAvg.toFixed(2)}
        </text>

        {areaPath && <path d={areaPath} fill="url(#ratingTrendGrad)" />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="#14B8A6"
            strokeWidth={2.6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Active Vertical Marker */}
        {points[safeIdx] && (
          <line
            x1={points[safeIdx].x}
            y1={padTop}
            x2={points[safeIdx].x}
            y2={padTop + plotH}
            className="stroke-teal-500/40"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}

        {/* Interactive Match Nodes */}
        {points.map((pt, idx) => {
          const isActive = idx === safeIdx;
          const color = getDotColor(pt.rating);
          return (
            <g key={pt.id}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isActive ? 6.5 : 4.2}
                fill={color}
                className="stroke-white dark:stroke-[#0F1E20] transition-all"
                strokeWidth={2}
              />
              {isActive && (
                <text
                  x={pt.x}
                  y={pt.y - 10}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={700}
                  className="fill-slate-900 dark:fill-white font-mono-num"
                >
                  {pt.rating.toFixed(2)}
                </text>
              )}
              <text
                x={pt.x}
                y={height - 10}
                textAnchor="middle"
                fontSize={10}
                className={
                  isActive
                    ? 'fill-slate-900 dark:fill-slate-100 font-semibold font-mono-num'
                    : 'fill-slate-400 dark:fill-slate-500 font-mono-num'
                }
              >
                M{idx + 1}
              </text>
              <rect
                x={pt.x - 24}
                y={padTop}
                width={48}
                height={plotH + 26}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => setActiveIndex(idx)}
              />
            </g>
          );
        })}
      </svg>

      {/* Quick 10-Match Rating Strip */}
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 pt-1">
        {matches.map((m, idx) => {
          const isActive = idx === safeIdx;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveIndex(idx)}
              aria-label={`Laga ${idx + 1} vs ${m.opponent} rating ${m.rating.toFixed(2)}`}
              className={`p-2 rounded-lg border text-center transition-all ${
                isActive
                  ? 'border-[#136F73] dark:border-[#2DD4BF] bg-[#E8F3F2] dark:bg-[#132E30]'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 hover:border-teal-500/50'
              }`}
            >
              <div className="text-[10px] text-slate-400 truncate" title={m.opponent}>
                {m.opponent.slice(0, 5)}
              </div>
              <div className={`font-mono-num text-xs font-bold mt-0.5 ${getRatingTextClass(m.rating)}`}>
                {m.rating.toFixed(1)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
