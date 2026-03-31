import { useMemo } from 'react';
import { getScaleTicks, getWeekendRanges, tToX, cullTicks } from '../../utils/timeScale';

export const LABEL_STRIP_H = 52; // height of the label zone below the axis

const MAJOR_TICK_H = 10;
const MINOR_TICK_H = 5;

// Minimum pixel gap between consecutive visible labels
const MINOR_MIN_PX = 52;
const MINOR_CH_PX = 6;  // 10px font

export function TimeAxis({ viewStart, viewEnd, svgWidth, axisY, showWeekends }) {
  const minorRowY = axisY + MINOR_TICK_H + 12;
  const majorRowY = axisY + MAJOR_TICK_H + 32;

  const { majorTicks, minorTicks, subMinorTicks, level, minorLevel } = useMemo(
    () => getScaleTicks(viewStart, viewEnd, svgWidth),
    [viewStart, viewEnd, svgWidth]
  );

  const toX = (t) => tToX(t, viewStart, viewEnd, svgWidth);

  const weekendRanges = useMemo(
    () => showWeekends ? getWeekendRanges(viewStart, viewEnd, level) : [],
    [viewStart, viewEnd, level, showWeekends]
  );

  const minors = useMemo(
    () => cullTicks(minorTicks, toX, MINOR_MIN_PX, MINOR_CH_PX, minorLevel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minorTicks, svgWidth, minorLevel]
  );

  const majorSpans = useMemo(() => {
    const MIN_SPAN_PX = 150;
    // Position all ticks, then filter to ensure minimum spacing
    const all = majorTicks.map(tick => ({ ...tick, x: tToX(tick.t, viewStart, viewEnd, svgWidth) }));
    const filtered = [];
    const skippedCounts = [];  // how many ticks were skipped before each filtered tick
    let skipped = 0;
    for (const tick of all) {
      if (filtered.length === 0 || tick.x - filtered[filtered.length - 1].x >= MIN_SPAN_PX) {
        filtered.push(tick);
        skippedCounts.push(skipped);
        skipped = 0;
      } else {
        skipped++;
      }
    }
    return filtered.map((tick, i) => {
      const x1 = tick.x;
      const x2 = i < filtered.length - 1 ? filtered[i + 1].x : svgWidth + 50;
      // pure = no intermediate ticks were dropped, label accurately describes the span
      const pure = i < filtered.length - 1 ? skippedCounts[i + 1] === 0 : true;
      return { x1, x2, label: tick.label, pure };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [majorTicks, viewStart, viewEnd, svgWidth]);

  return (
    <g className="time-axis">
      {/* Label strip background below the axis */}
      <rect
        x={0} y={axisY}
        width={svgWidth} height={LABEL_STRIP_H}
        fill="var(--surface)"
      />

      {/* Weekend background highlights */}
      {weekendRanges.map(({ start, end }) => {
        const x1 = toX(start);
        const x2 = toX(end);
        return (
          <rect
            key={`we-${start}`}
            x={x1} y={0}
            width={x2 - x1} height={axisY}
            fill="var(--weekend-bg)"
          />
        );
      })}

      {/* Separator lines at major ticks — extend upward into the event space */}
      {majorSpans.map(({ x1 }, i) => (
        x1 >= 0 && x1 <= svgWidth && (
          <line
            key={`sep-${i}`}
            x1={x1} y1={0} x2={x1} y2={axisY}
            stroke="var(--border)"
            strokeWidth={1}
            opacity={0.45}
          />
        )
      ))}

      {/* Main axis line */}
      <line
        x1={0} y1={axisY} x2={svgWidth} y2={axisY}
        stroke="var(--axis)"
        strokeWidth={1.5}
      />

      {/* ── Sub-minor ticks (unlabeled hourly marks) ─────────────── */}
      {subMinorTicks.length > 0 && (() => {
        const minGap = 4;
        const pxPerHour = (svgWidth / (viewEnd - viewStart)) * 3_600_000;
        if (pxPerHour < minGap) return null;
        return subMinorTicks.map(({ t }) => {
          const x = toX(t);
          if (x < -1 || x > svgWidth + 1) return null;
          return (
            <line
              key={`sub-${t}`}
              x1={x} y1={axisY}
              x2={x} y2={axisY + 3}
              stroke="var(--tick)"
              strokeWidth={1}
            />
          );
        });
      })()}

      {/* ── Minor ticks + labels ──────────────────────────────────── */}
      {minors.map(({ t, x, label, showLabel, showTick }) => {
        if (x < -1 || x > svgWidth + 1) return null;
        if (!showTick && !showLabel) return null;
        return (
          <g key={t}>
            {showTick && (
              <line
                x1={x} y1={axisY}
                x2={x} y2={axisY + MINOR_TICK_H}
                stroke="var(--tick)"
                strokeWidth={1}
              />
            )}
            {showLabel && (
              <text
                x={x + 4}
                y={minorRowY}
                fill="var(--text-muted)"
                fontSize={10}
                fontFamily="inherit"
              >
                {label}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Major ticks + bracket labels ─────────────────────────── */}
      {majorSpans.map(({ x1, x2, label, pure }, i) => {
        const bracketY = axisY + 28;
        const curveH = 7;
        const curveR = Math.min(7, (x2 - x1) / 4);
        const visibleX1 = Math.max(0, x1);
        const visibleX2 = Math.min(svgWidth, x2);
        const midX = (visibleX1 + visibleX2) / 2;
        if (visibleX2 - visibleX1 < 20) return null;
        return (
          <g key={`maj-${i}`}>
            {pure && (
              <path
                d={`M ${x1},${bracketY - curveH} Q ${x1},${bracketY} ${x1 + curveR},${bracketY} L ${x2 - curveR},${bracketY} Q ${x2},${bracketY} ${x2},${bracketY - curveH}`}
                fill="none"
                stroke="var(--border)"
                strokeWidth={1}
              />
            )}
            <text
              x={midX}
              y={majorRowY}
              textAnchor="middle"
              fill="var(--text)"
              fontSize={11}
              fontWeight="600"
              fontFamily="inherit"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
