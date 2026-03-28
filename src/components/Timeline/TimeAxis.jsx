import { useMemo } from 'react';
import { getScaleTicks, tToX } from '../../utils/timeScale';

export const LABEL_STRIP_H = 36; // height of the label zone below the axis

const MAJOR_TICK_H = 10;
const MINOR_TICK_H = 5;

// Minimum pixel gap between consecutive visible labels
const MAJOR_MIN_PX = 90;
const MINOR_MIN_PX = 52;

// Approximate character width for overlap culling
const MAJOR_CH_PX = 7;  // 11px font
const MINOR_CH_PX = 6;  // 10px font

/** Keep only ticks whose labels won't overlap each other. */
function cull(ticks, toX, minPx, chPx) {
  let lastEndX = -Infinity;
  return ticks.map(tick => {
    const x = toX(tick.t);
    const labelW = tick.label.length * chPx + 10;
    const show = x - lastEndX >= minPx;
    if (show) lastEndX = x + labelW;
    return { ...tick, x, showLabel: show };
  });
}

export function TimeAxis({ viewStart, viewEnd, svgWidth, axisY }) {
  const minorRowY = axisY + MINOR_TICK_H + 11;
  const majorRowY = axisY + MAJOR_TICK_H + 16;

  const { majorTicks, minorTicks } = useMemo(
    () => getScaleTicks(viewStart, viewEnd, svgWidth),
    [viewStart, viewEnd, svgWidth]
  );

  const toX = (t) => tToX(t, viewStart, viewEnd, svgWidth);

  const majors = useMemo(
    () => cull(majorTicks, toX, MAJOR_MIN_PX, MAJOR_CH_PX),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [majorTicks, svgWidth]
  );
  const minors = useMemo(
    () => cull(minorTicks, toX, MINOR_MIN_PX, MINOR_CH_PX),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minorTicks, svgWidth]
  );

  return (
    <g className="time-axis">
      {/* Label strip background below the axis */}
      <rect
        x={0} y={axisY}
        width={svgWidth} height={LABEL_STRIP_H}
        fill="var(--surface)"
      />

      {/* Separator lines at major ticks — extend upward into the event space */}
      {majors.map(({ t, x }) => (
        x >= 0 && x <= svgWidth && (
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
      {minors.map(({ t, x, label, showLabel }) => {
        if (x < -1 || x > svgWidth + 1) return null;
        return (
          <g key={t}>
            <line
              x1={x} y1={axisY}
              x2={x} y2={axisY + MINOR_TICK_H}
              stroke="var(--tick)"
              strokeWidth={1}
            />
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
      {majors.map(({ t, x, label, showLabel }) => {
        if (x < -1 || x > svgWidth + 1) return null;
        const pillW = label.length * MAJOR_CH_PX + 14;
        return (
          <g key={t}>
            <line
              x1={x} y1={axisY}
              x2={x} y2={axisY + MAJOR_TICK_H}
              stroke="var(--tick)"
              strokeWidth={1.5}
            />
            {showLabel && (
              <>
                <rect
                  x={x + 4}
                  y={axisY + MAJOR_TICK_H + 2}
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
