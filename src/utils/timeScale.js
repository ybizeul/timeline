import {
  startOfYear, startOfMonth, startOfWeek, startOfDay, startOfHour,
  addYears, addMonths, addWeeks, addDays, addHours, addMinutes,
  getDay,
} from 'date-fns';
import { formatDate } from './locale';

// ── Target pixel spacing ────────────────────────────────────────────────────
const TARGET_MAJOR_PX = 160;
const TARGET_MINOR_PX = 50;

// ── Approximate durations in ms ─────────────────────────────────────────────
const MIN  = 60_000;
const HR   = 3_600_000;
const DAY  = 86_400_000;
const WEEK = 7 * DAY;
const MON  = 30 * DAY;
const YR   = 365 * DAY;

// ── Floor helpers ───────────────────────────────────────────────────────────
const floorWeek   = d => startOfWeek(d, { weekStartsOn: 1 });
const floor15     = d => { const m = new Date(d); m.setMinutes(Math.floor(m.getMinutes() / 15) * 15, 0, 0); return m; };
const floorHour2  = d => { const h = new Date(d); h.setHours(Math.floor(h.getHours() / 2) * 2, 0, 0, 0); return h; };
const floorHour6  = d => { const h = new Date(d); h.setHours(Math.floor(h.getHours() / 6) * 6, 0, 0, 0); return h; };
const floorHour12 = d => { const h = new Date(d); h.setHours(Math.floor(h.getHours() / 12) * 12, 0, 0, 0); return h; };
const floorDecade = d => { const y = new Date(d).getFullYear(); return new Date(y - (y % 10), 0, 1); };

// ── Candidate intervals (ascending duration) ────────────────────────────────
// Only human-meaningful gradations: 15min, 2h, 6h, 12h, day, week, month, year, decade
const INTERVALS = [
  { id: 'min15',  approxMs: 15 * MIN, step: 15, floor: floor15,      add: addMinutes, fmt: ':mm' },
  { id: 'hour2',  approxMs: 2 * HR,   step: 2,  floor: floorHour2,   add: addHours,   fmt: 'HH:mm' },
  { id: 'hour6',  approxMs: 6 * HR,   step: 6,  floor: floorHour6,   add: addHours,   fmt: 'HH:mm' },
  { id: 'hour12', approxMs: 12 * HR,  step: 12, floor: floorHour12,  add: addHours,   fmt: 'HH:mm' },
  { id: 'day',    approxMs: DAY,      step: 1,  floor: startOfDay,   add: addDays,    fmt: 'd' },
  { id: 'week',   approxMs: WEEK,     step: 1,  floor: floorWeek,    add: addWeeks,   fmt: 'd MMM' },
  { id: 'month',  approxMs: MON,      step: 1,  floor: startOfMonth, add: addMonths,  fmt: 'MMM' },
  { id: 'year',   approxMs: YR,       step: 1,  floor: startOfYear,  add: addYears,   fmt: 'yyyy' },
  { id: 'decade', approxMs: 10 * YR,  step: 10, floor: floorDecade,  add: addYears,   fmt: 'yyyy' },
];

// For each major, which minor intervals pair well
const PREFERRED_MINORS = {
  decade: ['year'],
  year:   ['month'],
  month:  ['week', 'day'],
  week:   ['day'],
  day:    ['hour2', 'hour6', 'hour12'],
  hour2:  [],
  hour6:  [],
  hour12: [],
  min15:  [],
};

// Context-dependent major label formats
const MAJOR_FMTS = {
  decade: 'yyyy',
  year:   'yyyy',
  month:  'MMMM yyyy',
  week:   "'W'w · MMM yyyy",
  day:    'EEE, MMM d',
  hour2:  'HH:mm',
  hour6:  'HH:mm',
  hour12: 'HH:mm',
  min15:  'HH:mm',
};

// Context-dependent minor label formats (avoids repeating info in major labels)
const MINOR_FMTS = {
  decade: { year:  'yyyy' },
  year:   { month: 'MMM' },
  month:  { week:  "'W'w", day: 'd' },
  week:   { day:   'EEE' },
  day:    { hour2: 'HH:mm', hour6: 'HH:mm', hour12: 'HH:mm', min15: 'HH:mm' },
};

function pickBest(pxPerMs, targetPx) {
  let best = INTERVALS[0];
  let bestScore = Infinity;
  for (const iv of INTERVALS) {
    const px = iv.approxMs * pxPerMs;
    const diff = Math.abs(px - targetPx);
    // Penalise intervals that are too dense (they produce too many ticks)
    const score = px < targetPx ? diff + targetPx * 0.3 : diff;
    if (score < bestScore) { bestScore = score; best = iv; }
  }
  return best;
}

function pickMinor(major, pxPerMs) {
  const ids = PREFERRED_MINORS[major.id] || [];
  const candidates = ids.map(id => INTERVALS.find(iv => iv.id === id)).filter(Boolean);
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestDiff = Infinity;
  for (const iv of candidates) {
    const diff = Math.abs(iv.approxMs * pxPerMs - TARGET_MINOR_PX);
    if (diff < bestDiff) { bestDiff = diff; best = iv; }
  }
  return best;
}

// ── Tick generation ─────────────────────────────────────────────────────────

function generateTicks(viewStart, viewEnd, stepCfg, maxTicks = 2000) {
  const ticks = [];
  let current = stepCfg.floor(new Date(viewStart));
  while (current.getTime() > viewStart) {
    current = new Date(current.getTime() - 1);
    current = stepCfg.floor(current);
  }
  let safety = 0;
  while (current.getTime() <= viewEnd && safety++ < maxTicks) {
    const t = current.getTime();
    if (t >= viewStart - 1) ticks.push(t);
    current = stepCfg.add(current, stepCfg.step);
  }
  return ticks;
}

