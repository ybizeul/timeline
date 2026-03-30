import { tToX } from '../../utils/timeScale';
import { eventDisplayWidthPx, PAD_H, PAD_V, FONT_SIZE, NOTES_GAP, NOTES_LINE_H } from '../../utils/eventLayout';

const EVENT_MIN_WIDTH  = 8;
const CONNECTOR_MARGIN = 4;
const CALLOUT_HW       = 5;   // callout triangle base half-width
const CALLOUT_H        = 4;   // callout triangle height (tip down)
const CALLOUT_INSET    = 10;  // distance from rect edge to callout center

/** Canonical height for an event rect. */
function calcEventHeight(numNoteLines) {
  if (numNoteLines === 0) return PAD_V + FONT_SIZE + PAD_V;
  return PAD_V + FONT_SIZE + NOTES_GAP + (numNoteLines - 1) * NOTES_LINE_H + FONT_SIZE + PAD_V;
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

function getCalloutCx(rectX, width, align) {
  if (align === 'center') return rectX + width / 2;
  if (align === 'right')  return rectX + width - CALLOUT_INSET;
  return rectX + CALLOUT_INSET;
}

/** Compute textX and textAnchor for a rect based on alignment. */
function alignedText(rectX, rectW, align) {
  if (align === 'center') return { textX: rectX + rectW / 2, textAnchor: 'middle' };
  if (align === 'right')  return { textX: rectX + rectW - PAD_H, textAnchor: 'end' };
  return { textX: rectX + PAD_H, textAnchor: 'start' };
}

/** SVG path for a rounded rect. If calloutCx is provided, adds a triangular notch in the bottom edge. */
function eventShapePath(x, y, w, h, r, calloutCx) {
  const R = Math.min(r, w / 2, h / 2);
  // Bottom edge y
  const by = y + h;
  if (calloutCx == null) {
    // Plain rounded rect
    return `M${x + R},${y}`
      + `H${x + w - R}A${R},${R},0,0,1,${x + w},${y + R}`
      + `V${by - R}A${R},${R},0,0,1,${x + w - R},${by}`
      + `H${x + R}A${R},${R},0,0,1,${x},${by - R}`
      + `V${y + R}A${R},${R},0,0,1,${x + R},${y}Z`;
  }
  // Rounded rect with callout notch in bottom edge
  const cl = calloutCx - CALLOUT_HW;
  const cr = calloutCx + CALLOUT_HW;
  const ct = by + CALLOUT_H;
  return `M${x + R},${y}`
    + `H${x + w - R}A${R},${R},0,0,1,${x + w},${y + R}`
    + `V${by - R}A${R},${R},0,0,1,${x + w - R},${by}`
    + `H${cr}L${calloutCx},${ct}L${cl},${by}`
    + `H${x + R}A${R},${R},0,0,1,${x},${by - R}`
    + `V${y + R}A${R},${R},0,0,1,${x + R},${y}Z`;
}

export function useEventGeometry(layoutItem, viewStart, viewEnd, svgWidth, axisY) {
  const { ev, start, end, yOffset } = layoutItem;
  const align = ev.align ?? 'left';
  const evH = eventHeight(ev);

  const anchorX = tToX(start, viewStart, viewEnd, svgWidth);
  const isPoint = !ev.endDate;
  const rangeEndX = !isPoint ? tToX(end, viewStart, viewEnd, svgWidth) : anchorX;
  const textW = eventDisplayWidthPx(ev);
  const width = isPoint
    ? textW
    : Math.max(rangeEndX - anchorX, EVENT_MIN_WIDTH, textW);
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
  const lines = notesLines(ev);

  const titleY = yTop + PAD_V + FONT_SIZE / 2;
  const notesY = titleY + NOTES_GAP + NOTES_LINE_H / 2;

  const displayW = width;
  const displayX = rectX;
  const { textX, textAnchor } = alignedText(displayX, displayW, align);
  const calloutCx = isPoint ? getCalloutCx(displayX, displayW, align) : null;

  return (
    <>
      {isPoint && <Connector anchorX={calloutCx} yBottom={yBottom} yConnectTop={yTop + evH + CALLOUT_H} color={ev.color} />}
      <path
        d={eventShapePath(displayX, yTop, displayW, evH, 5, calloutCx)}
        fill={ev.color}
        opacity={0.9}
        style={{ transition: 'opacity 0.1s' }}
      />
      <rect
        x={displayX + 1} y={yTop + 1}
        width={Math.max(displayW - 2, 0)} height={PAD_V + FONT_SIZE / 2}
        rx={4}
        fill="rgba(255,255,255,0.08)"
        style={{ pointerEvents: 'none' }}
      />
      <text
        x={textX}
        y={titleY}
        dominantBaseline="central"
        textAnchor={textAnchor}
        fill="#fff"
        fontSize={FONT_SIZE} fontWeight="500" fontFamily="inherit"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {ev.title}
      </text>
      {lines.length > 0 && (
        <text
          x={textX}
          y={notesY}
          dominantBaseline="central"
          textAnchor={textAnchor}
          fill="rgba(255,255,255,0.65)"
          fontSize={FONT_SIZE} fontFamily="inherit"
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

function EventItemOutline({ ev, geo }) {
  const { anchorX, rectX, width, yTop, yBottom, evH, isPoint } = geo;
  const align = ev.align ?? 'left';
  const lines = notesLines(ev);

  const titleBaselineY = yTop + PAD_V + FONT_SIZE / 2;
  const notesBaselineY = titleBaselineY + NOTES_GAP + NOTES_LINE_H / 2;

  const displayW = width;
  const displayX = rectX;
  const { textX, textAnchor } = alignedText(displayX, displayW, align);
  const calloutCx = isPoint ? getCalloutCx(displayX, displayW, align) : null;

  return (
    <>
      {isPoint && <Connector anchorX={calloutCx} yBottom={yBottom} yConnectTop={yTop + evH + CALLOUT_H} color={ev.color} />}
      <path
        d={eventShapePath(displayX, yTop, displayW, evH, 5, calloutCx)}
        fill="rgba(0,0,0,0.0)"
        stroke={ev.color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        opacity={0.85}
        style={{ transition: 'opacity 0.1s' }}
      />
      <text
        x={textX}
        y={titleBaselineY}
        dominantBaseline="central"
        textAnchor={textAnchor}
        fill={ev.color}
        fontSize={FONT_SIZE} fontWeight="600" fontFamily="inherit"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {ev.title}
      </text>
      {lines.length > 0 && (
        <text
          x={textX}
          y={notesBaselineY}
          dominantBaseline="central"
          textAnchor={textAnchor}
          fill={ev.color}
          fontSize={FONT_SIZE} fontFamily="inherit"
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
  const titleY = yTop + PAD_V + FONT_SIZE / 2;
  const notesY = titleY + NOTES_GAP + NOTES_LINE_H / 2;
  const barY   = yTop + evH; // underline at bottom of event slot

  // Text position within the span
  let textX, textAnchor;
  if (isPoint) {
    ({ textX, textAnchor } = alignedText(rectX, width, align));
  } else if (align === 'center') {
    textX = anchorX + (rangeEndX - anchorX) / 2;
    textAnchor = 'middle';
  } else if (align === 'right') {
    textX = rangeEndX - PAD_H;
    textAnchor = 'end';
  } else {
    textX = anchorX + PAD_H;
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
          {/* Horizontal underline spanning the time range */}
          <line
            x1={anchorX} y1={barY}
            x2={rangeEndX} y2={barY}
            stroke={ev.color} strokeWidth={2} opacity={0.7}
          />
        </>
      )}
      {/* Invisible hit-area */}
      <rect x={rectX} y={yTop} width={width} height={evH} fill="transparent" rx={4} />
      <text
        x={textX} y={titleY}
        textAnchor={textAnchor}
        dominantBaseline="central"
        fill={ev.color}
        fontSize={FONT_SIZE} fontWeight="600" fontFamily="inherit"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {ev.title}
      </text>
      {lines.length > 0 && (
        <text
          x={textX} y={notesY}
          textAnchor={textAnchor}
          dominantBaseline="central"
          fill={ev.color}
          fontSize={FONT_SIZE} fontFamily="inherit"
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
