const MIN_EVENT_PX  = 8;
const LANE_GAP_PX   = 6;
const LANE_V_GAP    = 10;
export const PAD_H         = 10;
export const PAD_V         = 8;
export const FONT_SIZE     = 11;
export const NOTES_GAP     = 15;
export const NOTES_LINE_H  = 14;

/** Must stay in sync with EventItem.jsx calcEventHeight(). */
function eventHeightPx(ev) {
  const n = (ev.showNotes && ev.description) ? ev.description.split('\n').length : 0;
  if (n === 0) return PAD_V + FONT_SIZE + PAD_V;
  return PAD_V + FONT_SIZE + NOTES_GAP + NOTES_LINE_H / 2 + (n - 1) * NOTES_LINE_H + PAD_V;
}

// Text width measurement using Canvas 2D — pixel-accurate
const _canvas = typeof document !== 'undefined' && document.createElement('canvas');
const _ctx = _canvas && _canvas.getContext('2d');
const TITLE_FONT = '600 11px Inter, system-ui, -apple-system, sans-serif';
const NOTES_FONT = '400 11px Inter, system-ui, -apple-system, sans-serif';
const MIN_W     = 24;  // minimum width even for very short titles

function measureTextWidth(text, font) {
  if (!_ctx) return (text?.length ?? 0) * 7; // SSR fallback
  _ctx.font = font;
  return _ctx.measureText(text).width;
}

/** Pixel width of the bounding box for an event (frame for solid/outline, text extent for label). */
export function eventDisplayWidthPx(ev) {
  const titleW = measureTextWidth(ev.title, TITLE_FONT);
  let maxW = titleW;
  if (ev.showNotes && ev.description) {
    for (const line of ev.description.split('\n')) {
      maxW = Math.max(maxW, measureTextWidth(line, NOTES_FONT));
    }
  }
  return Math.max(maxW + PAD_H * 2, MIN_W);
}

