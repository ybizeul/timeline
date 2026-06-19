import { tToX } from '../../utils/timeScale';
import { eventDisplayWidthPx, PAD_H, PAD_V, FONT_SIZE, NOTES_GAP, NOTES_LINE_H } from '../../utils/eventLayout';
import { calcEventHeight, notesLines, getRectX, alignedText, eventShapePath, CALLOUT_EDGE_PAD } from '../../utils/eventGeometry';

const EVENT_MIN_WIDTH  = 8;
const CONNECTOR_MARGIN = 4;
const CALLOUT_H        = 6;   // callout triangle height (tip down)

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

export function useEventGeometry(layoutItem, viewStart, viewEnd, svgWidth, axisY) {
  const { ev, start, end, yOffset } = layoutItem;
  const align = ev.align ?? 'left';
  const style = ev.style ?? 'solid';
  const evH = eventHeight(ev);

  const anchorX = tToX(start, viewStart, viewEnd, svgWidth);
  const isPoint = !ev.endDate;
  const rangeEndX = !isPoint ? tToX(end, viewStart, viewEnd, svgWidth) : anchorX;
  const textW = eventDisplayWidthPx(ev);
  
  // For label style, use exact time span; for solid/outline, include text width
  const width = isPoint
    ? textW
    : (style === 'label'
        ? rangeEndX - anchorX  // Use exact time span for label
        : Math.max(rangeEndX - anchorX, EVENT_MIN_WIDTH, textW));
  
  // Alignment only shifts point events; range events always span exact dates
  const rectX = isPoint ? getRectX(anchorX, width, align) : anchorX;

  const yBottom = axisY - CONNECTOR_MARGIN;
  const yTop = yBottom - yOffset;

  return { anchorX, rectX, width, rangeEndX, yTop, yBottom, isPoint, evH };
}

