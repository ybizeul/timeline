const MIN_EVENT_PX  = 8;
const LANE_GAP_PX   = 4;
const LANE_V_GAP    = 8;
const PAD           = 8;
const TEXT_ASCENT   = 8;
const TEXT_DESCENT  = 3;
const NOTES_LINE_H  = 14;
const BASE_HEIGHT   = PAD + TEXT_ASCENT + TEXT_DESCENT + PAD; // no-notes height

/** Must stay in sync with EventItem.jsx calcEventHeight(). */
function eventHeightPx(ev) {
  const n = (ev.showNotes && ev.description) ? ev.description.split('\n').length : 0;
  return PAD + TEXT_ASCENT + TEXT_DESCENT + PAD + n * NOTES_LINE_H;
}

// Point event (no end date) — width computed from title text, fixed in pixels
const POINT_CHAR_W  = 6.5; // approximate px per character at 11px Inter
const POINT_PADDING = 20;  // left + right padding inside the rect
const POINT_MIN_W   = 40;  // minimum width even for very short titles

/** Fixed pixel width for a point event, independent of zoom level. */
export function pointEventWidthPx(title) {
  return Math.max((title?.length ?? 0) * POINT_CHAR_W + POINT_PADDING, POINT_MIN_W);
}

/**
 * Compute the visual [visStart, visEnd] in milliseconds for an event,
 * accounting for alignment and (for point events) fixed pixel width.
 */
function visualExtent(ev, pxPerMs) {
  const start = new Date(ev.startDate).getTime();
  const isPoint = !ev.endDate;

  let widthMs;
  if (isPoint) {
    // Convert fixed pixel width → ms at current zoom so lane reservation is accurate
    widthMs = pointEventWidthPx(ev.title) / pxPerMs;
  } else {
    const rawEnd = new Date(ev.endDate).getTime();
    widthMs = Math.max(rawEnd - start, MIN_EVENT_PX / pxPerMs);
  }

  const rawEnd = isPoint ? start + widthMs : new Date(ev.endDate).getTime();

  const align = ev.align ?? 'left';
  let visStart, visEnd;
  if (isPoint) {
    // Alignment shifts point events relative to anchor
    if (align === 'center') {
      visStart = start - widthMs / 2;
      visEnd   = start + widthMs / 2;
    } else if (align === 'right') {
      visStart = start - widthMs;
      visEnd   = start;
    } else {
      visStart = start;
      visEnd   = start + widthMs;
    }
  } else {
    // Range events always span exact dates
    visStart = start;
    visEnd   = rawEnd;
  }

  return { start, end: rawEnd, visStart, visEnd };
}

export function layoutEvents(events, viewStart, viewEnd, svgWidth) {
  if (!events.length) return [];

  const duration = viewEnd - viewStart;
  const pxPerMs = svgWidth / duration;
  const gapMs = LANE_GAP_PX / pxPerMs;

  // Enrich with visual extents
  const enriched = events.map(ev => ({
    ev,
    ...visualExtent(ev, pxPerMs),
    heightPx: eventHeightPx(ev),
  }));

  // Sort by visual start so the greedy pass is left-to-right
  enriched.sort((a, b) => a.visStart - b.visStart);

  // Greedy lane assignment — compare visual extents, not raw timestamps
  const lanes = []; // each lane tracks visEnd of its last event
  const result = enriched.map(item => {
    let assignedLane = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i].visEnd + gapMs <= item.visStart) {
        assignedLane = i;
        lanes[i].visEnd = item.visEnd;
        break;
      }
    }
    if (assignedLane === -1) {
      assignedLane = lanes.length;
      lanes.push({ visEnd: item.visEnd });
    }
    return { ev: item.ev, start: item.start, end: item.end, lane: assignedLane };
  });

  // Pass 2: per-lane max heights → cumulative Y offsets from yBottom to yTop
  const laneMaxH = [];
  result.forEach(({ ev, lane }) => {
    const h = eventHeightPx(ev);
    if (laneMaxH[lane] === undefined || h > laneMaxH[lane]) laneMaxH[lane] = h;
  });

  const cumOffset = []; // cumOffset[i] = distance from yBottom to yTop of lane i
  let acc = 0;
  for (let i = 0; i < laneMaxH.length; i++) {
    acc += LANE_V_GAP + laneMaxH[i];
    cumOffset[i] = acc;
  }

  return result.map(item => ({ ...item, yOffset: cumOffset[item.lane] }));
}
