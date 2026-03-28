import { tToX } from '../../utils/timeScale';

const NOW = Date.now();

export function TodayLine({ viewStart, viewEnd, svgWidth, svgHeight, axisY }) {
  const x = tToX(NOW, viewStart, viewEnd, svgWidth);
  if (x < 0 || x > svgWidth) return null;

  return (
    <g className="today-line">
      <line
        x1={x} y1={0}
        x2={x} y2={svgHeight}
        stroke="var(--today)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        opacity={0.7}
      />
      <circle cx={x} cy={axisY - 20} r={4} fill="var(--today)" />
      <text
        x={x + 6}
        y={14}
        fill="var(--today)"
        fontSize={10}
        fontWeight="600"
        fontFamily="inherit"
        opacity={0.9}
      >
        Today
      </text>
    </g>
  );
}
