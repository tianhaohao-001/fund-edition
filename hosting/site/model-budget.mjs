const hour = 3_600_000;
const day = 24 * hour;

export function monthlyTaskLimit(env) {
  const raw = env.FUNDROOM_MODEL_30D_LIMIT;
  if (raw === undefined) return 300;
  if (!/^\d{1,4}$/.test(String(raw))) return 0;
  return Math.min(Number(raw), 3600);
}

// Embedded in each route's INSERT ... SELECT so both reservations use the same
// database snapshot. A failed/unknown provider result still counts as a task.
const total = `((SELECT COUNT(*) FROM calls WHERE billable=1 AND started>?) +
                (SELECT COUNT(*) FROM public_examples WHERE started>?))`;
export const modelBudgetWhere = `${total}<35 AND ${total}<120 AND ${total}<? AND
  ((SELECT COUNT(*) FROM calls WHERE billable=1 AND status='busy' AND started>?) +
   (SELECT COUNT(*) FROM public_examples WHERE status='busy' AND started>?))<4`;

export function modelBudgetArgs(now, env) {
  // Hard provider deadline is 65s. A stopped application leaves at most a short lease.
  const lease = now - 150_000;
  return [now-hour,now-hour, now-day,now-day, now-30*day,now-30*day,monthlyTaskLimit(env), lease,lease];
}
