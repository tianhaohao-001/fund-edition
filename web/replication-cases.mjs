import { analyzeDisclosures, DISCLOSURE_SCHEMA } from './replication-model.mjs';

function snapshot(reportDate, publicAt, source, values) {
  return { reportDate, publicAt, source, holdings: Object.entries(values).map(([symbol, weight]) => ({ symbol, weight })) };
}

export const SYNTHETIC_DISCLOSURES = {
  schemaVersion: DISCLOSURE_SCHEMA,
  fundName: 'Simulated Innovation Fund',
  snapshots: [
    snapshot('2026-06-30', '2026-07-13T15:00:00Z', 'Fundroom synthetic disclosure A', { NVDA: 22, MSFT: 19, TSLA: 17, AVGO: 16, CASH: 12 }),
    snapshot('2026-07-31', '2026-08-12T15:00:00Z', 'Fundroom synthetic disclosure B', { NVDA: 25, MSFT: 18, TSLA: 14, AVGO: 19, CASH: 13 }),
    snapshot('2026-08-31', '2026-09-14T15:00:00Z', 'Fundroom synthetic disclosure C', { NVDA: 21, MSFT: 18, TSLA: 10, AVGO: 24, AMD: 12, CASH: 10 }),
    snapshot('2026-07-31', '2026-09-21T15:00:00Z', 'Fundroom synthetic amendment B', { NVDA: 24, MSFT: 18, TSLA: 14, AVGO: 19, CASH: 13 }),
  ],
};

// Five lines transcribed from Part C, Item C.2 (% of fund net assets), rounded
// to six decimal places. This fixed basket is a subset, not total fund holdings.
// EDGAR provides filing and acceptance dates, not first availability on sec.gov.
// For these samples use noon UTC on the day after the same-day filing as a proxy.
export const ARK_DISCLOSURES = {
  schemaVersion: DISCLOSURE_SCHEMA,
  fundName: 'ARK Innovation ETF (ARKK) · five disclosed holdings',
  snapshots: [
    snapshot('2025-01-31', '2025-03-29T12:00:00Z', 'SEC NPORT-P 0001752724-25-073661', { TSLA: 13.423425, ROKU: 9.113741, COIN: 8.490562, RBLX: 6.677709, PLTR: 5.258863 }),
    snapshot('2025-04-30', '2025-06-26T12:00:00Z', 'SEC NPORT-P 0001752724-25-155354', { TSLA: 11.945545, ROKU: 7.782596, COIN: 7.893346, RBLX: 7.366681, PLTR: 8.277729 }),
    snapshot('2025-07-31', '2025-09-24T12:00:00Z', 'SEC NPORT-P 0000940400-25-002011', { TSLA: 9.813995, ROKU: 6.931581, COIN: 7.227083, RBLX: 7.126232, PLTR: 4.541898 }),
  ],
};

export const ARK_FILING_LINKS = Object.freeze({
  'SEC NPORT-P 0001752724-25-073661': 'https://www.sec.gov/Archives/edgar/data/1579982/000175272425073661/0001752724-25-073661-index.htm',
  'SEC NPORT-P 0001752724-25-155354': 'https://www.sec.gov/Archives/edgar/data/1579982/000175272425155354/0001752724-25-155354-index.htm',
  'SEC NPORT-P 0000940400-25-002011': 'https://www.sec.gov/Archives/edgar/data/1579982/000094040025002011/0000940400-25-002011-index.html',
});

export const ARK_STUDY_CUTOFF = '2025-07-15T16:00:00Z';

export function arkHoldingsStudy() {
  return analyzeDisclosures(ARK_DISCLOSURES, ARK_STUDY_CUTOFF);
}
