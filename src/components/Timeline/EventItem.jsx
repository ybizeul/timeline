import { tToX } from '../../utils/timeScale';
import { pointEventWidthPx } from '../../utils/eventLayout';

const BASE_HEIGHT      = 28;  // no-notes rect height: PAD+ASCENT+ASCENT+DESCENT+PAD = 8+8+8+3+8 = 35 → round to maintain compat
const PAD              = 8;   // uniform padding all four sides
const TEXT_ASCENT      = 8;   // approx cap height at 11px Inter
const TEXT_DESCENT     = 3;   // approx descender
const NOTES_LINE_H     = 14;  // px per notes line
const EVENT_MIN_WIDTH  = 8;
const CONNECTOR_MARGIN = 4;

/** Canonical height for an event rect. No notes: PAD+ASCENT+DESCENT+PAD. With notes: add n×NOTES_LINE_H. */
function calcEventHeight(numNoteLines) {
  return PAD + TEXT_ASCENT + TEXT_DESCENT + PAD + numNoteLines * NOTES_LINE_H;
}

/** Split description into lines (empty array when notes are off or blank). */
function notesLines(ev) {
  if (!ev.showNotes || !ev.description) return [];
  return ev.description.split('\n');
}

/** Total rendered height of an event rect. */
function eventHeight(ev) {
  return calcEventHeight(notesLines(ev).length);
}

// ── Registered display variants ──────────────────────────────────────────────
// To add a new variant: add an entry here and implement a component below.
export const EVENT_STYLES = [
  { id: 'solid',   label: 'Solid' },
  { id: 'outline', label: 'Outline' },
  { id: 'label',   label: 'Label only' },
];
export const DEFAULT_EVENT_STYLE = 'solid';

// ── Shared geometry ───────────────────────────────────────────────────────────
function getRectX(anchorX, width, align) {
  if (align === 'center') return anchorX - width / 2;
  if (align === 'right')  return anchorX - width;
  return anchorX;
}

export function useEventGeometry(layoutItem, viewStart, viewEnd, svgWidth, axisY) {
  const { ev, start, end, yOffset } = layoutItem;
  const align = ev.align ?? 'left';
  const evH = eventHeight(ev);

  const anchorX = tToX(start, viewStart, viewEnd, svgWidth);
  const isPoint = !ev.endDate;
  const rangeEndX = !isPoint ? tToX(end, viewStart, viewEnd, svgWidth) : anchorX;
  const width = isPoint
    ? pointEventWidthPx(ev.title)
    : Math.max(rangeEndX - anchorX, EVENT_MIN_WIDTH);
  // Alignment only shifts point events; range events always span exact dates
  const rectX = isPoint ? getRectX(anchorX, width, align) : anchorX;

  const yBottom = axisY - CONNECTOR_MARGIN;
  const yTop = yBottom - yOffset;

  return { anchorX, rectX, width, rangeEndX, yTop, yBottom, isPoint, evH };
}

// ── Shared connector (dot + dashed line) ─────────────────────────────────────
function Connector({ anchorX, yTop, yBottom, yConnectTop, color }) {
  return (
    <>
      <line
        x1={anchorX} y1={yConnectTop}
        x2={anchorX} y2={yBottom}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        opacity={0.5}
      />
      <circle cx={anchorX} cy={yBottom + CONNECTOR_MARGIN} r={2.5} fill={color} opacity={0.7} />
    </>
  );
}

