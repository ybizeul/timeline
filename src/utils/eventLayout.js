const MIN_EVENT_PX  = 8;
const LANE_GAP_PX   = 6;
const LANE_V_GAP    = 10;
const PAD           = 8;
const TEXT_ASCENT   = 8;
const TEXT_DESCENT  = 3;
const NOTES_LINE_H  = 14;

/** Must stay in sync with EventItem.jsx calcEventHeight(). */
function eventHeightPx(ev) {
  const n = (ev.showNotes && ev.description) ? ev.description.split('\n').length : 0;
  return PAD + TEXT_ASCENT + TEXT_DESCENT + PAD + n * NOTES_LINE_H;
}

// Text width estimation — must be conservative to prevent any overflow
const CHAR_W    = 8;   // generous approx px per character at 11px Inter (covers bold + wide chars)
const BOX_PAD   = 24;  // horizontal padding: PAD(8) each side + 8px safety margin
const MIN_W     = 40;  // minimum width even for very short titles

/** Pixel width of the bounding box for an event (frame for solid/outline, text extent for label). */
export function eventDisplayWidthPx(ev) {
  const lines = (ev.showNotes && ev.description) ? ev.description.split('\n') : [];
  const allLines = [ev.title, ...lines];
  const maxLineW = Math.max(...allLines.map(l => (l?.length ?? 0) * CHAR_W + BOX_PAD));
  return Math.max(maxLineW, MIN_W);
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
    // Outline/solid frames have stroke width that extends beyond the rect
    const strokeMargin = (style === 'outline') ? 2 : 0;

    const anchorPx = (start - viewStart) * pxPerMs;
    let leftPx, rightPx;

    if (isPoint) {
      const align = ev.align ?? 'left';
      if (align === 'center') {
        leftPx = anchorPx - textW / 2;
        rightPx = anchorPx + textW / 2;
      } else if (align === 'right') {
        leftPx = anchorPx - textW;
        rightPx = anchorPx;
      } else {
        leftPx = anchorPx;
        rightPx = anchorPx + textW;
      }
    } else {
      const endPx = (rawEnd - viewStart) * pxPerMs;
      const rangeW = Math.max(endPx - anchorPx, MIN_EVENT_PX);
      leftPx = anchorPx - strokeMargin;
      rightPx = anchorPx + Math.max(rangeW, textW) + strokeMargin;
    }

    return { ev, start, end: rawEnd, leftPx, rightPx, heightPx: heightPx + strokeMargin * 2 };
  });

  // Sort by left edge (left-to-right placement)
  items.sort((a, b) => a.leftPx - b.leftPx);

  // Greedy 2D placement: for each event, find the lowest yOffset where
  // its bounding box doesn't overlap any already-placed event.
  // yOffset = distance from the axis baseline to the TOP of the event rect.
  // Event occupies vertical span [yOffset - heightPx, yOffset] (in upward coords).
  const placed = []; // { leftPx, rightPx, yBase, yTop } — yBase = bottom, yTop = top (upward coords)

  const result = items.map(item => {
    // Find all placed events that horizontally overlap (with gap)
    const hConflicts = placed.filter(p =>
      p.leftPx < item.rightPx + GAP_X && p.rightPx + GAP_X > item.leftPx
    );

    // Try to place at the lowest possible position (closest to axis)
    // The lowest position is: yBase = GAP_Y, yTop = GAP_Y + heightPx
    // Check all conflicting events and find the lowest gap that fits.

    // Collect the vertical intervals that are occupied
    // Sort conflicts by yBase so we can find gaps bottom-to-top
    hConflicts.sort((a, b) => a.yBase - b.yBase);

    let yBase = GAP_Y; // start trying from the bottom

    for (const c of hConflicts) {
      // If our proposed box [yBase, yBase + heightPx] overlaps with c [c.yBase, c.yTop]
      const myTop = yBase + item.heightPx;
      if (myTop + GAP_Y > c.yBase && yBase < c.yTop + GAP_Y) {
        // Overlap — push above this conflict
        yBase = c.yTop + GAP_Y;
      }
    }

    const yTop = yBase + item.heightPx;
    const yOffset = yTop; // distance from axis to top of event

    placed.push({ leftPx: item.leftPx, rightPx: item.rightPx, yBase, yTop });

    return { ev: item.ev, start: item.start, end: item.end, yOffset };
  });

  return result;
}
