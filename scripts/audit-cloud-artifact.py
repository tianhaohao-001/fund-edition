"""Check the portable application archive without extracting it or printing file content."""

import argparse
import hashlib
import json
import re
import tarfile
from pathlib import Path


def check_archive(archive: Path, worker: Path) -> dict:
    root = Path(__file__).resolve().parent.parent
    migrations = "hosting/site/drizzle"
    journal = json.loads((root / migrations / "meta/_journal.json").read_text(encoding="utf-8"))
    allowed = {"Dockerfile", ".dockerignore", "railway.json", "README.md", "start.mjs", "site-worker.mjs",
               "hosting/site/direct-server.mjs", "hosting/site/visitors.mjs", "core/neural-reply-voice.py",
               f"{migrations}/meta/_journal.json"}
    allowed.update(f"core/{mod}.mjs" for mod in
                   ("accounts", "store", "team-activity", "studio-review", "local-voice", "stripe-billing", "paypal-billing", "invoice-membership", "market-freshness-calendar"))
    allowed.update(f"{migrations}/{entry['tag']}.sql" for entry in journal["entries"])
    signatures = [
        rb"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----",
        rb"(?<![A-Za-z0-9])(?:ghp_[A-Za-z0-9]{35,}|AKIA[A-Z0-9]{16}|sk-(?:proj-|live_)[A-Za-z0-9_-]{30,})",
        rb"(?:HARNESSROUTER_API_KEY|FUNDROOM_HR_KEY|APCA_API_SECRET_KEY)\s*[:=]\s*[\"'][A-Za-z0-9_-]{24,}[\"']",
    ]
    seen = set()
    compiled_hash = hashlib.sha256(worker.read_bytes()).hexdigest()
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle:
            name = member.name.removeprefix("./")
            if member.isdir():
                if name != "." and not any(p.startswith(name + "/") for p in allowed):
                    raise ValueError(f"unexpected directory: {name}")
                continue
            if not member.isfile() or name not in allowed or name in seen:
                raise ValueError(f"unexpected package entry: {name}")
            seen.add(name)
            content = bundle.extractfile(member).read()
            if any(re.search(pattern, content) for pattern in signatures):
                raise ValueError(f"credential signature in {name}")
            if name == "site-worker.mjs":
                if hashlib.sha256(content).hexdigest() != compiled_hash:
                    raise ValueError("packaged Worker differs from reviewed build")
                if any(marker in content for marker in (b"FUNDROOM_REVIEW_MARKET", b"market-review/etf-bars.json")):
                    raise ValueError("private market archive handling found in cloud Worker")
    if seen != allowed:
        raise ValueError(f"missing package entries: {sorted(allowed - seen)}")
    return {"fileCount": len(seen), "workerSHA256": compiled_hash,
            "archiveSHA256": hashlib.sha256(archive.read_bytes()).hexdigest(),
            "checked": ["expected files only", "no symlinks or duplicate members", "credential signatures",
                        "review-only data handler excluded", "Worker matches reviewed build"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--worker", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(check_archive(args.archive, args.worker), indent=2))