// ── Variant: solid (filled rectangle + white text) ────────────────────────────
function EventItemSolid({ ev, geo }) {
  const { anchorX, rectX, width, yTop, yBottom, evH, isPoint } = geo;
  const align = ev.align ?? 'left';
  const isCentered = isPoint && align === 'center';
  const textAnchor = isCentered ? 'middle' : 'start';
  const lines = notesLines(ev);

  const titleY = yTop + PAD + TEXT_ASCENT;
  const notesY = titleY + NOTES_LINE_H;

  // Ranged events: rect spans exact time range, text may overflow (no clipping on right)
  // Point events: rect expands to contain text
  const CHAR_W = 6.5;
  const allLines = [ev.title, ...lines];
  const textMinW = Math.max(...allLines.map(l => (l?.length ?? 0) * CHAR_W + PAD * 2));
  const displayW = isPoint ? Math.max(width, textMinW) : width;
  const displayX = isPoint ? getRectX(anchorX, displayW, align) : rectX;
  const textX = isCentered ? displayX + displayW / 2 : displayX + PAD;

  return (
    <>
      <Connector anchorX={anchorX} yBottom={yBottom} yConnectTop={yTop + evH} color={ev.color} />
      <rect
        x={displayX} y={yTop}
        width={displayW} height={evH}
        rx={5}
        fill={ev.color}
        opacity={0.9}
        style={{ transition: 'opacity 0.1s' }}
      />
      <rect
        x={displayX + 1} y={yTop + 1}
        width={Math.max(displayW - 2, 0)} height={PAD + TEXT_ASCENT}
        rx={4}
        fill="rgba(255,255,255,0.08)"
        style={{ pointerEvents: 'none' }}
      />
      <text
        x={textX}
        y={titleY}
        textAnchor={textAnchor}
        fill="#fff"
        fontSize={11} fontWeight="500" fontFamily="inherit"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {ev.title}
      </text>
      {lines.length > 0 && (
        <text
          x={textX}
          y={notesY}
          textAnchor={textAnchor}
          fill="rgba(255,255,255,0.65)"
          fontSize={11} fontFamily="inherit"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {lines.map((line, i) => (
            <tspan key={i} x={textX} dy={i === 0 ? 0 : NOTES_LINE_H}>{line}</tspan>
          ))}
        </text>
      )}
    </>
  );
}

// ── Variant: outline (border-only frame + colored text) ─────────────────────
const OUTLINE_PAD    = PAD;  // reuse shared padding
const OUTLINE_CHAR_W = 6.5; // approx px per char at 11px

function EventItemOutline({ ev, geo }) {
  const { anchorX, rectX, width, yTop, yBottom, evH, isPoint } = geo;
  const align = ev.align ?? 'left';
  const lines = notesLines(ev);

  const frameH = calcEventHeight(lines.length);
  const titleBaselineY = yTop + PAD + TEXT_ASCENT;
  const notesBaselineY = titleBaselineY + NOTES_LINE_H;

  // Ranged events: frame spans exact time range; point events: expand to text
  const CHAR_W = 6.5;
  const allLines = [ev.title, ...lines];
  const textMinW = Math.max(...allLines.map(l => (l?.length ?? 0) * CHAR_W + OUTLINE_PAD * 2));
  const displayW = isPoint ? Math.max(width, textMinW) : width;
  const displayX = isPoint ? getRectX(anchorX, displayW, align) : rectX;
  const isCentered = isPoint && align === 'center';
  const textX = isCentered ? displayX + displayW / 2 : displayX + OUTLINE_PAD;
  const textAnchor = isCentered ? 'middle' : 'start';

  return (
    <>
      <Connector anchorX={anchorX} yBottom={yBottom} yConnectTop={yTop + evH} color={ev.color} />
      <rect
        x={displayX} y={yTop}
        width={displayW} height={frameH}
        rx={5}
        fill="rgba(0,0,0,0.0)"
        stroke={ev.color}
        strokeWidth={1.5}
        opacity={0.85}
        style={{ transition: 'opacity 0.1s' }}
      />
      <text
        x={textX}
        y={titleBaselineY}
        textAnchor={textAnchor}
        fill={ev.color}
        fontSize={11} fontWeight="600" fontFamily="inherit"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {ev.title}
      </text>
      {lines.length > 0 && (
        <text
          x={textX}
          y={notesBaselineY}
          textAnchor={textAnchor}
          fill={ev.color}
          fontSize={11} fontFamily="inherit"
          opacity={0.65}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {lines.map((line, i) => (
            <tspan key={i} x={textX} dy={i === 0 ? 0 : NOTES_LINE_H}>{line}</tspan>
          ))}
        </text>
      )}
    </>
  );
}