export function layoutEvents(events, viewStart, viewEnd, svgWidth) {
  if (!events.length) return [];

  const duration = viewEnd - viewStart;
  const pxPerMs = svgWidth / duration;

  const GAP_X = LANE_GAP_PX;
  const GAP_Y = LANE_V_GAP;

  // Compute pixel-space bounding boxes for each event
  const items = events.map(ev => {
    const start = new Date(ev.startDate).getTime();
    const isPoint = !ev.endDate;
    const rawEnd = isPoint ? start : new Date(ev.endDate).getTime();
    const heightPx = eventHeightPx(ev);
    const textW = eventDisplayWidthPx(ev);
    const style = ev.style ?? 'solid';
    const strokeMargin = 0;

    const anchorPx = (start - viewStart) * pxPerMs;
    let leftPx, rightPx;

    if (isPoint) {
      const align = ev.align ?? 'left';
      const CALLOUT_MARGIN = 12; // matches CALLOUT_EDGE_PAD in EventItem
      if (align === 'center') {
        leftPx = anchorPx - textW / 2;
        rightPx = anchorPx + textW / 2;
      } else if (align === 'right') {
        leftPx = anchorPx - textW + CALLOUT_MARGIN;
        rightPx = anchorPx + CALLOUT_MARGIN;
      } else {
        leftPx = anchorPx - CALLOUT_MARGIN;
        rightPx = anchorPx + textW - CALLOUT_MARGIN;
      }
    } else {
      const endPx = (rawEnd - viewStart) * pxPerMs;
      const rangeW = Math.max(endPx - anchorPx, MIN_EVENT_PX);
      leftPx = anchorPx - strokeMargin;
      rightPx = anchorPx + Math.max(rangeW, textW) + strokeMargin;
    }

    return { ev, start, end: rawEnd, leftPx, rightPx, heightPx: heightPx + strokeMargin * 2 };
  });

  // Sort by color then left edge so same-color events are processed together,
  // increasing their chance of landing on the same y-level.
  items.sort((a, b) => {
    const ca = a.ev.color ?? '';
    const cb = b.ev.color ?? '';
    if (ca < cb) return -1;
    if (ca > cb) return  1;
    return a.leftPx - b.leftPx;
  });

  // Greedy 2D placement: for each event, find the lowest yOffset where
  // its bounding box doesn't overlap any already-placed event.
  // yOffset = distance from the axis baseline to the TOP of the event rect.
  // Event occupies vertical span [yOffset - heightPx, yOffset] (in upward coords).
  const placed = []; // { leftPx, rightPx, yBase, yTop } — yBase = bottom, yTop = top (upward coords)
  const colorYBases = new Map(); // color → Set<yBase> — tracks y-levels used by each color

  const result = items.map(item => {
    // Find all placed events that horizontally overlap (with gap)
    const hConflicts = placed.filter(p =>
      p.leftPx < item.rightPx + GAP_X && p.rightPx + GAP_X > item.leftPx
    );

    // Collect the vertical intervals that are occupied
    // Sort conflicts by yBase so we can find gaps bottom-to-top
    hConflicts.sort((a, b) => a.yBase - b.yBase);

    // Enumerate all valid (non-overlapping) candidate y-positions
    const candidates = [];
    let tryBase = GAP_Y;
    for (const c of hConflicts) {
      const myTop = tryBase + item.heightPx;
      if (myTop + GAP_Y > c.yBase && tryBase < c.yTop + GAP_Y) {
        // Gap before this conflict is too small — record it as a candidate
        // only if we haven't been pushed past it already
        if (tryBase + item.heightPx + GAP_Y <= c.yBase) {
          candidates.push(tryBase);
        }
        tryBase = c.yTop + GAP_Y;
      }
    }
    candidates.push(tryBase); // position above all conflicts is always valid

    // Prefer a candidate y-position already used by the same color
    const color = item.ev.color ?? '';
    const usedByColor = colorYBases.get(color);
    let yBase = candidates[0]; // default: lowest valid position
    if (usedByColor) {
      for (const c of candidates) {
        if (usedByColor.has(c)) { yBase = c; break; }
      }
    }

    const yTop = yBase + item.heightPx;
    const yOffset = yTop; // distance from axis to top of event

    placed.push({ leftPx: item.leftPx, rightPx: item.rightPx, yBase, yTop });
    if (!colorYBases.has(color)) colorYBases.set(color, new Set());
    colorYBases.get(color).add(yBase);

    return { ev: item.ev, start: item.start, end: item.end, yOffset };
  });

  // === Second pass: readjust lanes for better color grouping ===
  // After the first greedy pass, some events may be isolated from their
  // color group (e.g. the first event of a color was placed before others
  // established a preferred lane).  Try to relocate them.

  // Build color → yBase → count of events at that lane
  const colorLaneCounts = new Map();
  for (let i = 0; i < placed.length; i++) {
    const color = items[i].ev.color ?? '';
    if (!colorLaneCounts.has(color)) colorLaneCounts.set(color, new Map());
    const lanes = colorLaneCounts.get(color);
    lanes.set(placed[i].yBase, (lanes.get(placed[i].yBase) || 0) + 1);
  }

  for (let i = 0; i < placed.length; i++) {
    const color = items[i].ev.color ?? '';
    const lanes = colorLaneCounts.get(color);
    if (!lanes || lanes.size <= 1) continue; // only one lane for this color

    const currentCount = lanes.get(placed[i].yBase) || 0;

    // Candidate lanes for this color, sorted by event count descending
    const candidates = [...lanes.entries()]
      .filter(([yb]) => yb !== placed[i].yBase)
      .sort((a, b) => b[1] - a[1]);

    for (const [candidateBase, candidateCount] of candidates) {
      // Only move if the target lane has at least as many same-color
      // events as my current lane (including me) — net positive move
      if (candidateCount < currentCount) break;

      const candidateTop = candidateBase + items[i].heightPx;

      // Check for overlaps with other placed events (excluding self)
      const overlaps = placed.some((p, j) =>
        j !== i &&
        p.leftPx < placed[i].rightPx + GAP_X &&
        p.rightPx + GAP_X > placed[i].leftPx &&
        candidateBase < p.yTop + GAP_Y &&
        candidateTop + GAP_Y > p.yBase
      );

      if (!overlaps) {
        // Update lane counts
        const oldBase = placed[i].yBase;
        lanes.set(oldBase, (lanes.get(oldBase) || 1) - 1);
        if (lanes.get(oldBase) === 0) lanes.delete(oldBase);
        lanes.set(candidateBase, (lanes.get(candidateBase) || 0) + 1);

        // Move the event
        placed[i].yBase = candidateBase;
        placed[i].yTop = candidateTop;
        result[i].yOffset = candidateTop;
        break;
      }
    }
  }

  return result;
}
