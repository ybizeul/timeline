import { tToX } from '../../utils/timeScale';
import { eventDisplayWidthPx, PAD_H, PAD_V, FONT_SIZE, NOTES_GAP, NOTES_LINE_H } from '../../utils/eventLayout';
import { calcEventHeight, notesLines, getRectX, alignedText, eventShapePath } from '../../utils/eventGeometry';

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
  { id: 'line',    label: 'Line' },
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

// ── Variant: line (vertical line spanning timeline height) ──────────────────
const LINE_TITLE_Y = 20;  // Y position for title at top of timeline
const LINE_TITLE_OFFSET = 8; // Horizontal offset from line for title
const LINE_STROKE_WIDTH = 1;

function EventItemLine({ ev, geo }) {
  const { anchorX, rangeEndX, isPoint } = geo;
  const align = ev.align ?? 'center';
  const lines = notesLines(ev);

  // Round to integer pixels for consistent line rendering
  const x1 = Math.round(anchorX);
  const x2 = Math.round(rangeEndX);

  // Always position title at top of timeline
  let textX, textAnchor;
  
  if (isPoint) {
    // Single line - use alignment to position title
    if (align === 'left') {
      textX = x1 + LINE_TITLE_OFFSET;
      textAnchor = 'start';
    } else if (align === 'right') {
      textX = x1 - LINE_TITLE_OFFSET;
      textAnchor = 'end';
    } else {
      // center
      textX = x1;
      textAnchor = 'middle';
    }
  } else {
    // Two lines - center title between them based on alignment
    const midX = (x1 + x2) / 2;
    if (align === 'left') {
      textX = x1 + LINE_TITLE_OFFSET;
      textAnchor = 'start';
    } else if (align === 'right') {
      textX = x2 - LINE_TITLE_OFFSET;
      textAnchor = 'end';
    } else {
      // center
      textX = midX;
      textAnchor = 'middle';
    }
  }

  const notesY = LINE_TITLE_Y + NOTES_GAP + NOTES_LINE_H / 2;

  return (
    <>
      {/* Start date line */}
      <line
        x1={x1} y1={0}
        x2={x1} y2={geo.yBottom + CONNECTOR_MARGIN}
        stroke={ev.color}
        strokeWidth={LINE_STROKE_WIDTH}
        opacity={0.85}
        shapeRendering="crispEdges"
      />
      
      {/* End date line (if range event) */}
      {!isPoint && (
        <line
          x1={x2} y1={0}
          x2={x2} y2={geo.yBottom + CONNECTOR_MARGIN}
          stroke={ev.color}
          strokeWidth={LINE_STROKE_WIDTH}
          opacity={0.85}
          shapeRendering="crispEdges"
        />
      )}
      
      {/* Title at top */}
      <text
        x={textX}
        y={LINE_TITLE_Y}
        dominantBaseline="central"
        textAnchor={textAnchor}
        fill={ev.color}
        fontSize={FONT_SIZE}
        fontWeight="600"
        fontFamily="inherit"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {ev.title}
      </text>
      
      {/* Notes below title */}
      {lines.length > 0 && (
        <text
          x={textX}
          y={notesY}
          dominantBaseline="central"
          textAnchor={textAnchor}
          fill={ev.color}
          fontSize={FONT_SIZE}
          fontFamily="inherit"
          opacity={0.65}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {lines.map((line, i) => (
            <tspan key={i} x={textX} dy={i === 0 ? 0 : NOTES_LINE_H}>{line}</tspan>
          ))}
        </text>
      )}
      
      {/* Invisible hit area for click detection */}
      <rect
        x={isPoint ? x1 - 10 : x1}
        y={0}
        width={isPoint ? 20 : x2 - x1}
        height={geo.yBottom + CONNECTOR_MARGIN}
        fill="transparent"
      />
    </>
  );
}

// ── Variant registry ──────────────────────────────────────────────────────────
const VARIANT_COMPONENTS = {
  solid:   EventItemSolid,
  outline: EventItemOutline,
  label:   EventItemLabel,
  line:    EventItemLine,
};