// ── Shared connector (dot + dashed line) ─────────────────────────────────────
function Connector({ anchorX, yBottom, yConnectTop, color }) {
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

// ── Range brackets  |‹ … ›|  ─────────────────────────────────────────────────
const BRACKET_W  = 3;    // chevron inward depth
const BRACKET_HH = 4;    // chevron half-height
const BRACKET_SW = 1.2;
const BRACKET_INSET = 3;  // inset from rect edge for solid/outline

function RangeBrackets({ x1, x2, yTop, height, color, inset = 0, opacity = 0.55 }) {
  const yMid = yTop + height / 2;
  const lx = x1 + inset;
  const rx = x2 - inset;
  return (
    <g style={{ pointerEvents: 'none' }} opacity={opacity}>
      {/* Left ‹| */}
      <polyline points={`${lx + BRACKET_W},${yMid - BRACKET_HH} ${lx},${yMid} ${lx + BRACKET_W},${yMid + BRACKET_HH}`}
        fill="none" stroke={color} strokeWidth={BRACKET_SW} strokeLinecap="round" strokeLinejoin="round" />
      {/* Right |› */}
      <polyline points={`${rx - BRACKET_W},${yMid - BRACKET_HH} ${rx},${yMid} ${rx - BRACKET_W},${yMid + BRACKET_HH}`}
        fill="none" stroke={color} strokeWidth={BRACKET_SW} strokeLinecap="round" strokeLinejoin="round" />
    </g>
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
  const calloutCx = isPoint ? anchorX : null;

  return (
    <>
      {isPoint && <Connector anchorX={anchorX} yBottom={yBottom} yConnectTop={yTop + evH + CALLOUT_H} color={ev.color} />}
      <path
        d={eventShapePath(displayX, yTop, displayW, evH, 5, calloutCx)}
        fill={ev.color}
        opacity={0.9}
        style={{ transition: 'opacity 0.1s' }}
      />
      {!isPoint && <RangeBrackets x1={displayX} x2={displayX + displayW} yTop={yTop} height={evH} color="#fff" inset={BRACKET_INSET} opacity={0.4} />}
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
  const calloutCx = isPoint ? anchorX : null;

  return (
    <>
      {isPoint && <Connector anchorX={anchorX} yBottom={yBottom} yConnectTop={yTop + evH + CALLOUT_H} color={ev.color} />}
      <path
        d={eventShapePath(displayX, yTop, displayW, evH, 5, calloutCx)}
        fill="rgba(0,0,0,0.0)"
        stroke={ev.color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        opacity={0.85}
        style={{ transition: 'opacity 0.1s' }}
      />
      {!isPoint && <RangeBrackets x1={displayX} x2={displayX + displayW} yTop={yTop} height={evH} color={ev.color} inset={BRACKET_INSET} opacity={0.45} />}
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
const LABEL_LINE_GAP = 4; // vertical gap between text block and dashed connector
const LABEL_H_GAP   = 6; // horizontal gap between anchor line and text block
const LABEL_BAR_GAP = 5; // vertical gap between text bottom and underline bar (range events)

function EventItemLabel({ ev, geo }) {
  const { anchorX, rectX, width, rangeEndX, yTop, yBottom, evH, isPoint } = geo;
  const align = ev.align ?? 'left';
  const lines = notesLines(ev);
  const textBlockTop = yTop - LABEL_LINE_GAP;
  const titleY = textBlockTop + PAD_V + FONT_SIZE / 2;
  const notesY = titleY + NOTES_GAP + NOTES_LINE_H / 2;
  const textBottom = lines.length > 0
    ? notesY + (lines.length - 1) * NOTES_LINE_H + FONT_SIZE / 2
    : titleY + FONT_SIZE / 2;
  const barY   = isPoint ? yTop + evH : textBottom + LABEL_BAR_GAP;

  // Solid line covers the text area, dashed line extends below to the axis
  const solidBottom = textBlockTop + evH;

  // Text position and connector layout depend on alignment
  let textX, textAnchor, hitX;
  if (isPoint) {
    if (align === 'center') {
      // Text centered on the anchor line — no solid line, no horizontal gap
      textX = anchorX;
      textAnchor = 'middle';
      hitX = rectX;
    } else if (align === 'right') {
      // Text block sits to the left of the anchor line
      textX = anchorX - LABEL_H_GAP;
      textAnchor = 'end';
      hitX = anchorX - LABEL_H_GAP - width;
    } else {
      // Left: text block to the right of the anchor line
      const offsetX = rectX + LABEL_H_GAP;
      ({ textX, textAnchor } = alignedText(offsetX, width, align));
      hitX = rectX + LABEL_H_GAP;
    }
  } else if (align === 'center') {
    textX = anchorX + (rangeEndX - anchorX) / 2;
    textAnchor = 'middle';
    hitX = rectX;
  } else if (align === 'right') {
    textX = rangeEndX - PAD_H;
    textAnchor = 'end';
    hitX = rectX;
  } else {
    textX = anchorX + PAD_H;
    textAnchor = 'start';
    hitX = rectX;
  }

  return (
    <>
      {isPoint ? (
        align === 'center' ? (
          <>
            {/* Center: dashed line only, below the text block */}
            <line
              x1={anchorX} y1={solidBottom}
              x2={anchorX} y2={yBottom}
              stroke={ev.color}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              opacity={0.5}
            />
            <circle cx={anchorX} cy={yBottom + CONNECTOR_MARGIN} r={2.5} fill={ev.color} opacity={0.7} />
          </>
        ) : (
          <>
            {/* Left / Right: solid line alongside text, dashed below */}
            <line
              x1={anchorX} y1={textBlockTop}
              x2={anchorX} y2={solidBottom}
              stroke={ev.color}
              strokeWidth={1.5}
              opacity={0.5}
            />
            <line
              x1={anchorX} y1={solidBottom}
              x2={anchorX} y2={yBottom}
              stroke={ev.color}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              opacity={0.5}
            />
            <circle cx={anchorX} cy={yBottom + CONNECTOR_MARGIN} r={2.5} fill={ev.color} opacity={0.7} />
          </>
        )
      ) : (
        <>
          {/* Horizontal underline spanning the time range with 1px gap */}
          <line
            x1={anchorX + 1} y1={barY}
            x2={rangeEndX - 1} y2={barY}
            stroke={ev.color} strokeWidth={2} opacity={0.7}
          />
          <RangeBrackets x1={anchorX} x2={rangeEndX} yTop={yTop} height={barY - yTop} color={ev.color} inset={1} opacity={0.45} />
        </>
      )}
      {/* Invisible hit-area */}
      <rect x={hitX} y={textBlockTop} width={width} height={evH} fill="transparent" rx={4} />
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

// ── Tooltip Component ─────────────────────────────────────────────────────────
export function EventTooltip({ ev, clientX, clientY }) {
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    
    // Check if time is meaningful (not midnight)
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
    
    const dateFormatted = date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    
    if (hasTime) {
      const timeFormatted = date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      });
      return `${dateFormatted} at ${timeFormatted}`;
    }
    
    return dateFormatted;
  };

  // Build tooltip content
  const lines = [];
  
  // Title
  lines.push({ text: ev.title, bold: true });
  
  // Date(s) and Time
  if (ev.endDate) {
    lines.push({ text: `${formatDateTime(ev.startDate)} - ${formatDateTime(ev.endDate)}`, bold: false });
  } else {
    lines.push({ text: formatDateTime(ev.startDate), bold: false });
  }
  
  // Description/notes if available
  if (ev.description && ev.description.trim()) {
    lines.push({ text: '', bold: false }); // Empty line for spacing
    const noteLines = ev.description.split('\n').slice(0, 5); // Max 5 lines
    noteLines.forEach(line => {
      if (line.trim()) {
        lines.push({ text: line.length > 50 ? line.substring(0, 47) + '...' : line, bold: false });
      }
    });
  }
  
  // Person/Group if available
  if (ev.personId || ev.groupId) {
    const label = ev.personId ? 'Person' : 'Group';
    lines.push({ text: `${label}: ${ev.personId || ev.groupId}`, bold: false, small: true });
  }

  // Position tooltip near cursor with bounds checking
  const offsetX = 15;
  const offsetY = 15;
  const tooltipWidth = 300;
  const estimatedHeight = lines.length * 20 + 24; // Rough estimate
  
  // Calculate position using fixed positioning (relative to viewport)
  let left = clientX + offsetX;
  let top = clientY + offsetY;
  
  // Get viewport dimensions for bounds checking
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Adjust if tooltip would go off right edge
  if (left + tooltipWidth > viewportWidth - 20) {
    left = clientX - tooltipWidth - offsetX;
  }
  
  // Adjust if tooltip would go off bottom
  if (top + estimatedHeight > viewportHeight - 20) {
    top = clientY - estimatedHeight - offsetY;
  }
  
  // Make sure it doesn't go off left or top
  left = Math.max(10, left);
  top = Math.max(10, top);

  return (
    <div
      className="event-tooltip"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '6px',
        padding: '12px',
        maxWidth: `${tooltipWidth}px`,
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.4)',
        pointerEvents: 'none',
        zIndex: 10000,
        fontFamily: 'inherit',
      }}
    >
      {lines.map((line, i) => (
        line.text ? (
          <div
            key={i}
            style={{
              color: 'rgba(255, 255, 255, 0.95)',
              fontSize: line.small ? '11px' : '13px',
              fontWeight: line.bold ? '600' : '400',
              lineHeight: '18px',
            }}
          >
            {line.text}
          </div>
        ) : (
          <div key={i} style={{ height: '6px' }} />
        )
      ))}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export function EventItem({ layoutItem, viewStart, viewEnd, svgWidth, axisY, onClick, wasDragging, onMouseEnter, onMouseLeave }) {
  const { ev } = layoutItem;
  const geo = useEventGeometry(layoutItem, viewStart, viewEnd, svgWidth, axisY);
  const { rectX, width } = geo;

  const handleMouseEnter = (e) => {
    // Pass client coordinates to parent
    onMouseEnter(ev, e.clientX, e.clientY);
  };

  const handleMouseLeave = () => {
    onMouseLeave();
  };

  if (rectX > svgWidth + 50 || rectX + width < -50) return null;

  const Variant = VARIANT_COMPONENTS[ev.style ?? DEFAULT_EVENT_STYLE] ?? EventItemSolid;

  return (
    <g
      className="event-item"
      onClick={() => { if (!wasDragging.current) onClick(ev); }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      <Variant ev={ev} geo={geo} />
    </g>
  );
}
