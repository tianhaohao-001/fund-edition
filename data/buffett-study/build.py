"""Rebuild the original-accession evidence and public-domain EOD market slice."""

import argparse
import csv
from datetime import date, datetime, timedelta, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
from urllib.request import Request, urlopen
from zipfile import ZipFile
from zoneinfo import ZoneInfo


HERE = Path(__file__).resolve().parent
NY = ZoneInfo("America/New_York")
FIRST = "2016-12-30"
LAST = "2017-12-29"
MEETINGS = [FIRST, "2017-03-31", "2017-06-30", "2017-09-29"]
EARLY_CLOSE = {"2017-07-03", "2017-11-24"}
WIKI = "https://data.nasdaq.com/databases/WIKIP"
MIRROR = "https://www.kaggle.com/api/v1/datasets/download/marketneutral/quandl-wiki-prices-us-equites?datasetVersionNumber=1"
ARCHIVE_HASH = "adfd226694c6f3ec2c56b585d973764180a39a3ec516601721e90096dc1de94f"
FACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK0000866787.json"
SUB = "https://data.sec.gov/submissions/CIK0000866787-submissions-001.json"
FILES = [
    ("fy16", "0001193125-16-745160"), ("q1", "0001193125-16-793056"),
    ("q2", "0001193125-17-090804"), ("q3", "0001193125-17-203540"),
    ("fy17-release", "0001171843-17-005596"),
]
TAGS = {
    "sales": "SalesRevenueNet", "earnings": "NetIncomeLoss", "operating": "OperatingIncomeLoss",
    "cfo": "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    "capex": "PaymentsToAcquirePropertyPlantAndEquipment", "eps": "EarningsPerShareDiluted",
    "shares": "WeightedAverageNumberOfDilutedSharesOutstanding",
    "stock_tax": "ExcessTaxBenefitFromShareBasedCompensationFinancingActivities",
    "debt": "LongTermDebtNoncurrent", "cash": "CashAndCashEquivalentsAtCarryingValue",
}


def stamp(day, hour, minute=0):
    local = datetime.combine(date.fromisoformat(day), datetime.min.time(), NY)
    instant = local.replace(hour=hour, minute=minute).astimezone(timezone.utc)
    return instant.isoformat(timespec="seconds").replace("+00:00", "Z")


def download(cache, name, url):
    path = cache / name
    if not path.exists():
        headers = {"User-Agent": os.environ.get("SEC_USER_AGENT", "Fundroom Historical Research/1.0")}
        with urlopen(Request(url, headers=headers), timeout=180) as response, tempfile.NamedTemporaryFile(dir=cache, delete=False) as output:
            shutil.copyfileobj(response, output)
        Path(output.name).replace(path)
    return path


def prices(archive):
    with archive.open("rb") as opened:
        if hashlib.file_digest(opened, "sha256").hexdigest() != ARCHIVE_HASH:
            raise ValueError("Archive checksum mismatch. Expected the version-1 WIKI mirror.")
    bars = []
    with ZipFile(archive) as zipped, zipped.open("WIKI_PRICES.csv") as data:
        for row in csv.DictReader(io.TextIOWrapper(data, encoding="utf-8-sig")):
            if bars and row["ticker"] != "AZO":
                break
            day = row["date"]
            if row["ticker"] == "AZO" and FIRST <= day <= LAST:
                if float(row["ex-dividend"]) != 0 or float(row["split_ratio"]) != 1:
                    raise ValueError("A corporate action requires explicit ledger treatment.")
                bars.append(dict(date=day, openAt=stamp(day, 9, 30), closeAt=stamp(day, 13 if day in EARLY_CLOSE else 16),
                                 availableAt=stamp(day, 21, 15), sourceId="wiki",
                                 open=float(row["open"]), close=float(row["close"])))
    return sorted(bars, key=lambda b: b["date"])


def sec_sources(submissions):
    by_id = {}
    for sid, accession in FILES:
        idx = submissions["accessionNumber"].index(accession)
        primary = submissions["primaryDocument"][idx]
        doc = "exh_991.htm" if sid == "fy17-release" else primary
        url = f"https://www.sec.gov/Archives/edgar/data/866787/{accession.replace('-', '')}/{doc}"
        title = "AutoZone FY2017 preliminary results · 8-K Exhibit 99.1" if sid == "fy17-release" else f"AutoZone {submissions['form'][idx]} · {submissions['reportDate'][idx]}"
        by_id[sid] = dict(id=sid, title=title, url=url, accession=accession,
                          periodEnd="2017-08-26" if sid == "fy17-release" else submissions["reportDate"][idx],
                          availableAt=submissions["acceptanceDateTime"][idx], form=submissions["form"][idx])
    return by_id


