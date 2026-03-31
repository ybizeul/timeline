import { getScaleTicks, getWeekendRanges, tToX, cullTicks } from './timeScale';
import { layoutEvents, eventDisplayWidthPx, PAD_H, PAD_V, FONT_SIZE, NOTES_GAP, NOTES_LINE_H } from './eventLayout';
import { calcEventHeight, notesLines, getRectX, alignedText, eventShapePath } from './eventGeometry';

// ── Constants ────────────────────────────────────────────────────────────────
export const EXPORT_PADDING_PX = 20;

const LABEL_STRIP_H = 52;
const TOP_MARGIN = 20;
const CONNECTOR_MARGIN = 4;
const CALLOUT_H = 6;
const EVENT_MIN_WIDTH = 8;
const MAJOR_TICK_H = 10;
const MINOR_TICK_H = 5;
const MAJOR_MIN_PX = 90;
const MINOR_MIN_PX = 52;
const MAJOR_CH_PX = 7;
const MINOR_CH_PX = 6;
const BRACKET_W = 3;
const BRACKET_HH = 4;
const BRACKET_SW = 1.2;
const BRACKET_INSET = 3;
const LABEL_LINE_GAP = 4;
const LABEL_H_GAP = 6;
const LABEL_BAR_GAP = 5;

const FONT_FAMILY = 'Inter, system-ui, -apple-system, sans-serif';

// ── CSS variable resolution ──────────────────────────────────────────────────
function resolveVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getColors() {
  return {
    bg:        resolveVar('--bg'),
    surface:   resolveVar('--surface'),
    surfaceEl: resolveVar('--surface-el'),
    border:    resolveVar('--border'),
    axis:      resolveVar('--axis'),
    tick:      resolveVar('--tick'),
    text:      resolveVar('--text'),
    textMuted: resolveVar('--text-muted'),
    today:     resolveVar('--today'),
    weekendBg: resolveVar('--weekend-bg'),
  };
}

// ── SVG string helpers ───────────────────────────────────────────────────────
function svgRect(x, y, w, h, fill, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
}

