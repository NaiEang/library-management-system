import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { formatCompact, niceMax } from '../format';

export interface Series {
  key: string;
  label: string;
  /** A CSS color, normally `var(--series-n)` so light/dark steps swap automatically. */
  color: string;
}

type Row = Record<string, string | number>;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function Legend({ series, shape }: { series: Series[]; shape: 'line' | 'rect' }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key} className="legend-item">
          <span className={shape === 'line' ? 'key-line' : 'key-rect'} style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({
  left,
  top,
  width,
  title,
  rows,
}: {
  left: number;
  top: number;
  width: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  // Keep the box inside the chart so it never clips at the edges
  const clamped = Math.min(Math.max(left, 75), Math.max(75, width - 75));
  return (
    <div className="tooltip" style={{ left: clamped, top }} role="status">
      <div className="tooltip-title">{title}</div>
      {rows.map((row) => (
        <div key={row.label} className="tooltip-row">
          {row.color && <span className="key-line" style={{ background: row.color }} />}
          <strong>{row.value}</strong>
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  );
}

function YGrid({
  ticks,
  y,
  left,
  right,
  format,
}: {
  ticks: number[];
  y: (v: number) => number;
  left: number;
  right: number;
  format: (n: number) => string;
}) {
  return (
    <g>
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={left}
            x2={right}
            y1={y(tick)}
            y2={y(tick)}
            stroke={tick === 0 ? 'var(--axis)' : 'var(--grid)'}
            strokeWidth={1}
          />
          <text className="tick" x={left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
            {format(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

interface ChartProps {
  data: Row[];
  xKey: string;
  series: Series[];
  height?: number;
  formatX: (value: string | number) => string;
  formatY?: (value: number) => string;
  ariaLabel: string;
}

/** Multi-series line chart: crosshair snaps to the nearest x, one tooltip lists every series. */
export function LineChart({
  data,
  xKey,
  series,
  height = 230,
  formatX,
  formatY = formatCompact,
  ariaLabel,
}: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const margin = { top: 12, right: series.length > 1 ? 84 : 24, bottom: 24, left: 40 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const values = data.flatMap((row) => series.map((s) => Number(row[s.key])));
  const maxY = niceMax(Math.max(1, ...values));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const x = (i: number) => margin.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => margin.top + innerH - (v / maxY) * innerH;
  const tickEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 90))));

  // Direct end labels only when they don't collide; otherwise legend + tooltip carry identity
  const last = data.length - 1;
  const ends = series.map((s) => ({ s, y: y(Number(data[last]?.[s.key] ?? 0)) })).sort((a, b) => a.y - b.y);
  const endLabelsFit = series.length > 1 && ends.every((end, i) => i === 0 || end.y - ends[i - 1].y >= 13);

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left - margin.left) / (innerW || 1);
    setHover(Math.min(last, Math.max(0, Math.round(ratio * last))));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowRight') setHover((h) => Math.min(last, (h ?? -1) + 1));
    if (event.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? last + 1) - 1));
  };

  return (
    <div className="chart" ref={ref}>
      {series.length > 1 && <Legend series={series} shape="line" />}
      <div style={{ position: 'relative' }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            tabIndex={0}
            onPointerMove={pick}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            onFocus={() => setHover(last)}
            onBlur={() => setHover(null)}
          >
            <YGrid ticks={ticks} y={y} left={margin.left} right={margin.left + innerW} format={formatY} />
            {data.map((row, i) =>
              (i % tickEvery === 0 && last - i >= tickEvery / 2) || i === last ? (
                <text
                  key={i}
                  className="tick"
                  x={x(i)}
                  y={height - 6}
                  textAnchor={i === last ? 'end' : i === 0 ? 'start' : 'middle'}
                >
                  {formatX(row[xKey])}
                </text>
              ) : null,
            )}
            {series.length === 1 && (
              <path
                d={`M${x(0)},${y(0)} ${data.map((row, i) => `L${x(i)},${y(Number(row[series[0].key]))}`).join(' ')} L${x(last)},${y(0)} Z`}
                fill={series[0].color}
                opacity={0.1}
              />
            )}
            {series.map((s) => (
              <path
                key={s.key}
                d={data.map((row, i) => `${i ? 'L' : 'M'}${x(i)},${y(Number(row[s.key]))}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {hover === null &&
              series.map((s) => (
                <circle
                  key={s.key}
                  cx={x(last)}
                  cy={y(Number(data[last]?.[s.key] ?? 0))}
                  r={4}
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              ))}
            {endLabelsFit &&
              ends.map(({ s, y: endY }) => (
                <text key={s.key} className="end-label" x={x(last) + 10} y={endY} dy="0.32em">
                  {s.label} {formatY(Number(data[last][s.key]))}
                </text>
              ))}
            {hover !== null && (
              <g pointerEvents="none">
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={margin.top}
                  y2={margin.top + innerH}
                  stroke="var(--axis)"
                  strokeWidth={1}
                />
                {series.map((s) => (
                  <circle
                    key={s.key}
                    cx={x(hover)}
                    cy={y(Number(data[hover][s.key]))}
                    r={4}
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}
          </svg>
        )}
        {hover !== null && data[hover] && (
          <Tooltip
            left={x(hover)}
            top={Math.min(...series.map((s) => y(Number(data[hover][s.key]))))}
            width={width}
            title={formatX(data[hover][xKey])}
            rows={series.map((s) => ({ label: s.label, value: formatY(Number(data[hover][s.key])), color: s.color }))}
          />
        )}
      </div>
    </div>
  );
}

/** Stacked columns (≤24px, rounded data-end, 2px surface gap between segments). */
export function ColumnChart({
  data,
  xKey,
  series,
  height = 230,
  formatX,
  formatY = formatCompact,
  ariaLabel,
}: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const margin = { top: 12, right: 8, bottom: 24, left: 40 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const totals = data.map((row) => series.reduce((sum, s) => sum + Number(row[s.key]), 0));
  const maxY = niceMax(Math.max(1, ...totals));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.7);
  const y = (v: number) => margin.top + innerH - (v / maxY) * innerH;
  const tickEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 90))));
  const GAP = 2;

  return (
    <div className="chart" ref={ref}>
      {series.length > 1 && <Legend series={series} shape="rect" />}
      <div style={{ position: 'relative' }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)}>
            <YGrid ticks={ticks} y={y} left={margin.left} right={margin.left + innerW} format={formatY} />
            {data.map((row, i) => {
              const left = margin.left + i * band + (band - barW) / 2;
              let acc = 0;
              const drawn = series.filter((s) => Number(row[s.key]) > 0);
              return (
                <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
                  {drawn.map((s, j) => {
                    const value = Number(row[s.key]);
                    const bottom = y(acc) - (j === 0 ? 0 : GAP);
                    acc += value;
                    const top = y(acc);
                    const h = Math.max(0, bottom - top);
                    if (j < drawn.length - 1)
                      return <rect key={s.key} x={left} y={top} width={barW} height={h} fill={s.color} />;
                    const r = Math.min(4, h, barW / 2);
                    return (
                      <path
                        key={s.key}
                        fill={s.color}
                        d={`M${left},${bottom} L${left},${top + r} Q${left},${top} ${left + r},${top} L${left + barW - r},${top} Q${left + barW},${top} ${left + barW},${top + r} L${left + barW},${bottom} Z`}
                      />
                    );
                  })}
                  {((i % tickEvery === 0 && data.length - 1 - i >= tickEvery / 2) || i === data.length - 1) && (
                    <text className="tick" x={left + barW / 2} y={height - 6} textAnchor="middle">
                      {formatX(row[xKey])}
                    </text>
                  )}
                  <rect
                    x={margin.left + i * band}
                    y={margin.top}
                    width={band}
                    height={innerH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${formatX(row[xKey])}: ${series.map((s) => `${s.label} ${row[s.key]}`).join(', ')}`}
                    onPointerEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                  />
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && data[hover] && (
          <Tooltip
            left={margin.left + hover * band + band / 2}
            top={y(totals[hover])}
            width={width}
            title={`${formatX(data[hover][xKey])} · ${formatY(totals[hover])} total`}
            rows={[...series]
              .reverse()
              .map((s) => ({ label: s.label, value: formatY(Number(data[hover][s.key])), color: s.color }))}
          />
        )}
      </div>
    </div>
  );
}

/** Horizontal single-series bars with the value at the tip. */
export function BarList({
  rows,
  format = formatCompact,
  onSelect,
  empty = 'No data yet',
}: {
  rows: { key: string; label: ReactNode; value: number; title?: string }[];
  format?: (n: number) => string;
  onSelect?: (key: string) => void;
  empty?: string;
}) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="barlist">
      {rows.map((row) => (
        <div
          key={row.key}
          className="barlist-row"
          title={row.title ?? `${typeof row.label === 'string' ? row.label : row.key}: ${format(row.value)}`}
          onClick={onSelect ? () => onSelect(row.key) : undefined}
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          <div className="barlist-label">{row.label}</div>
          <div className="barlist-track">
            <div className="barlist-bar" style={{ width: `calc((100% - 56px) * ${row.value / max})` }} />
            <span className="barlist-value">{format(row.value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