def fact(facts, accession, metric, start, end):
    unit = {"shares": "shares", "eps": "USD/shares"}.get(metric, "USD")
    candidates = facts[TAGS[metric]]["units"][unit]
    values = {x["val"] for x in candidates if x["accn"] == accession and x.get("start") == start and x["end"] == end}
    if len(values) != 1:
        raise ValueError(f"Ambiguous or absent {accession} {metric} {start}..{end}: {values}")
    return values.pop()


def field(label, value, unit, start, end, source_ids, sources, formula=None):
    most_recent = max((sources[sid] for sid in source_ids), key=lambda s: s["availableAt"])
    record = dict(label=label, value=round(value, 5), unit=unit, periodStart=start, periodEnd=end,
                  sourceId=most_recent["id"], sourceIds=source_ids, availableAt=most_recent["availableAt"])
    if formula:
        record["formula"] = formula
    return record


def quarter_facts(facts, sources, sid, previous_end, weeks):
    end = sources[sid]["periodEnd"]
    start = str(date.fromisoformat(previous_end) + timedelta(days=1))
    sources_both = ["fy16", sid]
    annual, current, prior = {}, {}, {}
    for metric in ("sales", "operating", "earnings", "cfo", "capex", "shares"):
        annual[metric] = fact(facts, sources["fy16"]["accession"], metric, "2015-08-30", "2016-08-27")
        current[metric] = fact(facts, sources[sid]["accession"], metric, "2016-08-28", end)
        prior[metric] = fact(facts, sources[sid]["accession"], metric, "2015-08-30", previous_end)
    # The latest 10-Q's prior-year CFO has already been reclassified under ASU 2016-09.
    # Translate the original FY16 10-K to that basis using its own financing line, known at decision time.
    annual["cfo"] += fact(facts, sources["fy16"]["accession"], "stock_tax", "2015-08-30", "2016-08-27")
    trailing = {k: annual[k] + current[k] - prior[k] for k in annual if k != "shares"}
    shares = (52 * annual["shares"] + weeks * (current["shares"] - prior["shares"])) / 52
    bridge = "Prior filed 52 weeks plus current fiscal YTD minus the prior-year comparable YTD."
    cfo_bridge = bridge+" Reclassify the FY16 10-K's $63.731m financing tax benefit into CFO to match the 10-Q comparatives under ASU 2016-09."
    def t(label, value, unit, formula=bridge):
        return field(label, value, unit, start, end, sources_both, sources, formula)
    def latest(label, metric):
        return field(label, fact(facts, sources[sid]["accession"], metric, None, end)/1e6, "USD million", end, end, [sid], sources)
    return [
        t("Trailing 52-week revenue", trailing["sales"]/1e6, "USD million"),
        t("Trailing 52-week operating margin", 100*trailing["operating"]/trailing["sales"], "%", bridge+" Operating income divided by sales."),
        t("Trailing 52-week net income", trailing["earnings"]/1e6, "USD million"),
        t("Trailing 52-week weighted average diluted shares (estimate)", shares/1e6, "million shares", "52-week weighted share count bridged by fiscal YTD weeks; filed values are rounded."),
        t("Trailing 52-week diluted earnings per share (estimate)", trailing["earnings"]/shares, "USD/share", "Bridged trailing net income divided by estimated trailing weighted average diluted shares."),
        t("Trailing 52-week cash from continuing operations", trailing["cfo"]/1e6, "USD million", cfo_bridge),
        t("Trailing 52-week capital spending, including growth spending", trailing["capex"]/1e6, "USD million"),
        t("Trailing 52-week free cash flow proxy; maintenance capex is undisclosed", (trailing["cfo"]-trailing["capex"])/1e6, "USD million", cfo_bridge+" Operating cash flow less total purchases of property and equipment."),
        latest("Noncurrent long-term debt at period end", "debt"), latest("Cash and equivalents at period end", "cash"),
        field(f"Sales growth, latest {weeks} fiscal weeks versus prior comparable period", 100*(current["sales"]/prior["sales"]-1), "%", "2016-08-28", end, [sid], sources),
        field("Latest audited full-year diluted earnings per share", fact(facts,sources["fy16"]["accession"],"eps","2015-08-30","2016-08-27"),"USD/share","2015-08-30","2016-08-27",["fy16"],sources),
    ]


