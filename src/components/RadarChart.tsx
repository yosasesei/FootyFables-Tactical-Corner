import { useState } from 'react';
import type { PlayerRadarPercentiles } from '../types/footy';

export interface RadarSeries {
  id: string;
  label: string;
  color: string;
  data: PlayerRadarPercentiles;
}

interface RadarChartProps {
  series: RadarSeries[];
  size?: number;
}

const AXES: Array<{ key: keyof PlayerRadarPercentiles; label: string }> = [
  { key: 'attacking', label: 'Attacking' },
  { key: 'creativity', label: 'Creativity' },
  { key: 'progression', label: 'Progression' },
  { key: 'efficiency', label: 'Efficiency' },
  { key: 'workrate', label: 'Workrate' },
  { key: 'defending', label: 'Defending' },
];

export const RADAR_PALETTE = ['#10B981', '#F59E0B', '#38BDF8', '#F43F5E'];

export function RadarChart({ series, size = 320 }: RadarChartProps) {
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const levels = [25, 50, 75, 99];

  const getPoint = (axisIndex: number, value: number) => {
    const angle = (Math.PI * 2 * axisIndex) / AXES.length - Math.PI / 2;
    const r = (Math.max(0, Math.min(99, value)) / 99) * radius;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  };

  const getLabelPos = (axisIndex: number) => {
    const angle = (Math.PI * 2 * axisIndex) / AXES.length - Math.PI / 2;
    const r = radius + 28;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  };

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible max-w-full h-auto"
        role="img"
        aria-label="Attribute Radar Chart"
      >
        {/* Concentric rings */}
        {levels.map((lvl) => {
          const pts = AXES.map((_, idx) => {
            const p = getPoint(idx, lvl);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          }).join(' ');
          return (
            <polygon
              key={lvl}
              points={pts}
              fill="none"
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeWidth={lvl === 99 ? 1.25 : 1}
              strokeDasharray={lvl < 99 ? '3 3' : undefined}
            />
          );
        })}

        {/* Radial spoke lines */}
        {AXES.map((axis, idx) => {
          const end = getPoint(idx, 99);
          const isHovered = hoveredAxis === idx;
          return (
            <line
              key={axis.key}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              className={
                isHovered
                  ? 'stroke-emerald-500/70'
                  : 'stroke-slate-200 dark:stroke-slate-800'
              }
              strokeWidth={isHovered ? 1.5 : 1}
            />
          );
        })}

        {/* Ring numeric markers */}
        {levels.map((lvl) => {
          const p = getPoint(0, lvl);
          return (
            <text
              key={`lvl-${lvl}`}
              x={p.x + 5}
              y={p.y + 3}
              className="fill-slate-400 dark:fill-slate-500 font-mono-num"
              fontSize={9}
            >
              {lvl}
            </text>
          );
        })}

        {/* Series polygons */}
        {series.map((item) => {
          const polygonPts = AXES.map((axis, idx) => {
            const p = getPoint(idx, item.data[axis.key]);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          }).join(' ');

          return (
            <g key={item.id}>
              <polygon
                points={polygonPts}
                fill={item.color}
                fillOpacity={series.length > 1 ? 0.14 : 0.2}
                stroke={item.color}
                strokeWidth={2.2}
                strokeLinejoin="round"
                className="transition-opacity duration-200"
              />
              {AXES.map((axis, idx) => {
                const p = getPoint(idx, item.data[axis.key]);
                return (
                  <circle
                    key={`${item.id}-${axis.key}`}
                    cx={p.x}
                    cy={p.y}
                    r={hoveredAxis === idx ? 4.5 : 3}
                    fill={item.color}
                    className="stroke-white dark:stroke-[#0F1E20]"
                    strokeWidth={1.5}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Axis labels */}
        {AXES.map((axis, idx) => {
          const pos = getLabelPos(idx);
          const anchor =
            Math.abs(pos.x - cx) < 10
              ? 'middle'
              : pos.x > cx
              ? 'start'
              : 'end';
          return (
            <g
              key={`label-${axis.key}`}
              onMouseEnter={() => setHoveredAxis(idx)}
              onMouseLeave={() => setHoveredAxis(null)}
              className="cursor-default"
            >
              <text
                x={pos.x}
                y={pos.y}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize={11}
                fontWeight={hoveredAxis === idx ? 600 : 500}
                className={
                  hoveredAxis === idx
                    ? 'fill-emerald-600 dark:fill-emerald-400'
                    : 'fill-slate-600 dark:fill-slate-300'
                }
              >
                {axis.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredAxis !== null && (
        <div className="mt-2 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {AXES[hoveredAxis].label}:
          </span>
          {series.map((item) => (
            <span key={item.id} className="flex items-center gap-1.5 font-mono-num">
              <span
                className="w-2 h-2 rounded-xs inline-block"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-slate-600 dark:text-slate-300">{item.label}</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {item.data[AXES[hoveredAxis].key]}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
