import {
  startOfYear, startOfMonth, startOfWeek, startOfDay, startOfHour,
  addYears, addMonths, addWeeks, addDays, addHours, addMinutes,
  format, eachYearOfInterval, eachMonthOfInterval,
} from 'date-fns';

// ── Breakpoints by pixels-per-millisecond ────────────────────────────────────
// Each level has: id, majorStep(fn), minorStep(fn), majorLabel, minorLabel
//   pxPerMs threshold: above this value → use this level
const LEVELS = [
  {
    id: 'years',
    minPxPerMs: 0,
    major: { unit: 'year', step: 1, fmt: 'yyyy', floor: startOfYear, add: addYears },
    minor: { unit: 'month', step: 3, fmt: 'MMM', floor: startOfMonth, add: addMonths },
  },
  {
    id: 'months',
    minPxPerMs: 1 / (1000 * 3600 * 24 * 30), // ~1 px per 30 days
    major: { unit: 'month', step: 1, fmt: 'MMMM yyyy', floor: startOfMonth, add: addMonths },
    minor: { unit: 'week', step: 1, fmt: 'd', floor: (d) => startOfWeek(d, { weekStartsOn: 1 }), add: addWeeks },
  },
  {
    id: 'weeks',
    minPxPerMs: 1 / (1000 * 3600 * 24 * 7),  // ~1 px per week
    major: { unit: 'week', step: 1, fmt: "'W'w · MMM yyyy", floor: (d) => startOfWeek(d, { weekStartsOn: 1 }), add: addWeeks },
    minor: { unit: 'day', step: 1, fmt: 'EEE d', floor: startOfDay, add: addDays },
  },
  {
    id: 'days',
    minPxPerMs: 1 / (1000 * 3600 * 24),      // ~1 px per day
    major: { unit: 'day', step: 1, fmt: 'EEE, MMM d', floor: startOfDay, add: addDays },
    minor: { unit: 'hour', step: 6, fmt: 'HH:mm', floor: startOfHour, add: addHours },
  },
  {
    id: 'hours',
    minPxPerMs: 1 / (1000 * 3600),            // ~1 px per hour
    major: { unit: 'day', step: 1, fmt: 'EEE, MMM d', floor: startOfDay, add: addDays },
    minor: { unit: 'hour', step: 1, fmt: 'HH:mm', floor: startOfHour, add: addHours },
  },
  {
    id: 'minutes',
    minPxPerMs: 1 / (1000 * 60 * 15),         // ~1 px per 15 min
    major: { unit: 'hour', step: 1, fmt: 'HH:mm', floor: startOfHour, add: addHours },
    minor: { unit: 'minute', step: 15, fmt: ':mm', floor: (d) => { const m = new Date(d); m.setMinutes(Math.floor(m.getMinutes()/15)*15,0,0); return m; }, add: addMinutes },
  },
];

function pickLevel(pxPerMs) {
  let chosen = LEVELS[0];
  for (const level of LEVELS) {
    if (pxPerMs >= level.minPxPerMs) chosen = level;
  }
  return chosen;
}

function generateTicks(viewStart, viewEnd, stepCfg, maxTicks = 200) {
  const ticks = [];
  let current = stepCfg.floor(new Date(viewStart));
  // Ensure we start at or before viewStart
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
  const level = pickLevel(pxPerMs);

  const majorTicks = generateTicks(viewStart, viewEnd, level.major).map(t => ({
    t,
    label: format(new Date(t), level.major.fmt),
    isMajor: true,
  }));

  const minorTicks = generateTicks(viewStart, viewEnd, level.minor).map(t => ({
    t,
    label: format(new Date(t), level.minor.fmt),
    isMajor: false,
  }));

  return { majorTicks, minorTicks, level: level.id };
}

export function tToX(t, viewStart, viewEnd, svgWidth) {
  return ((t - viewStart) / (viewEnd - viewStart)) * svgWidth;
}

export function xToT(x, viewStart, viewEnd, svgWidth) {
  return viewStart + (x / svgWidth) * (viewEnd - viewStart);
}
