import { useEffect, useState } from 'react';
import type { MarketValuePoint } from '../types/footy';
import { formatMarketValue } from '../utils/analytics';

interface MarketValueChartProps {
  history: MarketValuePoint[];
}

export function MarketValueChart({ history }: MarketValueChartProps) {
  const [activeIndex, setActiveIndex] = useState<number>(Math.max(0, history.length - 1));

  const latestDate = history[history.length - 1]?.date || '';
  useEffect(() => {
    setActiveIndex(Math.max(0, history.length - 1));
  }, [history.length, latestDate]);

  if (history.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-500">
        Belum ada riwayat tren valuasi pasar.
      </div>
    );
  }

  const width = 640;
  const height = 220;
  const padLeft = 56;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 34;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(...history.map((h) => h.valueEur), 1_000_000) * 1.1;
  const minVal = 0;

  const points = history.map((pt, idx) => {
    const x =
      history.length === 1
        ? padLeft + plotW / 2
        : padLeft + (idx / (history.length - 1)) * plotW;
    const y = padTop + plotH - ((pt.valueEur - minVal) / (maxVal - minVal)) * plotH;
    return { ...pt, x, y };
  });

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${
    padTop + plotH
  } L ${points[0].x.toFixed(1)} ${padTop + plotH} Z`;

  const safeIndex = Math.min(activeIndex, points.length - 1);
  const activePoint = points[safeIndex] ?? points[points.length - 1];
  const yTicks = [0, 0.5, 1].map((t) => ({
    y: padTop + plotH - t * plotH,
    label: formatMarketValue(minVal + t * (maxVal - minVal)),
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
            {activePoint.date}
          </span>
          <span aria-hidden="true">·</span>
          <span>{activePoint.club}</span>
          {latestDate && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num text-[11px] text-[#136F73] dark:text-[#2DD4BF]">
                Update Terkini: {latestDate}
              </span>
            </>
          )}
        </div>
        <div className="font-mono-num text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          {formatMarketValue(activePoint.valueEur)}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-52 overflow-visible"
        role="img"
        aria-label="Market Value Trend Chart"
      >
        <defs>
          <linearGradient id="mvAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yTicks.map((tick, idx) => (
          <g key={idx}>
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
              {tick.label}
            </text>
          </g>
        ))}

        {points.length > 1 && <path d={areaPath} fill="url(#mvAreaGrad)" />}
        {points.length > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke="#10B981"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Active vertical guide */}
        <line
          x1={activePoint.x}
          y1={padTop}
          x2={activePoint.x}
          y2={padTop + plotH}
          className="stroke-emerald-500/40"
          strokeWidth={1}
          strokeDasharray="2 2"
        />

        {points.map((pt, idx) => {
          const isActive = idx === activeIndex;
          return (
            <g key={`${pt.date}-${idx}`}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isActive ? 5.5 : 3.5}
                fill={isActive ? '#10B981' : '#059669'}
                className="stroke-white dark:stroke-[#0F1E20] transition-all"
                strokeWidth={2}
              />
              <text
                x={pt.x}
                y={height - 8}
                textAnchor="middle"
                fontSize={10}
                className={
                  isActive
                    ? 'fill-slate-900 dark:fill-slate-100 font-semibold font-mono-num'
                    : 'fill-slate-400 dark:fill-slate-500 font-mono-num'
                }
              >
                {pt.date}
              </text>
              {/* Invisible wide hit zone */}
              <rect
                x={pt.x - 22}
                y={padTop}
                width={44}
                height={plotH + 24}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => setActiveIndex(idx)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