function svgLine(x1, y1, x2, y2, stroke, sw, extra = '') {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Bracket paths (for range events) ─────────────────────────────────────────
function bracketsSvg(x1, x2, yTop, height, color, inset = 0, opacity = 0.55) {
  const yMid = yTop + height / 2;
  const lx = x1 + inset;
  const rx = x2 - inset;
  return `<g opacity="${opacity}">` +
    `<polyline points="${lx + BRACKET_W},${yMid - BRACKET_HH} ${lx},${yMid} ${lx + BRACKET_W},${yMid + BRACKET_HH}" ` +
    `fill="none" stroke="${esc(color)}" stroke-width="${BRACKET_SW}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polyline points="${rx - BRACKET_W},${yMid - BRACKET_HH} ${rx},${yMid} ${rx - BRACKET_W},${yMid + BRACKET_HH}" ` +
    `fill="none" stroke="${esc(color)}" stroke-width="${BRACKET_SW}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</g>`;
}

// ── Connector (dashed line + dot) ────────────────────────────────────────────
function connectorSvg(anchorX, yBottom, yConnectTop, color) {
  return svgLine(anchorX, yConnectTop, anchorX, yBottom, color, 1.5,
    `stroke-dasharray="3 3" opacity="0.5"`) +
    `<circle cx="${anchorX}" cy="${yBottom + CONNECTOR_MARGIN}" r="2.5" fill="${esc(color)}" opacity="0.7"/>`;
}

// ── Event rendering (all three variants) ─────────────────────────────────────
function renderEventSolid(ev, anchorX, rectX, width, yTop, yBottom, evH, isPoint) {
  const align = ev.align ?? 'left';
  const lines = notesLines(ev);
  const titleY = yTop + PAD_V + FONT_SIZE / 2;
  const notesY = titleY + NOTES_GAP + NOTES_LINE_H / 2;
  const { textX, textAnchor } = alignedText(rectX, width, align);
  const calloutCx = isPoint ? anchorX : null;

  let svg = '';
  if (isPoint) svg += connectorSvg(anchorX, yBottom, yTop + evH + CALLOUT_H, ev.color);
  svg += `<path d="${eventShapePath(rectX, yTop, width, evH, 5, calloutCx)}" fill="${esc(ev.color)}" opacity="0.9"/>`;
  if (!isPoint) svg += bracketsSvg(rectX, rectX + width, yTop, evH, '#fff', BRACKET_INSET, 0.4);
  svg += `<rect x="${rectX + 1}" y="${yTop + 1}" width="${Math.max(width - 2, 0)}" height="${PAD_V + FONT_SIZE / 2}" rx="4" fill="rgba(255,255,255,0.08)"/>`;
  svg += `<text x="${textX}" y="${titleY}" dominant-baseline="central" text-anchor="${textAnchor}" fill="#fff" font-size="${FONT_SIZE}" font-weight="500" font-family="${FONT_FAMILY}">${esc(ev.title)}</text>`;
  if (lines.length > 0) {
    svg += `<text x="${textX}" y="${notesY}" dominant-baseline="central" text-anchor="${textAnchor}" fill="rgba(255,255,255,0.65)" font-size="${FONT_SIZE}" font-family="${FONT_FAMILY}">`;
    lines.forEach((line, i) => {
      svg += `<tspan x="${textX}" dy="${i === 0 ? 0 : NOTES_LINE_H}">${esc(line)}</tspan>`;
    });
    svg += `</text>`;
  }
  return svg;
}

function renderEventOutline(ev, anchorX, rectX, width, yTop, yBottom, evH, isPoint) {
  const align = ev.align ?? 'left';
  const lines = notesLines(ev);
  const titleY = yTop + PAD_V + FONT_SIZE / 2;
  const notesY = titleY + NOTES_GAP + NOTES_LINE_H / 2;
  const { textX, textAnchor } = alignedText(rectX, width, align);
  const calloutCx = isPoint ? anchorX : null;

  let svg = '';
  if (isPoint) svg += connectorSvg(anchorX, yBottom, yTop + evH + CALLOUT_H, ev.color);
  svg += `<path d="${eventShapePath(rectX, yTop, width, evH, 5, calloutCx)}" fill="none" stroke="${esc(ev.color)}" stroke-width="1.5" stroke-linejoin="round" opacity="0.85"/>`;
  if (!isPoint) svg += bracketsSvg(rectX, rectX + width, yTop, evH, ev.color, BRACKET_INSET, 0.45);
  svg += `<text x="${textX}" y="${titleY}" dominant-baseline="central" text-anchor="${textAnchor}" fill="${esc(ev.color)}" font-size="${FONT_SIZE}" font-weight="600" font-family="${FONT_FAMILY}">${esc(ev.title)}</text>`;
  if (lines.length > 0) {
    svg += `<text x="${textX}" y="${notesY}" dominant-baseline="central" text-anchor="${textAnchor}" fill="${esc(ev.color)}" font-size="${FONT_SIZE}" font-family="${FONT_FAMILY}" opacity="0.65">`;
    lines.forEach((line, i) => {
      svg += `<tspan x="${textX}" dy="${i === 0 ? 0 : NOTES_LINE_H}">${esc(line)}</tspan>`;
    });
    svg += `</text>`;
  }
  return svg;
}

function renderEventLabel(ev, anchorX, rectX, width, rangeEndX, yTop, yBottom, evH, isPoint) {
  const align = ev.align ?? 'left';
  const lines = notesLines(ev);
  const textBlockTop = yTop - LABEL_LINE_GAP;
  const titleY = textBlockTop + PAD_V + FONT_SIZE / 2;
  const notesY = titleY + NOTES_GAP + NOTES_LINE_H / 2;
  const textBottom = lines.length > 0
    ? notesY + (lines.length - 1) * NOTES_LINE_H + FONT_SIZE / 2
    : titleY + FONT_SIZE / 2;
  const barY = isPoint ? yTop + evH : textBottom + LABEL_BAR_GAP;
  const solidBottom = textBlockTop + evH;

  let textX, textAnchor;
  if (isPoint) {
    if (align === 'center') {
      textX = anchorX; textAnchor = 'middle';
    } else if (align === 'right') {
      textX = anchorX - LABEL_H_GAP; textAnchor = 'end';
    } else {
      const offsetX = rectX + LABEL_H_GAP;
      ({ textX, textAnchor } = alignedText(offsetX, width, align));
    }
  } else if (align === 'center') {
    textX = anchorX + (rangeEndX - anchorX) / 2; textAnchor = 'middle';
  } else if (align === 'right') {
    textX = rangeEndX - PAD_H; textAnchor = 'end';
  } else {
    textX = anchorX + PAD_H; textAnchor = 'start';
  }

  let svg = '';
  if (isPoint) {
    if (align === 'center') {
      svg += svgLine(anchorX, solidBottom, anchorX, yBottom, ev.color, 1.5, `stroke-dasharray="3 3" opacity="0.5"`);
      svg += `<circle cx="${anchorX}" cy="${yBottom + CONNECTOR_MARGIN}" r="2.5" fill="${esc(ev.color)}" opacity="0.7"/>`;
    } else {
      svg += svgLine(anchorX, textBlockTop, anchorX, solidBottom, ev.color, 1.5, `opacity="0.5"`);
      svg += svgLine(anchorX, solidBottom, anchorX, yBottom, ev.color, 1.5, `stroke-dasharray="3 3" opacity="0.5"`);
      svg += `<circle cx="${anchorX}" cy="${yBottom + CONNECTOR_MARGIN}" r="2.5" fill="${esc(ev.color)}" opacity="0.7"/>`;
    }
  } else {
    svg += svgLine(anchorX, barY, rangeEndX, barY, ev.color, 2, `opacity="0.7"`);
    svg += bracketsSvg(anchorX, rangeEndX, yTop, barY - yTop, ev.color, 0, 0.45);
  }
  svg += `<text x="${textX}" y="${titleY}" text-anchor="${textAnchor}" dominant-baseline="central" fill="${esc(ev.color)}" font-size="${FONT_SIZE}" font-weight="600" font-family="${FONT_FAMILY}">${esc(ev.title)}</text>`;
  if (lines.length > 0) {
    svg += `<text x="${textX}" y="${notesY}" text-anchor="${textAnchor}" dominant-baseline="central" fill="${esc(ev.color)}" font-size="${FONT_SIZE}" font-family="${FONT_FAMILY}" opacity="0.65">`;
    lines.forEach((line, i) => {
      svg += `<tspan x="${textX}" dy="${i === 0 ? 0 : NOTES_LINE_H}">${esc(line)}</tspan>`;
    });
    svg += `</text>`;
  }
  return svg;
}

function renderEvent(item, viewStart, viewEnd, exportWidth, axisY, colors) {
  const { ev, start, end, yOffset } = item;
  const align = ev.align ?? 'left';
  const lines = notesLines(ev);
  const evH = calcEventHeight(lines.length);

  const anchorX = tToX(start, viewStart, viewEnd, exportWidth);
  const isPoint = !ev.endDate;
  const rangeEndX = !isPoint ? tToX(end, viewStart, viewEnd, exportWidth) : anchorX;
  const textW = eventDisplayWidthPx(ev);
  const width = isPoint ? textW : Math.max(rangeEndX - anchorX, EVENT_MIN_WIDTH, textW);
  const rectX = isPoint ? getRectX(anchorX, width, align) : anchorX;

  const yBottom = axisY - CONNECTOR_MARGIN;
  const yTop = yBottom - yOffset;

  const style = ev.style ?? 'solid';
  if (style === 'outline') return renderEventOutline(ev, anchorX, rectX, width, yTop, yBottom, evH, isPoint);
  if (style === 'label') return renderEventLabel(ev, anchorX, rectX, width, rangeEndX, yTop, yBottom, evH, isPoint);
  return renderEventSolid(ev, anchorX, rectX, width, yTop, yBottom, evH, isPoint);
}

// ── Main export function ─────────────────────────────────────────────────────
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim() || 'timeline';
}

