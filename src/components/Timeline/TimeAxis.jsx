import { useMemo } from 'react';
import { getScaleTicks, getWeekendRanges, tToX, tickRank } from '../../utils/timeScale';

export const LABEL_STRIP_H = 52; // height of the label zone below the axis

const MAJOR_TICK_H = 10;
const MINOR_TICK_H = 5;

// Minimum pixel gap between consecutive visible labels
const MAJOR_MIN_PX = 90;
const MINOR_MIN_PX = 52;

// Minimum pixel gap between tick lines (to avoid a wall of lines)
const TICK_MIN_PX = 18;

// Approximate character width for overlap culling
const MAJOR_CH_PX = 7;  // 11px font
const MINOR_CH_PX = 6;  // 10px font

/** Stride-based culling: show every Nth tick, anchored by absolute rank so labels stay fixed on scroll. */
function cull(ticks, toX, minPx, chPx, intervalId) {
  if (ticks.length === 0) return [];
  if (ticks.length === 1) {
    return [{ ...ticks[0], x: toX(ticks[0].t), showLabel: true, showTick: true }];
  }

  // Average pixel spacing between consecutive ticks
  const firstX = toX(ticks[0].t);
  const lastX = toX(ticks[ticks.length - 1].t);
  const avgSpacingPx = Math.abs(lastX - firstX) / (ticks.length - 1);

  if (avgSpacingPx < 1) {
    return ticks.map(tick => ({ ...tick, x: toX(tick.t), showLabel: false, showTick: false }));
  }

  // Compute stride from the widest label + required gap
  const maxLabelLen = Math.max(...ticks.map(t => t.label.length));
  const labelW = maxLabelLen * chPx + 10;
  const labelStride = Math.max(1, Math.ceil((labelW + minPx) / avgSpacingPx));
  const tickStride  = Math.max(1, Math.ceil(TICK_MIN_PX / avgSpacingPx));

  return ticks.map(tick => {
    const x = toX(tick.t);
    const rank = tickRank(tick.t, intervalId);
    return {
      ...tick,
      x,
      showLabel: rank % labelStride === 0,
      showTick:  rank % tickStride === 0,
    };
  });
}

export function TimeAxis({ viewStart, viewEnd, svgWidth, axisY, showWeekends }) {
  const minorRowY = axisY + MINOR_TICK_H + 12;
  const majorRowY = axisY + MAJOR_TICK_H + 32;

  const { majorTicks, minorTicks, level, minorLevel } = useMemo(
    () => getScaleTicks(viewStart, viewEnd, svgWidth),
    [viewStart, viewEnd, svgWidth]
  );

  const toX = (t) => tToX(t, viewStart, viewEnd, svgWidth);

  const weekendRanges = useMemo(
    () => showWeekends ? getWeekendRanges(viewStart, viewEnd, level) : [],
    [viewStart, viewEnd, level, showWeekends]
  );

  const majors = useMemo(
    () => cull(majorTicks, toX, MAJOR_MIN_PX, MAJOR_CH_PX, level),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [majorTicks, svgWidth, level]
  );
  const minors = useMemo(
    () => cull(minorTicks, toX, MINOR_MIN_PX, MINOR_CH_PX, minorLevel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minorTicks, svgWidth, minorLevel]
  );

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
      {majors.map(({ t, x, showTick }) => (
        showTick && x >= 0 && x <= svgWidth && (
          <line
            key={`sep-${t}`}
            x1={x} y1={0} x2={x} y2={axisY}
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

      {/* ── Major ticks + labels ──────────────────────────────────── */}
      {majors.map(({ t, x, label, showLabel, showTick }) => {
        if (x < -1 || x > svgWidth + 1) return null;
        if (!showTick && !showLabel) return null;
        const pillW = label.length * MAJOR_CH_PX + 14;
        return (
          <g key={t}>
            {showTick && (
              <line
                x1={x} y1={axisY}
                x2={x} y2={axisY + MAJOR_TICK_H}
                stroke="var(--tick)"
                strokeWidth={1.5}
              />
            )}
            {showLabel && (
              <>
                <rect
                  x={x + 4}
                  y={majorRowY - 12}
                  width={pillW}
                  height={16}
                  rx={4}
                  fill="var(--surface-el)"
                />
                <text
                  x={x + 11}
                  y={majorRowY}
                  fill="var(--text)"
                  fontSize={11}
                  fontWeight="600"
                  fontFamily="inherit"
                >
                  {label}
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}
