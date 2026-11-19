export const DISCLOSURE_SCHEMA = 'fundroom.holdings.v1';

const LOOKBACK = 3;
const MAX_SNAPSHOTS = 60;
const MAX_POSITIONS = 500;
const ROUNDING_TOLERANCE = 1e-8;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_INSTANT = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;
const SYMBOL = /^[A-Z0-9][A-Z0-9._-]{0,29}$/u;

function label(value, limit, description) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    throw new Error(`${description} must be non-empty text of at most ${limit} characters.`);
  }
  return value.trim();
}

function isDay(value) {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(`${value}T`);
}

function instant(value, description) {
  const match = typeof value === 'string' && ISO_INSTANT.exec(value);
  if (!match || !isDay(match[1]) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${description} must be an ISO timestamp with an explicit time zone.`);
  }
  return new Date(value).toISOString();
}

function readSnapshot(snapshot, index) {
  const item = `Snapshot ${index + 1}`;
  if (!snapshot || !isDay(snapshot.reportDate)) throw new Error(`${item} needs a valid reportDate (YYYY-MM-DD).`);
  const publicAt = instant(snapshot.publicAt, `${item} publicAt`);
  if (publicAt.slice(0, 10) < snapshot.reportDate) throw new Error(`${item} cannot be public before its report date.`);
  if (!Array.isArray(snapshot.holdings) || snapshot.holdings.length > MAX_POSITIONS || !snapshot.holdings.length) {
    throw new Error(`${item} needs 1 to ${MAX_POSITIONS} holdings.`);
  }
  const holdings = new Map();
  for (const position of snapshot.holdings) {
    const symbol = typeof position?.symbol === 'string' ? position.symbol.trim().toUpperCase() : '';
    if (!SYMBOL.test(symbol) || holdings.has(symbol)) throw new Error(`${item} has an invalid or duplicate holding identifier.`);
    if (!Number.isFinite(position.weight) || position.weight < 0 || position.weight > 100) {
      throw new Error(`${item} weights must be numbers from 0 to 100.`);
    }
    holdings.set(symbol, position.weight);
  }
  const covered = [...holdings.values()].reduce((total, weight) => total + weight, 0);
  if (covered <= 0 || covered > 100 + ROUNDING_TOLERANCE) {
    throw new Error(`${item} must cover more than 0% and at most 100% of net assets.`);
  }
  return {
    source: label(snapshot.source, 200, `${item} source`),
    reportDate: snapshot.reportDate,
    publicAt,
    holdings,
    covered: Math.min(100, covered),
  };
}

export function validateDisclosures(input) {
  if (input?.schemaVersion !== DISCLOSURE_SCHEMA) throw new Error(`Use schemaVersion "${DISCLOSURE_SCHEMA}".`);
  const fundName = label(input.fundName, 100, 'Fund name');
  if (!Array.isArray(input.snapshots) || input.snapshots.length > MAX_SNAPSHOTS || !input.snapshots.length) {
    throw new Error(`Provide 1 to ${MAX_SNAPSHOTS} disclosure snapshots.`);
  }
  const snapshots = input.snapshots.map(readSnapshot).sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.publicAt.localeCompare(b.publicAt));
  const versions = new Set();
  for (const { reportDate, publicAt } of snapshots) {
    const version = `${reportDate}|${publicAt}`;
    if (versions.has(version)) throw new Error('A report date and public timestamp can identify only one version.');
    versions.add(version);
  }
  return { fundName, snapshots };
}

function concentration(weights) {
  const equityWeights = [...weights].filter(([symbol]) => symbol !== 'CASH').map(([, weight]) => weight).sort((a, b) => b - a);
  return { largest: equityWeights[0] ?? 0, topThree: equityWeights.slice(0, 3).reduce((total, weight) => total + weight, 0) };
}

export function analyzeDisclosures(input, decisionTime) {
  const { fundName, snapshots } = validateDisclosures(input);
  const decisionAt = instant(decisionTime, 'Decision time');
  const decisionDate = decisionAt.slice(0, 10);
  const knownVersions = new Map();
  for (const snapshot of snapshots) {
    if (snapshot.reportDate <= decisionDate && snapshot.publicAt <= decisionAt) knownVersions.set(snapshot.reportDate, snapshot);
  }
  const training = [...knownVersions.values()].slice(-LOOKBACK);
  if (!training.length) return { fundName, decisionAt, training, holdout: null };

  const model = new Map();
  for (const { holdings } of training) {
    for (const [symbol, weight] of holdings) model.set(symbol, (model.get(symbol) ?? 0) + weight / training.length);
  }
  const holdout = snapshots.find(snapshot => snapshot.reportDate > decisionDate && snapshot.publicAt > decisionAt) ?? null;
  const modelCovered = Math.min(100, [...model.values()].reduce((total, weight) => total + weight, 0));
  const knownSymbols = new Set([...model.keys(), ...(holdout?.holdings.keys() ?? [])]);
  const rows = [...knownSymbols].map(symbol => {
    const modelWeight = model.get(symbol) ?? null;
    const disclosedWeight = holdout?.holdings.get(symbol) ?? null;
    return { symbol, modelWeight, disclosedWeight, delta: holdout ? (modelWeight ?? 0) - (disclosedWeight ?? 0) : null };
  }).sort((a, b) => holdout
    ? Math.abs(b.delta) - Math.abs(a.delta) || a.symbol.localeCompare(b.symbol)
    : b.modelWeight - a.modelWeight || a.symbol.localeCompare(b.symbol));
  let comparison = null;
  if (holdout) {
    const knownOverlap = rows.reduce((sum, row) => sum + Math.min(row.modelWeight ?? 0, row.disclosedWeight ?? 0), 0);
    const gap = rows.reduce((sum, row) => sum + Math.abs(row.delta), 0);
    comparison = {
      knownOverlap,
      bucketedDistance: (gap + Math.abs(modelCovered - holdout.covered)) / 2,
      modelOnly: rows.filter(({ modelWeight, disclosedWeight }) => modelWeight > 0 && disclosedWeight === null).length,
      holdoutOnly: rows.filter(({ modelWeight, disclosedWeight }) => modelWeight === null && disclosedWeight > 0).length,
      concentration: concentration(holdout.holdings),
    };
  }
  return { fundName, decisionAt, training, holdout, rows, modelCovered, modelConcentration: concentration(model), comparison };
}
