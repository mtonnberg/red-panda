#!/usr/bin/env python3
"""NEW, UNEXECUTED reconstruction helper; not the historical preparation program.

Reads Git/preserved source bytes and writes only an ignored diagnostic tree.
Does not install dependencies, build/load addons, or run browser/heap code.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def digest(data):
    return hashlib.sha256(data).hexdigest()


archive = Path(__file__).resolve().parent
root = archive.parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--phase", choices=["mapping", "snapshot", "direct"], default="mapping")
parser.add_argument("--output", default=".cache/heap-query-named")
args = parser.parse_args()
manifest = json.loads((archive / "manifest.json").read_text())
for entry in manifest["files"]:
    data = (archive / entry["path"]).read_bytes()
    if digest(data) != entry["sha256"]:
        raise SystemExit("Preserved source digest mismatch: " + entry["path"])

# The historical probe's relative imports/runners expect this exact tree name.
# Use a disposable checkout to preserve existing raw results and cache contents.
output = (root / args.output).resolve()
cache_root = root / ".cache"
if not output.is_relative_to(cache_root):
    raise SystemExit("Output must be within this checkout's ignored .cache directory")
if output.exists():
    raise SystemExit("Refusing to modify an existing tree; use a fresh disposable checkout")

prepared = {}
for entry in manifest["frozenFiles"]:
    source = entry["source"]
    if source.startswith("git:"):
        _, commit, name = source.split(":", 2)
        data = subprocess.check_output(["git", "show", commit + ":" + name], cwd=root)
    else:
        data = (archive / source).read_bytes()
    if digest(data) != entry["sha256"]:
        raise SystemExit("Frozen source digest mismatch: " + entry["path"])
    prepared["base/" + entry["path"]] = data

selected_probe = "probe-mapping-control.mjs" if args.phase == "mapping" else "probe.mjs"
for name in ["run-mapping.mjs", "run-snapshot.mjs", "run-direct.mjs", "direct-profiler.cc"]:
    prepared[name] = (archive / name).read_bytes()
prepared["probe.mjs"] = (archive / selected_probe).read_bytes()

# Import location ../../test/cdp-client.js is byte-pinned, never overwritten.
if (root / "test/cdp-client.js").read_bytes() != (archive / "cdp-client.js").read_bytes():
    raise SystemExit("Current CDP test helper differs; use the documented base checkout")

for name, data in prepared.items():
    target = output / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

print(json.dumps({"prepared": str(output), "phase": args.phase,
                  "files": len(prepared), "runtimeStarted": False,
                  "nativeBuildStarted": False,
                  "note": "Native binaries/dependencies still require explicit setup; see README.md"}))
