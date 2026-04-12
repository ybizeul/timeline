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
  const BASE_LANE_HEIGHT = PAD_V + FONT_SIZE + PAD_V;
  const LANE_PITCH = BASE_LANE_HEIGHT + GAP_Y;

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

  const normalizedItems = items.map((item, index) => {
    const laneRaw = item.ev?.lane;
    const preferredLane = Number.isInteger(laneRaw) && laneRaw >= 0 ? laneRaw : null;
    return { ...item, preferredLane, index };
  });

  // Place lane-constrained events first so manual lane choices can reserve space,
  // then place remaining events chronologically.
  const ordered = [...normalizedItems].sort((a, b) => {
    const aPinned = a.preferredLane != null;
    const bPinned = b.preferredLane != null;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned && a.preferredLane !== b.preferredLane) {
      return a.preferredLane - b.preferredLane;
    }
    if (a.leftPx !== b.leftPx) return a.leftPx - b.leftPx;
    return a.index - b.index;
  });

  const placed = []; // { leftPx, rightPx, lane, yBase, yTop }
  const assignedLaneById = new Map();

  function laneBase(lane) {
    return GAP_Y + lane * LANE_PITCH;
  }

  function canPlaceInLane(lane, item) {
    const yBase = laneBase(lane);
    const yTop = yBase + item.heightPx;
    return !placed.some((p) => {
      const hOverlap = p.leftPx < item.rightPx + GAP_X && p.rightPx + GAP_X > item.leftPx;
      if (!hOverlap) return false;
      const vOverlap = yBase < p.yTop + GAP_Y && yTop + GAP_Y > p.yBase;
      return vOverlap;
    });
  }

  function chooseLane(item) {
    const preferred = item.preferredLane;
    if (preferred != null) {
      if (canPlaceInLane(preferred, item)) return preferred;

      // Best effort: search nearest lanes around preferred lane.
      const maxLaneToProbe = Math.max(placed.length + 1, preferred + 1);
      for (let distance = 1; distance <= maxLaneToProbe + 1; distance++) {
        const up = preferred - distance;
        if (up >= 0 && canPlaceInLane(up, item)) return up;

        const down = preferred + distance;
        if (canPlaceInLane(down, item)) return down;
      }
      return Math.max(preferred, 0);
    }

    // No preference: first available lane from bottom to top.
    for (let lane = 0; lane <= placed.length + 1; lane++) {
      if (canPlaceInLane(lane, item)) return lane;
    }
    return placed.length + 1;
  }

  for (const item of ordered) {
    const lane = chooseLane(item);
    const yBase = laneBase(lane);
    const yTop = yBase + item.heightPx;
    placed.push({ leftPx: item.leftPx, rightPx: item.rightPx, lane, yBase, yTop });
    assignedLaneById.set(item.ev.id, lane);
  }

  const result = normalizedItems.map((item) => {
    const lane = assignedLaneById.get(item.ev.id) || 0;
    const yBase = laneBase(lane);
    const yOffset = yBase + item.heightPx;
    return { ev: item.ev, start: item.start, end: item.end, yOffset, lane };
  });

  return result;
}