// ── Variant: label (text only + underline bar for ranged events) ──────────────
function EventItemLabel({ ev, geo }) {
  const { anchorX, rectX, width, rangeEndX, yTop, yBottom, evH, isPoint } = geo;
  const align = ev.align ?? 'left';
  const lines = notesLines(ev);
  const titleY = yTop + PAD + TEXT_ASCENT;
  const notesY = titleY + NOTES_LINE_H;
  const barY   = yTop + evH; // underline at bottom of event slot

  // Text position within the span
  let textX, textAnchor;
  if (!isPoint && align === 'center') {
    textX = anchorX + width / 2;
    textAnchor = 'middle';
  } else if (!isPoint && align === 'right') {
    textX = rangeEndX - PAD;
    textAnchor = 'end';
  } else if (align === 'right') {
    textX = anchorX - PAD;
    textAnchor = 'end';
  } else {
    textX = anchorX + PAD;
    textAnchor = 'start';
  }

  return (
    <>
      {isPoint ? (
        <Connector
          anchorX={anchorX} yBottom={yBottom}
          yConnectTop={align === 'center' ? yTop + evH : yTop}
          color={ev.color}
        />
      ) : (
        <>
          {/* Horizontal underline spanning the time range — no vertical drops */}
          <line
            x1={anchorX} y1={barY}
            x2={rangeEndX} y2={barY}
            stroke={ev.color} strokeWidth={2} opacity={0.7}
          />
          <circle cx={anchorX}   cy={yBottom + CONNECTOR_MARGIN} r={2.5} fill={ev.color} opacity={0.7} />
          <circle cx={rangeEndX} cy={yBottom + CONNECTOR_MARGIN} r={2.5} fill={ev.color} opacity={0.5} />
        </>
      )}
      {/* Invisible hit-area */}
      <rect x={rectX} y={yTop} width={width} height={evH} fill="transparent" rx={4} />
      <text
        x={textX} y={titleY}
        textAnchor={textAnchor}
        fill={ev.color}
        fontSize={11} fontWeight="600" fontFamily="inherit"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {ev.title}
      </text>
      {lines.length > 0 && (
        <text
          x={textX} y={notesY}
          textAnchor={textAnchor}
          fill={ev.color}
          fontSize={11} fontFamily="inherit"
          opacity={0.65}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {lines.map((line, i) => (
            <tspan key={i} x={textX} dy={i === 0 ? 0 : NOTES_LINE_H}>{line}</tspan>
          ))}
        </text>
      )}
    </>
  );
}

// ── Variant registry ──────────────────────────────────────────────────────────
const VARIANT_COMPONENTS = {
  solid:   EventItemSolid,
  outline: EventItemOutline,
  label:   EventItemLabel,
};

// ── Public component ──────────────────────────────────────────────────────────
export function EventItem({ layoutItem, viewStart, viewEnd, svgWidth, axisY, onClick, wasDragging }) {
  const { ev } = layoutItem;
  const geo = useEventGeometry(layoutItem, viewStart, viewEnd, svgWidth, axisY);
  const { rectX, width } = geo;

  if (rectX > svgWidth + 50 || rectX + width < -50) return null;

  const Variant = VARIANT_COMPONENTS[ev.style ?? DEFAULT_EVENT_STYLE] ?? EventItemSolid;

  return (
    <g
      className="event-item"
      onClick={() => { if (!wasDragging.current) onClick(ev); }}
      style={{ cursor: 'pointer' }}
    >
      <Variant ev={ev} geo={geo} />
    </g>
  );
}
