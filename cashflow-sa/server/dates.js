// Calendar dates are plain 'YYYY-MM-DD' strings in the business timezone.

export function todayIn(timeZone, now = new Date()) {
  // 'en-CA' formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const toUtc = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDays(ymd, n) {
  const dt = new Date(toUtc(ymd) + n * 86400000);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd, toYmd) {
  return Math.round((toUtc(toYmd) - toUtc(fromYmd)) / 86400000);
}

export function isValidYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return addDays(s, 0) === s;
}