export function exportTimelineSvg({ events, viewport, svgWidth, timelineName, showToday, showWeekends }) {
  if (!events.length) return;

  const colors = getColors();
  const { viewStart, viewEnd } = viewport;
  const pxPerMs = svgWidth / (viewEnd - viewStart);

  // Find the time range that covers all events
  let minT = Infinity, maxT = -Infinity;
  for (const ev of events) {
    const s = new Date(ev.startDate).getTime();
    const e = ev.endDate ? new Date(ev.endDate).getTime() : s;
    if (s < minT) minT = s;
    if (e > maxT) maxT = e;
  }

  // Two-pass approach: first layout with a generous viewport to get placement,
  // then measure actual pixel bounds to crop precisely.
  const bufferMs = (maxT - minT) * 0.5 + 1;
  const prelViewStart = minT - bufferMs;
  const prelViewEnd = maxT + bufferMs;
  const prelWidth = (prelViewEnd - prelViewStart) * pxPerMs;
  const prelLaid = layoutEvents(events, prelViewStart, prelViewEnd, prelWidth);

  // Measure actual pixel extent of all events
  let minPx = Infinity, maxPx = -Infinity;
  for (const item of prelLaid) {
    const ev = item.ev;
    const anchorPx = (item.start - prelViewStart) * pxPerMs;
    const isPoint = !ev.endDate;
    const textW = eventDisplayWidthPx(ev);
    const align = ev.align ?? 'left';
    let leftPx, rightPx;
    if (isPoint) {
      if (align === 'center') {
        leftPx = anchorPx - textW / 2;
        rightPx = anchorPx + textW / 2;
      } else if (align === 'right') {
        leftPx = anchorPx - textW + 12;
        rightPx = anchorPx + 12;
      } else {
        leftPx = anchorPx - 12;
        rightPx = anchorPx + textW - 12;
      }
    } else {
      const endPx = (item.end - prelViewStart) * pxPerMs;
      const rangeW = Math.max(endPx - anchorPx, 8);
      leftPx = anchorPx;
      rightPx = anchorPx + Math.max(rangeW, textW);
    }
    if (leftPx < minPx) minPx = leftPx;
    if (rightPx > maxPx) maxPx = rightPx;
  }

  // Convert pixel bounds back to time, add EXPORT_PADDING_PX
  const paddingMs = EXPORT_PADDING_PX / pxPerMs;
  const exportViewStart = prelViewStart + minPx / pxPerMs - paddingMs;
  const exportViewEnd = prelViewStart + maxPx / pxPerMs + paddingMs;
  const exportWidth = (exportViewEnd - exportViewStart) * pxPerMs;

  // Final layout in the cropped viewport
  const laid = layoutEvents(events, exportViewStart, exportViewEnd, exportWidth);
  const maxYOffset = laid.reduce((max, item) => Math.max(max, item.yOffset), 0);
  const eventsHeight = maxYOffset + TOP_MARGIN + CONNECTOR_MARGIN;
  const exportHeight = eventsHeight + LABEL_STRIP_H;
  const axisY = eventsHeight;

  // Sort: higher events first (matching EventLayer)
  const sortedLaid = [...laid].sort((a, b) => b.yOffset - a.yOffset);

  const toX = (t) => tToX(t, exportViewStart, exportViewEnd, exportWidth);

  // ── Build SVG ──────────────────────────────────────────────────────────────
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}">`;
  svg += `<style>text { font-family: ${FONT_FAMILY}; }</style>`;

  // Background
  svg += svgRect(0, 0, exportWidth, exportHeight, colors.bg);

  // Weekend ranges
  if (showWeekends) {
    const { level } = getScaleTicks(exportViewStart, exportViewEnd, exportWidth);
    const weekendRanges = getWeekendRanges(exportViewStart, exportViewEnd, level);
    for (const { start, end } of weekendRanges) {
      const x1 = toX(start);
      const x2 = toX(end);
      svg += svgRect(x1, 0, x2 - x1, axisY, colors.weekendBg);
    }
  }

  // Axis
  const { majorTicks, minorTicks, level, minorLevel } = getScaleTicks(exportViewStart, exportViewEnd, exportWidth);

  // Label strip background
  svg += svgRect(0, axisY, exportWidth, LABEL_STRIP_H, colors.surface);

  const majors = cullTicks(majorTicks, toX, MAJOR_MIN_PX, MAJOR_CH_PX, level);
  const minors = cullTicks(minorTicks, toX, MINOR_MIN_PX, MINOR_CH_PX, minorLevel);

  // Separator lines at major ticks
  for (const { x, showTick } of majors) {
    if (showTick && x >= 0 && x <= exportWidth) {
      svg += svgLine(x, 0, x, axisY, colors.border, 1, `opacity="0.45"`);
    }
  }

  // Main axis line
  svg += svgLine(0, axisY, exportWidth, axisY, colors.axis, 1.5);

  // Minor ticks + labels
  const minorRowY = axisY + MINOR_TICK_H + 12;
  for (const { x, label, showLabel, showTick } of minors) {
    if (x < -1 || x > exportWidth + 1) continue;
    if (!showTick && !showLabel) continue;
    if (showTick) {
      svg += svgLine(x, axisY, x, axisY + MINOR_TICK_H, colors.tick, 1);
    }
    if (showLabel) {
      svg += `<text x="${x + 4}" y="${minorRowY}" fill="${esc(colors.textMuted)}" font-size="10" font-family="${FONT_FAMILY}">${esc(label)}</text>`;
    }
  }

  // Major ticks + labels
  const majorRowY = axisY + MAJOR_TICK_H + 32;
  for (const { x, label, showLabel, showTick } of majors) {
    if (x < -1 || x > exportWidth + 1) continue;
    if (!showTick && !showLabel) continue;
    if (showTick) {
      svg += svgLine(x, axisY, x, axisY + MAJOR_TICK_H, colors.tick, 1.5);
    }
    if (showLabel) {
      const pillW = label.length * MAJOR_CH_PX + 14;
      svg += `<rect x="${x + 4}" y="${majorRowY - 12}" width="${pillW}" height="16" rx="4" fill="${esc(colors.surfaceEl)}"/>`;
      svg += `<text x="${x + 11}" y="${majorRowY}" fill="${esc(colors.text)}" font-size="11" font-weight="600" font-family="${FONT_FAMILY}">${esc(label)}</text>`;
    }
  }

  // Today line
  if (showToday) {
    const now = Date.now();
    const todayX = toX(now);
    if (todayX >= 0 && todayX <= exportWidth) {
      svg += svgLine(todayX, 0, todayX, exportHeight, colors.today, 1.5, `stroke-dasharray="4 3" opacity="0.7"`);
      svg += `<circle cx="${todayX}" cy="${axisY - 20}" r="4" fill="${esc(colors.today)}"/>`;
      svg += `<text x="${todayX + 6}" y="14" fill="${esc(colors.today)}" font-size="10" font-weight="600" font-family="${FONT_FAMILY}" opacity="0.9">Today</text>`;
    }
  }

  // Events
  for (const item of sortedLaid) {
    svg += renderEvent(item, exportViewStart, exportViewEnd, exportWidth, axisY, colors);
  }

  svg += `</svg>`;

  // Download
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(timelineName)}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
