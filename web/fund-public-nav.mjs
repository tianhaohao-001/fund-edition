// Filed financial highlights, checked against the named share series on 2026-11-18.
// Use each issuer's fiscal year-end label, including when it falls on a weekend.
// These are USD per-share NAV observations. Distributions are not reinvested.
const secArchives = 'https://www.sec.gov/Archives/edgar/data/';
const jpmorganReport = '1485894/000119312526385040/d153689dncsr.htm';

function fiscalNav(credit, filing, monthDay, annualValues) {
  return {
    kind: 'nav',
    unit: 'USD',
    basis: ['财年末每份净值','Fiscal year-end NAV per share'],
    credit,
    url: secArchives + filing,
    rows: annualValues.map(([year, value]) => [year + '-' + monthDay, value])
  };
}

export const publicEtfNav = {
  // ARK ETF Trust annual report, Financial Highlights, ARK Innovation ETF.
  ARKK: fiscalNav('ARK · SEC', '1579982/000121390026107605/ea0303638-01_ncsr.htm', '07-31', [
    [2022, 45.14], [2023, 50.42], [2024, 45.50], [2025, 75.22], [2026, 71.18]
  ]),
  // Krane Shares Trust annual report, Financial Highlights, IVOL, pp. 8–9.
  IVOL: fiscalNav('KraneShares · SEC', '1547576/000182912626006165/kraneshares_ncsr.htm', '03-31', [
    [2022, 25.53], [2023, 22.67], [2024, 18.96], [2025, 18.66], [2026, 18.64]
  ]),
  // J.P. Morgan ETF Trust annual report, Financial Highlights, pp. 62–65.
  // The first column of the continuation pages is NAV; the next is market price.
  JEPI: fiscalNav('J.P. Morgan · SEC', jpmorganReport, '06-30', [
    [2022, 55.45], [2023, 55.29], [2024, 56.71], [2025, 56.82], [2026, 56.51]
  ]),
  // JEPQ's first fiscal period started at inception on May 3, 2022.
  JEPQ: fiscalNav('J.P. Morgan · SEC', jpmorganReport, '06-30', [
    [2022, 45.46], [2023, 48.33], [2024, 55.47], [2025, 54.38], [2026, 61.48]
  ]),
  // PIMCO ETF Trust prospectus, audited Financial Highlights, pp. 140–141.
  BOND: fiscalNav('PIMCO · SEC', '1450011/000119312526433863/d78781d485bpos.htm', '06-30', [
    [2022, 95.16], [2023, 91.62], [2024, 91.03], [2025, 92.22], [2026, 92.13]
  ])
};
