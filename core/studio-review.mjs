import { daysBefore, expectedClose, isSession } from './market-freshness-calendar.mjs';

// These dated, read-only marks never feed the replay engine or its order policy.
export function openStudioMarks(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS studio_observation_books (
      workspace TEXT NOT NULL REFERENCES demo_sessions(session_id) ON DELETE CASCADE,
      fund TEXT NOT NULL, first_seen TEXT NOT NULL, PRIMARY KEY(workspace, fund)
    );
    CREATE TABLE IF NOT EXISTS studio_closes (
      workspace TEXT NOT NULL REFERENCES demo_sessions(session_id) ON DELETE CASCADE,
      fund TEXT NOT NULL, day TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(workspace, fund, day)
    );
  `);
  const add = db.prepare('INSERT OR IGNORE INTO studio_observation_books VALUES (?,?,?)');
  const started = db.prepare('SELECT first_seen FROM studio_observation_books WHERE workspace=? AND fund=?');
  const freeze = db.prepare('INSERT OR IGNORE INTO studio_closes VALUES (?,?,?,?)');
  const get = db.prepare('SELECT record FROM studio_closes WHERE workspace=? AND fund=? AND day=?');
  const moveBooks = db.prepare('UPDATE studio_observation_books SET workspace=? WHERE workspace=?');
  const moveCloses = db.prepare('UPDATE studio_closes SET workspace=? WHERE workspace=?');
  return {
    transfer(from, to) {
      moveBooks.run(to, from);
      moveCloses.run(to, from);
    },
    firstSeen(workspace, fund, now) {
      add.run(workspace, fund, now);
      return started.get(workspace, fund).first_seen;
    },
    read(workspace, fund, day) {
      const row = get.get(workspace, fund, day);
      return row ? JSON.parse(row.record) : null;
    },
    write(workspace, fund, mark) {
      freeze.run(workspace, fund, mark.date, JSON.stringify(mark));
    },
  };
}

function previousSession(date) {
  let day = daysBefore(date, 1);
  while (!isSession(day)) day = daysBefore(day, 1);
  return day;
}

function makeMark(date, book, readouts, now) {
  const positions = [];
  let valueCents = book.cashCents;
  for (const position of book.positions) {
    const observation = readouts.get(position.symbol);
    const close = observation?.recentCloses?.find(row => row.asOf === date);
    if (!close || !Number.isFinite(close.valueUsd) || close.valueUsd <= 0) return null;
    const priceCents = Math.round(close.valueUsd * 100);
    if (Math.abs(close.valueUsd * 100 - priceCents) > 0.000001) return null;
    valueCents += priceCents * position.quantity;
    positions.push({...position, priceCents, sourceUrl:observation.sourceUrl, retrievedAt:observation.retrievedAt});
  }
  if (!Number.isSafeInteger(valueCents)) return null;
  return {date, valueCents, cashCents:book.cashCents, positions, checkedAt:now, currency:'USD', basis:'unadjusted-close'};
}

export async function studioReview({workspace, fund, journal, readReference, checkCurrent, now = Date.now()}) {
  const nowIso = new Date(now).toISOString();
  const currentDay = expectedClose(now);
  const portfolio = fund.portfolio;
  const legacyCashCents = Number.isFinite(portfolio.cash) ? Math.round(portfolio.cash * 100) : null;
  const book = {
    cashCents:portfolio.cashCents ?? legacyCashCents,
    positions:portfolio.positions.map(({symbol,quantity}) => ({symbol,quantity})).sort((a,b)=>a.symbol.localeCompare(b.symbol)),
  };
  const report = {asOf:currentDay, previousDay:null, previous:null, current:null, changeCents:null, percent:null, status:'waiting-first-close'};
  if (!currentDay) return {...report,status:'calendar-unavailable'};
  const previousDay = previousSession(currentDay);
  report.previousDay = previousDay;
  const firstSeen = journal.firstSeen(workspace, fund.id, nowIso);
  const fill = fund.runs?.find(run => run.execution?.status === 'filled');
  const latestChange = fund.studioBookChangedAt ?? fill?.createdAt ?? fund.createdAt ?? firstSeen;
  const changeEpoch = Date.parse(latestChange);
  const beforeChange = Number.isFinite(changeEpoch) ? expectedClose(changeEpoch) : null;
  if (!beforeChange || currentDay <= beforeChange) return report;
  const dates = [previousDay, currentDay].filter(day => day > beforeChange);
  const marks = new Map(dates.map(day => [day, journal.read(workspace, fund.id, day)]));
  if (dates.some(day => !marks.get(day))) {
    const readings = new Map();
    if (!Number.isSafeInteger(book.cashCents) || book.cashCents < 0 ||
        book.positions.some(p => !Number.isSafeInteger(p.quantity) || p.quantity <= 0)) return {...report,status:'coverage'};
    await Promise.all(book.positions.map(async ({symbol}) => {
      try {
        const reading = await readReference(symbol, {studio:true});
        const price = reading.observations.find(row => row.symbol === symbol && row.provider === 'Nasdaq' &&
          row.currency === 'USD' && ['etf-close','stock-close'].includes(row.kind) && row.executionEligible === false &&
          row.status === 'current' && row.asOf === currentDay);
        if (price) readings.set(symbol,price);
      } catch { /* A missing symbol leaves the whole basket unmarked. */ }
    }));
    checkCurrent?.();
    for (const day of dates) {
      if (marks.get(day)) continue;
      const mark = makeMark(day, book, readings, nowIso);
      if (mark) {
        journal.write(workspace, fund.id, mark);
        marks.set(day, journal.read(workspace, fund.id, day));
      }
    }
  }
  report.current = marks.get(currentDay) ?? null;
  report.previous = marks.get(previousDay) ?? null;
  if (!report.current) return {...report,status:'coverage'};
  if (!report.previous) return {...report,status:dates.includes(previousDay) ? 'coverage' : 'waiting-second-close'};
  const signature = mark => JSON.stringify([mark.currency,mark.basis,mark.cashCents,mark.positions.map(p=>[p.symbol,p.quantity])]);
  if (signature(report.current) !== signature(report.previous)) return {...report,status:'changed-book'};
  const changeCents = report.current.valueCents - report.previous.valueCents;
  return {...report, changeCents, percent:report.previous.valueCents > 0 ? changeCents / report.previous.valueCents * 100 : null,
    status:changeCents > 0 ? 'gain' : changeCents < 0 ? 'loss' : 'flat'};
}
