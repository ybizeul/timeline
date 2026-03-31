import { PAD_V, PAD_H, FONT_SIZE, NOTES_GAP, NOTES_LINE_H } from './eventLayout';

const CALLOUT_HW       = 6;
const CALLOUT_H        = 6;
export const CALLOUT_EDGE_PAD = 13;

/** Canonical height for an event rect. */
export function calcEventHeight(numNoteLines) {
  if (numNoteLines === 0) return PAD_V + FONT_SIZE + PAD_V;
  return PAD_V + FONT_SIZE + NOTES_GAP + NOTES_LINE_H / 2 + (numNoteLines - 1) * NOTES_LINE_H + PAD_V;
}

/** Split description into lines (empty array when notes are off or blank). */
export function notesLines(ev) {
  if (!ev.showNotes || !ev.description) return [];
  return ev.description.split('\n');
}

/** Position the rect so anchorX always falls inside it (with callout margin). */
export function getRectX(anchorX, width, align) {
  if (align === 'center') return anchorX - width / 2;
  if (align === 'right')  return anchorX - width + CALLOUT_EDGE_PAD;
  return anchorX - CALLOUT_EDGE_PAD;
}

/** Compute textX and textAnchor for a rect based on alignment. */
export function alignedText(rectX, rectW, align) {
  if (align === 'center') return { textX: rectX + rectW / 2, textAnchor: 'middle' };
  if (align === 'right')  return { textX: rectX + rectW - PAD_H, textAnchor: 'end' };
  return { textX: rectX + PAD_H, textAnchor: 'start' };
}

/** SVG path for a rounded rect. If calloutCx is provided, adds a triangular notch in the bottom edge. */
export function eventShapePath(x, y, w, h, r, calloutCx) {
  const R = Math.min(r, w / 2, h / 2);
  const by = y + h;
  if (calloutCx == null) {
    return `M${x + R},${y}`
      + `H${x + w - R}A${R},${R},0,0,1,${x + w},${y + R}`
      + `V${by - R}A${R},${R},0,0,1,${x + w - R},${by}`
      + `H${x + R}A${R},${R},0,0,1,${x},${by - R}`
      + `V${y + R}A${R},${R},0,0,1,${x + R},${y}Z`;
  }
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