// ── Tooltip Component ─────────────────────────────────────────────────────────
export function EventTooltip({ ev, clientX, clientY, onMouseEnter, onMouseLeave }) {
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

  const handleCopy = () => {
    const parts = [
      `Title: ${ev.title}`,
      `Start: ${formatDateTime(ev.startDate)}`,
    ];
    
    if (ev.endDate) {
      parts.push(`End: ${formatDateTime(ev.endDate)}`);
    }
    
    if (ev.description && ev.description.trim()) {
      parts.push(`Description: ${ev.description.trim()}`);
    }
    
    if (ev.personId || ev.groupId) {
      const label = ev.personId ? 'Person' : 'Group';
      parts.push(`${label}: ${ev.personId || ev.groupId}`);
    }
    
    navigator.clipboard.writeText(parts.join('\n')).catch(() => {});
  };

  const handleCopyStartDate = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(formatDateTime(ev.startDate)).catch(() => {});
  };

  const handleCopyEndDate = (e) => {
    e.stopPropagation();
    if (ev.endDate) {
      navigator.clipboard.writeText(formatDateTime(ev.endDate)).catch(() => {});
    }
  };

  const handleCopyDescription = (e) => {
    e.stopPropagation();
    if (ev.description && ev.description.trim()) {
      navigator.clipboard.writeText(ev.description.trim()).catch(() => {});
    }
  };

  // Position tooltip near cursor with bounds checking
  const offsetX = 15;
  const offsetY = 15;
  const tooltipWidth = 320;
  const estimatedHeight = 200; // More generous estimate
  
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
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        backgroundColor: 'rgba(20, 20, 24, 0.98)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '8px',
        maxWidth: `${tooltipWidth}px`,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1)',
        pointerEvents: 'auto',
        zIndex: 10000,
        fontFamily: 'inherit',
        overflow: 'hidden',
      }}
    >
      {/* Header with title and copy button */}
      <div
        style={{
          background: `linear-gradient(135deg, ${ev.color}22, ${ev.color}11)`,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: 'rgba(255, 255, 255, 0.98)',
              fontSize: '14px',
              fontWeight: '600',
              lineHeight: '1.4',
              wordBreak: 'break-word',
            }}
          >
            {ev.title}
          </div>
        </div>
        <button
          onClick={handleCopy}
          style={{
            flexShrink: 0,
            width: '24px',
            height: '24px',
            padding: 0,
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '4px',
            background: 'rgba(255, 255, 255, 0.05)',
            color: 'rgba(255, 255, 255, 0.7)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.95)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}
          title="Copy event details"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Dates section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Start date */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <button
              onClick={handleCopyStartDate}
              title="Copy start date"
              style={{
                flexShrink: 0,
                marginTop: '2px',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                opacity: 0.7,
                color: 'rgba(255, 255, 255, 0.7)',
                display: 'flex',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.7';
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.5 21h-4.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v3" />
                <path d="M16 3v4" />
                <path d="M8 3v4" />
                <path d="M4 11h10" />
                <path d="M18 18m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
                <path d="M18 16.5v1.5l.5 .5" />
              </svg>
            </button>
            <div
              style={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: '13px',
                lineHeight: '20px',
                flex: 1,
              }}
            >
              {formatDateTime(ev.startDate)}
            </div>
          </div>

          {/* End date */}
          {ev.endDate && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <button
                onClick={handleCopyEndDate}
                title="Copy end date"
                style={{
                  flexShrink: 0,
                  marginTop: '2px',
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  opacity: 0.7,
                  color: 'rgba(255, 255, 255, 0.7)',
                  display: 'flex',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.7';
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10.5 21h-4.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v3" />
                  <path d="M16 3v4" />
                  <path d="M8 3v4" />
                  <path d="M4 11h10" />
                  <path d="M18 18m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
                  <path d="M18 16.5v1.5l.5 .5" />
                </svg>
              </button>
              <div
                style={{
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontSize: '13px',
                  lineHeight: '20px',
                  flex: 1,
                }}
              >
                {formatDateTime(ev.endDate)}
              </div>
            </div>
          )}
        </div>

        {/* Description section */}
        {ev.description && ev.description.trim() && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <button
              onClick={handleCopyDescription}
              title="Copy description"
              style={{
                flexShrink: 0,
                marginTop: '2px',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                opacity: 0.7,
                color: 'rgba(255, 255, 255, 0.7)',
                display: 'flex',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.7';
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 3m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" />
                <path d="M9 7l6 0" />
                <path d="M9 11l6 0" />
                <path d="M9 15l4 0" />
              </svg>
            </button>
            <div
              style={{
                color: 'rgba(255, 255, 255, 0.75)',
                fontSize: '12px',
                lineHeight: '18px',
                flex: 1,
                maxHeight: '90px',
                overflow: 'hidden',
              }}
            >
              {ev.description.split('\n').slice(0, 5).map((line, i) => (
                line.trim() ? (
                  <div key={i} style={{ marginBottom: i < 4 ? '2px' : 0 }}>
                    {line.length > 60 ? line.substring(0, 57) + '...' : line}
                  </div>
                ) : null
              ))}
            </div>
          </div>
        )}

        {/* Person/Group section */}
        {(ev.personId || ev.groupId) && (
          <div
            style={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '11px',
              paddingTop: '6px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            {ev.personId ? '👤' : '👥'} {ev.personId || ev.groupId}
          </div>
        )}
      </div>
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
      <Variant ev={ev} geo={geo} axisY={axisY} />
    </g>
  );
}
