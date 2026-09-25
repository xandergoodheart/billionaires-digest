// New York time helpers without dependencies (DST-safe through Intl).
const TZ = 'America/New_York';
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
});

export function nyParts(d) {
  const o = {};
  for (const p of fmt.formatToParts(new Date(d))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, weekday: o.weekday };
}

// 'YYYY-MM-DD' of the given instant in New York
export function nyDate(d) {
  const p = nyParts(d);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

// 0 = Sunday ... 6 = Saturday, in New York
export function nyWeekday(d) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nyParts(d).weekday);
}

// New York wall-clock time -> Date. date 'YYYY-MM-DD', time 'HH:MM'
export function nyToUtc(date, time = '00:00') {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const want = Date.UTC(y, m - 1, d, h, mi);
  let guess = want + 5 * 3600e3;
  for (let i = 0; i < 3; i++) {
    const p = nyParts(guess);
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    if (seen === want) break;
    guess += want - seen;
  }
  return new Date(guess);
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
