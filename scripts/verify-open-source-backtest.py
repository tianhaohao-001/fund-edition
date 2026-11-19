"""Cross-check the Wellington paper strategy with the optional open-source bt engine."""

import argparse
import hashlib
import json
import math
import platform
import subprocess
from importlib.metadata import version
from pathlib import Path

import bt
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "web/catalog-vanguard-returns.mjs"
START = pd.Timestamp("2020-12-31")
END = pd.Timestamp("2026-09-30")
INITIAL = 10_000
WEIGHTS = {"VYM": 0.65, "VCIT": 0.35}
FEE = 0.0005
BT_VERSION = "1.4.1"
# The existing per-account historical integration test uses this dollar tolerance.
LEDGER_TOLERANCE_USD = 0.12


def node(*args):
    return subprocess.run(
        ["node", *args], cwd=ROOT, text=True, encoding="utf-8",
        capture_output=True, check=True,
    ).stdout


def quarter_returns():
    rows = json.loads(node("--input-type=module", "-e",
        "import {QUARTERLY_RETURNS} from './web/catalog-vanguard-returns.mjs';"
        "console.log(JSON.stringify(QUARTERLY_RETURNS))"))
    data = pd.DataFrame(rows, columns=["date", "VWELX", *WEIGHTS])
    data.index = pd.to_datetime(data.pop("date"))
    sample = data.loc[(data.index > START) & (data.index <= END)]
    expected = pd.date_range(START, END, freq="QE-DEC")[1:]
    if not sample.index.equals(expected) or sample.isna().any().any():
        raise ValueError("Expected one complete issuer row for each of the 23 quarters.")
    return sample


def commission(quantity, price):
    return abs(quantity * price) * FEE


def replay(returns):
    # Only the sleeve indices are passed into the external engine.
    prices = 100 * (1 + returns[list(WEIGHTS)] / 100).cumprod()
    prices.loc[START] = 100
    prices = prices.sort_index()
    strategy = bt.Strategy("Wellington proxy", [
        bt.algos.RunOnDate(*prices.index[:-1]),
        bt.algos.WeighSpecified(**WEIGHTS),
        bt.algos.Rebalance(),
    ])
    test = bt.Backtest(strategy, prices, initial_capital=INITIAL, integer_positions=False,
                       commissions=commission, progress_bar=False)
    test.run()
    account = test.strategy
    fills = []
    trades = account.get_transactions().reset_index()
    for row in trades.itertuples(index=False):
        fills.append({
            "date": row.Date.date().isoformat(), "symbol": row.Security,
            "unitsSigned": round(row.quantity, 10), "indexPrice": round(row.price, 10),
            "feeUsd": round(commission(row.quantity, row.price), 10),
        })
    values = account.values.reindex(prices.index)
    cash = account.cash.reindex(prices.index)
    fees = account.fees.reindex(prices.index)
    component_value = (account.positions.reindex(prices.index) * prices).sum(axis=1)
    if values.isna().any() or cash.isna().any() or fees.isna().any():
        raise ValueError("bt did not produce a complete set of account observations.")
    if (values - cash - component_value).abs().max() >= 1e-6 or cash.min() < -1e-6:
        raise ValueError("bt positions and cash do not reconcile to bt equity.")
    if not math.isclose(fees.sum(), sum(f["feeUsd"] for f in fills), abs_tol=1e-7):
        raise ValueError("Commission reconstruction differs from bt's fees.")
    if len(fills) != 46 or {f["date"] for f in fills} != {d.date().isoformat() for d in prices.index[:-1]}:
        raise ValueError("Expected two sleeve fills at each rebalance, none at the last mark.")
    points = [
        {"date": d.date().isoformat(), "equityUsd": round(values[d], 8),
         "cashUsd": round(cash[d], 8) or 0.0, "feesUsd": round(fees[d], 8)}
        for d in prices.index
    ]
    return points, fills, float(fees.sum())


def application_result():
    # This integration test runs the product's usual actions on a fresh in-memory paper account.
    tap = node("--test", "--test-reporter=tap", "test/replica-ledger.test.mjs")
    for line in tap.splitlines():
        if line.startswith("# {"):
            result = json.loads(line[2:])
            if result.get("mode") == "isolated API; hosted response fixture":
                return result
    raise ValueError("The product audit did not supply a ledger diagnostic.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Optional JSON evidence file")
    args = parser.parse_args()
    if version("bt") != BT_VERSION:
        raise SystemExit(f"This audit uses bt=={BT_VERSION}.")
    data = quarter_returns()
    curve, fills, fees = replay(data)
    benchmark = INITIAL * (1 + data["VWELX"] / 100).prod()
    product = application_result()
    gap = curve[-1]["equityUsd"] - product["closingEquity"]
    if len(data) != product["periods"] or len(fills) != product["trades"]:
        raise ValueError("Different holding period or trade count between the two engines.")
    if abs(benchmark - product["targetEquity"]) > 0.005:
        raise ValueError("The comparable original-fund series does not match.")
    if abs(gap) > LEDGER_TOLERANCE_USD:
        raise ValueError(f"The two closing account values differ by {gap:.4f} USD.")
    report = {
        "purpose": "Independent historical simulation of a fixed allocation; no model calls or broker orders.",
        "source": "https://github.com/pmorissette/bt",
        "versions": {name: version(name) for name in ("bt", "ffn", "pandas", "numpy")},
        "python": platform.python_version(),
        "issuerData": {"file": INPUT.relative_to(ROOT).as_posix(),
                       "sha256": hashlib.sha256(INPUT.read_bytes()).hexdigest(),
                       "unit": "quarterly NAV total return, distributions reinvested",
                       "benchmarkOnly": "VWELX"},
        "rules": {"startUsd": INITIAL, "startDate": str(START.date()), "endDate": str(END.date()),
                  "weights": WEIGHTS, "feeEachSideBps": 5, "fractionalResearchUnits": True,
                  "initialIndex": 100, "periods": len(data), "lastDateIsMarkOnly": True},
        "bt": {"closingEquityUsd": curve[-1]["equityUsd"], "feesUsd": round(fees, 8),
               "fills": fills, "curveAfterRebalancing": curve},
        "productLedger": {"closingEquityUsd": product["closingEquity"], "feesUsd": product["feeUSD"],
                          "fillCount": product["trades"], "cashUsd": product["finalCash"]},
        "comparison": {"btMinusProductUsd": round(gap, 8), "originalFundUsd": round(benchmark, 8),
                       "maxAcceptedClosingGapUsd": LEDGER_TOLERANCE_USD},
    }
    serialized = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if args.output:
        args.output.write_text(serialized, encoding="utf-8")
        print(json.dumps(report["comparison"]))
    else:
        print(serialized, end="")


if __name__ == "__main__":
    main()