export function getScaleTicks(viewStart, viewEnd, svgWidth) {
  const duration = viewEnd - viewStart;
  const pxPerMs = svgWidth / duration;

  let major = pickBest(pxPerMs, TARGET_MAJOR_PX);
  let minor;

  // When zoomed in enough that time intervals are picked as major,
  // promote day to major and demote time to minor
  if (major.id === 'hour2' || major.id === 'hour6' || major.id === 'hour12' || major.id === 'min15') {
    minor = major;
    major = INTERVALS.find(iv => iv.id === 'day');
  } else {
    minor = pickMinor(major, pxPerMs);
  }

  const majorFmt = MAJOR_FMTS[major.id] || major.fmt;

  // Use context-dependent minor format (avoids repeating info from major label)
  const minorFmt = (minor && MINOR_FMTS[major.id]?.[minor.id]) || minor?.fmt;

  // Expand major tick range to include boundary before viewport
  const majorStart = (minor?.id === 'hour2' || minor?.id === 'hour6' || minor?.id === 'hour12' || minor?.id === 'min15')
    ? viewStart - DAY
    : viewStart;

  const majorTicks = generateTicks(majorStart, viewEnd, major).map(t => ({
    t,
    label: formatDate(new Date(t), majorFmt),
    isMajor: true,
  }));

  const minorTicks = minor
    ? generateTicks(viewStart, viewEnd, minor).map(t => ({
        t,
        label: formatDate(new Date(t), minorFmt),
        isMajor: false,
      }))
    : [];

  // Sub-minor ticks: every hour when minor is hour2/hour6/hour12
  const hourlyInterval = INTERVALS.find(iv => iv.id === 'hour2');
  const subMinorTicks = (minor && (minor.id === 'hour2' || minor.id === 'hour6' || minor.id === 'hour12'))
    ? generateTicks(viewStart, viewEnd, { ...hourlyInterval, step: 1, floor: startOfHour })
        .filter(t => !minorTicks.some(mt => mt.t === t))
        .map(t => ({ t }))
    : [];

  return { majorTicks, minorTicks, subMinorTicks, level: major.id, minorLevel: minor?.id ?? null };
}

// ── Weekend range generation ────────────────────────────────────────────────

const WEEKEND_LEVELS = new Set(['day', 'week', 'month']);

export function getWeekendRanges(viewStart, viewEnd, level) {
  if (!WEEKEND_LEVELS.has(level)) return [];

  const ranges = [];
  // Start from the beginning of the day before viewStart to catch partial weekends
  let d = startOfDay(new Date(viewStart - DAY));

  while (d.getTime() <= viewEnd) {
    const dow = getDay(d); // 0=Sun, 6=Sat
    if (dow === 6) {
      // Saturday: weekend spans Sat 00:00 → Mon 00:00
      const satStart = d.getTime();
      const monStart = addDays(d, 2).getTime();
      ranges.push({
        start: Math.max(satStart, viewStart),
        end: Math.min(monStart, viewEnd),
      });
      d = addDays(d, 2); // skip to Monday
    } else {
      d = addDays(d, 1);
    }
  }
  return ranges;
}

export function tToX(t, viewStart, viewEnd, svgWidth) {
  return ((t - viewStart) / (viewEnd - viewStart)) * svgWidth;
}

export function xToT(x, viewStart, viewEnd, svgWidth) {
  return viewStart + (x / svgWidth) * (viewEnd - viewStart);
}

// ── Stable tick ranking (viewport-independent) ──────────────────────────────
// Returns a deterministic integer rank for a tick timestamp so that
// visibility decisions (rank % stride === 0) don't shift on scroll.

export function tickRank(t, intervalId) {
  switch (intervalId) {
    case 'min15': return Math.round(t / (15 * MIN));
    case 'hour2':  return Math.round(t / (2 * HR));
    case 'hour6':  return Math.round(t / (6 * HR));
    case 'hour12': return Math.round(t / (12 * HR));
    case 'day':   return Math.round(t / DAY);
    case 'week':  return Math.round(t / WEEK);
    case 'month': { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth(); }
    case 'year':  return new Date(t).getFullYear();
    case 'decade': return Math.floor(new Date(t).getFullYear() / 10);
    default: return 0;
  }
}

// ── Tick culling (stride-based, viewport-independent) ───────────────────────
const TICK_MIN_PX = 18;

export function cullTicks(ticks, toX, minPx, chPx, intervalId) {
  if (ticks.length === 0) return [];
  if (ticks.length === 1) {
    return [{ ...ticks[0], x: toX(ticks[0].t), showLabel: true, showTick: true }];
  }

  const firstX = toX(ticks[0].t);
  const lastX = toX(ticks[ticks.length - 1].t);
  const avgSpacingPx = Math.abs(lastX - firstX) / (ticks.length - 1);

  if (avgSpacingPx < 1) {
    return ticks.map(tick => ({ ...tick, x: toX(tick.t), showLabel: false, showTick: false }));
  }

  const maxLabelLen = Math.max(...ticks.map(t => t.label.length));
  const labelW = maxLabelLen * chPx + 10;
  const labelStride = Math.max(1, Math.ceil((labelW + minPx) / avgSpacingPx));
  const tickStride  = Math.max(1, Math.ceil(TICK_MIN_PX / avgSpacingPx));

  return ticks.map(tick => {
    const x = toX(tick.t);
    const rank = tickRank(tick.t, intervalId);
    return {
      ...tick,
      x,
      showLabel: rank % labelStride === 0,
      showTick:  rank % tickStride === 0,
    };
  });
}
