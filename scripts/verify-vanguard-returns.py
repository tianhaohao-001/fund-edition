"""Re-read the sponsor's quarterly NAV total-return tables. Requires pdfplumber.

Run with --pdf-dir to audit locally saved PDFs, or omit it to fetch the three
public profiles. An updated sponsor document must still contain our frozen range.
"""
import argparse
import hashlib
import json
import re
import tempfile
from contextlib import nullcontext
from pathlib import Path
from urllib.request import Request, urlopen

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/investment-profiles/"
FUNDS = {"VWELX": "0021", "VYM": "0923", "VCIT": "3146"}
QUARTERS = ("03-31", "06-30", "09-30", "12-31")
OUTPUT = ROOT / "web" / "catalog-vanguard-returns.mjs"


def table(path, ticker):
    marker = "Quarterly Returns: Investor Shares" if ticker == "VWELX" else "Quarterly Returns"
    with pdfplumber.open(path) as doc:
        for page in doc.pages:
            text = page.extract_text() or ""
            if marker in text:
                text = text.split(marker, 1)[1].split("Quarterly Returns", 1)[0]
                break
        else:
            raise ValueError(f"Required table absent from {path}")
    values = {}
    for line in text.splitlines():
        # The oldest row sometimes bears a superscript footnote joined to the year.
        match = re.match(r"^(20\d\d)(?:[12])?\s+(.+)$", line)
        if not match:
            continue
        year = int(match[1])
        fields = match[2].split()
        if 2016 <= year <= 2026:
            for suffix, field in zip(QUARTERS, fields[:4], strict=True):
                date = f"{year}-{suffix}"
                if date <= "2026-09-30":
                    values[date] = float(field.rstrip("%"))
            if 2016 <= year <= 2025:
                compound = 1
                for suffix in QUARTERS:
                    compound *= 1 + values[f"{year}-{suffix}"] / 100
                reported = float(fields[4].rstrip("%"))
                if abs((compound - 1) * 100 - reported) > .04:
                    raise ValueError(f"{ticker}/{year}: quarterly compound differs from annual column")
    if len(values) != 43:
        raise ValueError(f"{ticker}: expected 43 contiguous quarters, found {len(values)}")
    return values


def extract(folder):
    values = {ticker: table(folder / (fund + ".pdf"), ticker) for ticker, fund in FUNDS.items()}
    if len({tuple(sorted(series)) for series in values.values()}) != 1:
        raise ValueError("Fund calendars differ")
    rows = [[date, *[series[date] for series in values.values()]] for date in sorted(values["VWELX"])]
    header = "// Issuer-reported quarterly NAV total returns in percent, including distributions.\n// Columns: quarter end, VWELX, VYM, VCIT. Reproduce with scripts/verify-vanguard-returns.py.\n"
    return header + "export const QUARTERLY_RETURNS = [\n" + "".join(
        "  " + json.dumps(row, ensure_ascii=False) + ",\n" for row in rows
    ) + "];\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf-dir", type=Path)
    parser.add_argument("--write", action="store_true", help="replace frozen table after review")
    options = parser.parse_args()
    with (nullcontext(options.pdf_dir) if options.pdf_dir else tempfile.TemporaryDirectory()) as work:
        folder = options.pdf_dir or Path(work)
        for ticker, fund in FUNDS.items():
            path = folder / (fund + ".pdf")
            if options.pdf_dir is None:
                with urlopen(Request(BASE + fund + ".pdf", headers={"User-Agent": "Morrowfolio Research/1.0"}), timeout=30) as response:
                    path.write_bytes(response.read())
            print(ticker, hashlib.sha256(path.read_bytes()).hexdigest(), path.name)
        result = extract(folder)
        if options.write:
            OUTPUT.write_text(result, encoding="utf-8", newline="\n")
        elif OUTPUT.read_text(encoding="utf-8") != result:
            raise SystemExit("Published table differs from the PDFs. Review the source vintage before updating.")
        print("43 matched quarter ends spanning 2016 Q1 to 2026 Q3.")


if __name__ == "__main__":
    main()