def annual_release(sources, previous):
    # Issuer tables in 8-K Exhibit 99.1. Figures are in millions except EPS, percentages and share counts.
    sid = "fy17-release"
    start, end = "2016-08-28", "2017-08-26"
    def row(label, value, unit, instant=False):
        return field(label, value, unit, end if instant else start, end, [sid], sources)
    results = [
        row("Latest 52-week revenue, preliminary", 10888.676, "USD million"),
        row("Latest 52-week operating margin, preliminary", 100*2080.069/10888.676, "%"),
        row("Latest 52-week net income, preliminary", 1280.869, "USD million"),
        row("Latest 52-week weighted average diluted shares, preliminary", 29.065, "million shares"),
        row("Latest 52-week GAAP diluted earnings per share, preliminary", 44.07, "USD/share"),
        row("Latest 52-week capital spending, including growth spending", 553.832, "USD million"),
        row("Total debt at period end", 5081.238, "USD million", True),
        row("Cash and equivalents at period end", 293.270, "USD million", True),
        row("Net sales growth versus the prior full year", 2.4, "%"),
        row("Domestic same-store sales growth versus the prior full year", 0.5, "%"),
        row("Tax-accounting benefit included in latest 52-week diluted earnings per share", 1.03, "USD/share"),
    ]
    old_proxy = next(x for x in previous if "free cash flow proxy" in x["label"])
    results.append({**old_proxy, "label":"Previous filing's trailing 52-week free cash flow proxy, lagged one fiscal quarter; maintenance capex is undisclosed"})
    return results


def build(cache):
    cache.mkdir(exist_ok=True, parents=True)
    facts = json.loads(download(cache, "facts.json", FACTS).read_bytes())["facts"]["us-gaap"]
    sources = sec_sources(json.loads(download(cache, "sub.json", SUB).read_bytes()))
    bars = prices(download(cache, "wiki.zip", MIRROR))
    lookup = {x["date"]: x for x in bars}
    snapshots = []
    previous = []
    periods = [("q1","2015-11-21",12),("q2","2016-02-13",24),("q3","2016-05-07",36)]
    for i, day in enumerate(MEETINGS):
        evidence = quarter_facts(facts, sources, *periods[i]) if i < 3 else annual_release(sources, previous)
        for n, e in enumerate(evidence, 1):
            e["id"] = f"r{i+1}-e{n:02d}"
        observed = lookup[day]
        source_ids = list(dict.fromkeys(s for row in evidence for s in row["sourceIds"]))
        snapshots.append(dict(id=f"r{i+1}", asOf=stamp(day, 22), closeAt=observed["closeAt"], close=observed["close"],
                              closeAvailableAt=stamp(day, 21, 15), closeSourceId="wiki", evidence=evidence, sourceIds=[*source_ids, "wiki"]))
        previous = evidence
    methods = [
        dict(id="owner-earnings", title="Berkshire Hathaway 1986 shareholder letter · owner earnings appendix", url="https://www.berkshirehathaway.com/letters/1986.html",
             letterDate="1987-02-27", principle="Consider cash required to maintain the business, including maintenance investment and necessary working capital. Total capital expenditure includes possible growth spending."),
        dict(id="price-and-value", title="Berkshire Hathaway 1992 shareholder letter · investment valuation", url="https://www.berkshirehathaway.com/letters/1992.html",
             letterDate="1993-03-01", principle="Consider long-term cash generation and uncertainty. Demand a margin between a conservatively estimated value and the price paid."),
    ]
    return dict(schemaVersion=1, dataRevision="2017-asu2016-09.1", priceSourceId="wiki", security=dict(ticker="AZO", name="AutoZone, Inc.", currency="USD", exchange="NYSE"),
                methodSources=methods, sources=[*sources.values(), dict(id="wiki", title="Nasdaq Data Link · WIKI Prices (public domain)",url=WIKI,
                mirror=MIRROR, archiveSha256=ARCHIVE_HASH, vintage="Discontinued source's archived observations, not an archived daily first-release feed.")],
                design=dict(start=MEETINGS[0], end=LAST, timeZone="America/New_York", fundUniverse=["AZO", "USD cash"],
                    selection="One established specialist retailer with public filings available before the first decision. Calendar 2017 is the last complete calendar year of the discontinued WIKI database. The case does not test stock selection across a universe.",
                    review="Last NYSE session of each prior calendar quarter, 22:00 Eastern; execute at the next session opening print.",
                    benchmark="Buy and hold the identical security from the first executable open. Apply identical cost, cash and fill conventions.",
                    marketData="Raw USD opening and closing prices. Date/time stamps denote scheduled NYSE regular session boundaries. Feed documentation gives 21:15 Eastern as weekday update time; first-publication receipts per bar are unavailable.",
                    corporateActions="All sampled WIKI ex-dividend fields are zero and split factors equal one. No adjustment required.",
                    missingMarketDates=["2017-11-08"], gapTreatment="Feed omits one regular session, November 8. Skip its valuation; no interpolation. No decision, fill or endpoint is on that date.",
                    pretraining="Ticker, dates and source URLs can be withheld from model inputs. Recognition from public training data cannot be excluded."),
                snapshots=snapshots, bars=bars)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir())/"fundroom-buffett-2017")
    parser.add_argument("--out", type=Path, default=HERE/"history.json")
    args = parser.parse_args()
    args.out.write_bytes((json.dumps(build(args.cache), indent=2, ensure_ascii=False)+"\n").encode("utf-8"))
