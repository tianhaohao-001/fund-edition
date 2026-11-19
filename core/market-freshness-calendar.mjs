// Published NYSE regular and early closes. Outside the reviewed years freshness is unknown.
const closures = new Set([
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
  '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25',
]);
const shortened = new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
export const timeZone = 'America/New_York';
const nyTime = new Intl.DateTimeFormat('en-US', {
  timeZone, hourCycle:'h23', hour:'2-digit', minute:'2-digit', year:'numeric', month:'2-digit', day:'2-digit',
});
export function marketDay(now) {
  const p = Object.fromEntries(nyTime.formatToParts(now).map(({type,value}) => [type,value]));
  return { date: [p.year,p.month,p.day].join('-'), hour: Number(p.hour), minute:Number(p.minute) };
}
export function isSession(date) {
  const weekday = new Date(date+'T12:00:00Z').getUTCDay();
  return weekday > 0 && weekday < 6 && !closures.has(date);
}
export function closingMinute(date) {
  return date>='2026-01-01' && date<='2028-12-31' && isSession(date) ? (shortened.has(date)?13:16)*60 : null;
}
export function daysBefore(date, days) {
  return new Date(Date.parse(date+'T12:00:00Z') - days * 86_400_000).toISOString().slice(0,10);
}
export function expectedClose(now) {
  const {date,hour} = marketDay(now);
  if (date < '2026-01-01' || date > '2028-12-31') return null;
  if (isSession(date) && hour >= (shortened.has(date) ? 13 : 16)) return date;
  let candidate = daysBefore(date,1);
  while (!isSession(candidate)) candidate = daysBefore(candidate,1);
  return candidate;
}
export function quoteSession(stamp) {
  if (!stamp || !Number.isFinite(Date.parse(stamp))) return 'unknown';
  const { date,hour,minute } = marketDay(Date.parse(stamp));
  if (date < '2026-01-01' || date > '2028-12-31') return 'unknown';
  if (!isSession(date)) return 'outside-regular';
  const minutes = hour*60+minute;
  return minutes >= 570 && minutes < (shortened.has(date) ? 13 : 16)*60 ? 'regular' : 'outside-regular';
}
