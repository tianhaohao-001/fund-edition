"""Pass the local competition credential to Fundroom's Node process."""

import ctypes
from ctypes import wintypes
import os
import subprocess
import sys


TARGET = "TradingResearchAgent/harnessrouter"
HOSTED_ORIGIN = "https://api.harnessrouter.ai"
FUNDROOM_MANAGER_ID = "chrn_642e1a7bf73e478686a90bb77fda796a"
PREVIOUS_MANAGER_ID = "chrn_600b0d5821df4138aed948db2fb86428"


class Credential(ctypes.Structure):
    _fields_ = [
        ("flags", wintypes.DWORD),
        ("kind", wintypes.DWORD),
        ("target", wintypes.LPWSTR),
        ("comment", wintypes.LPWSTR),
        ("last_written", wintypes.FILETIME),
        ("size", wintypes.DWORD),
        ("data", ctypes.POINTER(ctypes.c_ubyte)),
    ]


def read_key():
    vault = ctypes.WinDLL("advapi32", use_last_error=True)
    pointer = ctypes.POINTER(Credential)
    vault.CredReadW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(pointer)]
    vault.CredReadW.restype = wintypes.BOOL
    vault.CredFree.argtypes = [ctypes.c_void_p]
    vault.CredFree.restype = None
    entry = pointer()
    if not vault.CredReadW(TARGET, 1, 0, ctypes.byref(entry)):
        raise OSError(ctypes.get_last_error(), "Fundroom Windows credentials are unavailable")
    try:
        return ctypes.string_at(entry.contents.data, entry.contents.size).decode("utf-8").strip()
    finally:
        vault.CredFree(entry)


def main(argv):
    if os.name != "nt" or len(argv) < 2 or argv[0] != "--":
        print("Launch Fundroom with dev.ps1 -LiveHarness on Windows or supply the documented environment variables.", file=sys.stderr)
        return 2
    env = os.environ.copy()
    try:
        configured_id = env.get("HARNESSROUTER_HARNESS_ID") or FUNDROOM_MANAGER_ID
        use_vault = (env.get("FUNDROOM_PUBLIC_DEMO") != "true"
                     and env.get("HARNESSROUTER_BASE_URL", HOSTED_ORIGIN).rstrip("/") == HOSTED_ORIGIN
                     and configured_id in (FUNDROOM_MANAGER_ID, PREVIOUS_MANAGER_ID))
        if use_vault:
            try:
                key = read_key()
            except (OSError, ValueError):
                key = None
            if key:
                env.update(HARNESSROUTER_API_KEY=key, HARNESSROUTER_BASE_URL=HOSTED_ORIGIN,
                           HARNESSROUTER_HARNESS_ID=configured_id)
            else:
                print("Hosted credentials are unavailable. Open Connections in the app to configure the AI manager.", file=sys.stderr)
        return subprocess.run(argv[1:], env=env, check=False).returncode
    except (OSError, ValueError):
        print("Morrowfolio could not start Node. Check the runtime and connection configuration.", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
