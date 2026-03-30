// Browser-native locale formatting using Intl API.
// No date-fns locale imports needed — uses navigator.language directly.

const LANG = navigator?.language || 'en-US';

const monthFull = new Intl.DateTimeFormat(LANG, { month: 'long' });
const monthShort = new Intl.DateTimeFormat(LANG, { month: 'short' });
const weekdayShort = new Intl.DateTimeFormat(LANG, { weekday: 'short' });
const monthYear = new Intl.DateTimeFormat(LANG, { month: 'long', year: 'numeric' });
const monthShortYear = new Intl.DateTimeFormat(LANG, { month: 'short', year: 'numeric' });
const weekdayMonthDay = new Intl.DateTimeFormat(LANG, { weekday: 'short', month: 'short', day: 'numeric' });
const monthDay = new Intl.DateTimeFormat(LANG, { month: 'short', day: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat(LANG, { month: 'short', day: 'numeric', year: 'numeric' });

/** Format a Date using a format key (replaces date-fns format + locale). */
export function formatDate(date, key) {
  switch (key) {
    case 'yyyy':           return String(date.getFullYear());
    case 'MMMM yyyy':      return monthYear.format(date);
    case 'MMM yyyy':        return monthShortYear.format(date);
    case 'MMM':             return monthShort.format(date);
    case 'EEE':             return weekdayShort.format(date);
    case 'EEE, MMM d':      return weekdayMonthDay.format(date);
    case 'MMM d':            return monthDay.format(date);
    case 'MMM d, yyyy':      return monthDayYear.format(date);
    case 'HH:mm': {
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
    case ':mm':              return `:${String(date.getMinutes()).padStart(2, '0')}`;
    case 'd':                return String(date.getDate());
    case 'd MMM':            return monthDay.format(date);
    case "'W'w": {
      return `W${getISOWeek(date)}`;
    }
    case "'W'w · MMM yyyy":  return `W${getISOWeek(date)} · ${monthShortYear.format(date)}`;
    default:                 return date.toLocaleDateString(LANG);
  }
}

/** ISO week number */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
