#!/usr/bin/env python3
"""Explicit reviewed filesystem archive builder. No subprocess, service or Git control."""
from pathlib import Path, PurePosixPath
import argparse
import gzip
import hashlib
import io
import json
import os
import tarfile

TARGET = Path('/workspace/red-panda/proposals/xpath-declarative-shadow-r1')
ROOT = Path('/workspace/red-panda')
D = Path(__file__).resolve().parent

def need(ok, message):
    if not ok:
        raise RuntimeError(message)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def read(path, expected=None):
    path = Path(path)
    need(path.is_file() and not path.is_symlink(), 'Expected regular source: ' + str(path))
    value = path.read_bytes()
    if expected is not None:
        need(digest(value) == expected, 'Source digest drift: ' + str(path))
    return value

def load(path, expected=None):
    return json.loads(read(path, expected))

def encoded(value):
    return (json.dumps(value, indent=2) + '\n').encode()

def safe_relative(value):
    path = PurePosixPath(value)
    need(bool(value) and not path.is_absolute() and '..' not in path.parts and str(path) == value,
         'Noncanonical logical path: ' + value)
    need(not any(part in ('node_modules', '__pycache__', '.git') for part in path.parts), 'Forbidden logical path')
    return path

def verify_production(guard):
    source = load(guard['path'], guard['sha256'])
    expected = source[guard['key']]
    need(len(expected) == 657 and len(source['native18']) == 18, 'Installed inventory scope changed')
    actual = set()
    for scope in source['engineScopes']:
        path = ROOT / scope
        for item in (path.rglob('*') if path.is_dir() else [path]):
            need(not item.is_symlink(), 'Protected production symlink: ' + str(item))
            if item.is_file():
                actual.add(str(item.relative_to(ROOT)))
    need(actual == set(expected), 'Production inventory drift')
    for name, expected_hash in expected.items():
        read(ROOT / name, expected_hash)
    for name, expected_hash in source['native18'].items():
        read(ROOT / name, expected_hash)
    read(ROOT / 'native/runtime.cc', guard['CPP95'])
    return {'files': len(expected), 'nativeArtifacts': 18, 'sourceMapSHA256': guard['sha256'],
            'allExpectedBytesVerified': True, 'productionWritten': False}

parser = argparse.ArgumentParser()
parser.add_argument('--plan-manifest', required=True)
parser.add_argument('--manifest-sha', required=True)
parser.add_argument('--allowlist-sha', required=True)
parser.add_argument('--execute-reviewed-plan', action='store_true')
args = parser.parse_args()
need(args.execute_reviewed_plan, 'Explicit later Parent authorization required')
manifest_bytes = read(args.plan_manifest, args.manifest_sha)
manifest = json.loads(manifest_bytes)
need(digest(read(__file__)) == manifest['builderSHA256'], 'Reviewed builder drift')
plan_bytes = read(manifest['archivePlan']['path'], manifest['archivePlan']['sha256'])
plan = json.loads(plan_bytes)
need(plan['target'] == str(TARGET) and not TARGET.exists() and not TARGET.is_symlink(), 'Exact new target must be absent')
need(plan['futureHoles'] == [], 'Actual completed workflow receipts must be admitted by a reviewed successor; future holes remain')
need(args.allowlist_sha == manifest['allowlist']['sha256'] == plan['allowlistSHA256'], 'Reviewed allowlist differs')
allowlist_bytes = read(manifest['allowlist']['path'], args.allowlist_sha)
rows = json.loads(allowlist_bytes)
need(len(rows) == plan['logicalSources'], 'Logical-source count differs')
readme = read(manifest['readme']['path'], manifest['readme']['sha256'])
before = verify_production(plan['productionGuard'])
logical, blobs, origins = {}, {}, {}
for row in rows:
    name = str(safe_relative(row['target']))
    need(name not in logical, 'Duplicate logical target: ' + name)
    source = Path(row['source'])
    need(not source.resolve().is_relative_to(ROOT / 'proposals'), 'Protected proposal source forbidden')
    need(source.suffix not in ('.node', '.o', '.a', '.so', '.heapsnapshot', '.heapprofile'), 'Binary/private heap source forbidden')
    data = read(source, row['sha256'])
    need(len(data) == row['bytes'], 'Source size drift: ' + str(source))
    need(not data.startswith((b'\x7fELF', b'!<arch>\n', b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf')), 'Compiled source payload forbidden')
    h = row['sha256']
    need(h not in blobs or blobs[h] == data, 'Hash collision or inconsistent source bytes')
    blobs[h] = data
    logical[name] = {'sha256': h, 'bytes': len(data), 'blob': 'blobs/' + h, 'group': row['group']}
    origins.setdefault(row['source'], []).append(name)
need(len(blobs) == plan['uniqueContents'] and sum(map(len, blobs.values())) == plan['uniqueContentBytes'], 'Unique-content counts differ')
need(sum(row['bytes'] for row in rows) == plan['logicalBytes'], 'Logical byte count differs')
# No output exists until every declared original source and the production graph has verified.
need(TARGET.parent.is_dir() and not TARGET.parent.is_symlink(), 'Root/proposals parent must be an existing real directory')
TARGET.mkdir()
written = {}
def output(name, data):
    name = str(safe_relative(name))
    need(name not in written, 'Duplicate direct output: ' + name)
    path = TARGET / name
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as handle:
        handle.write(data)
    need(read(path) == data, 'Direct output byte readback failed: ' + name)
    written[name] = {'sha256': digest(data), 'bytes': len(data)}

output('README.md', readme)
output('allowlist.json', allowlist_bytes)
output('reviewed-plan.json', plan_bytes)
output('reviewed-manifest.json', manifest_bytes)
output('archive-builder.py', read(__file__, manifest['builderSHA256']))
output('archive-index.json', encoded({'format': 'sha256-blobs-v1', 'logicalMembers': logical, 'originalSourceToLogicalPaths': origins,
                                      'logicalSources': len(rows), 'uniqueContents': len(blobs), 'portableAliases': len(rows)-len(blobs)}))
for destination, member in plan['directFiles'].items():
    need(member in logical, 'Direct readable source not allowlisted: ' + member)
    output(destination, blobs[logical[member]['sha256']])
archive = TARGET / 'proofs.tar.gz'
with archive.open('xb') as physical:
    with gzip.GzipFile(filename='', mode='wb', fileobj=physical, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for h in sorted(blobs):
                data = blobs[h]
                member = tarfile.TarInfo('blobs/' + h)
                member.size, member.mode, member.mtime = len(data), 0o644, 0
                member.uid = member.gid = 0
                member.uname = member.gname = ''
                tar.addfile(member, io.BytesIO(data))
expected_members = {'blobs/' + h for h in blobs}
seen = {}
with tarfile.open(archive, mode='r:gz') as tar:
    for member in tar:
        need(member.isfile() and member.name in expected_members and member.name not in seen, 'Unexpected/duplicate archive member')
        stream = tar.extractfile(member)
        need(stream is not None, 'Unreadable archive member')
        data = stream.read()
        h = member.name.removeprefix('blobs/')
        need(data == blobs[h] and digest(data) == h and member.size == len(data), 'Decompressed byte verification failed')
        seen[member.name] = len(data)
need(set(seen) == expected_members, 'Missing decompressed member')
for name, value in logical.items():
    need(value['blob'] in seen and seen[value['blob']] == value['bytes'], 'Portable alias readback failed: ' + name)
# Verify original paths again, including aliases: no source drift may hide behind content deduplication.
for row in rows:
    data = read(row['source'], row['sha256'])
    need(len(data) == row['bytes'] and data == blobs[row['sha256']], 'Original byte readback drift')
after = verify_production(plan['productionGuard'])
need(before == after, 'Production guard changed during archive execution')
written['proofs.tar.gz'] = {'sha256': digest(read(archive)), 'bytes': archive.stat().st_size}
output('inventory.json', encoded({'directFilesExcludingThisInventoryAndReadback': written.copy(),
                                 'decompressedMembers': seen, 'logicalMemberPaths': sorted(logical)}))
output('readback.json', encoded({'state': 'EXACT_REVIEWED_ARCHIVE_BYTE_READBACK_COMPLETE', 'logicalSources': len(rows),
                                'uniqueContents': len(blobs), 'portableAliases': len(rows)-len(blobs),
                                'originalReadbackPasses': 2, 'allDecompressedMembersVerified': True,
                                'allLogicalPathsAndAliasesVerified': True, 'noExtractionUsed': True,
                                'productionBefore': before, 'productionAfter': after, 'outputFilesExcludingThisReport': written.copy(),
                                'partialOutputPolicy': 'Failure preserves any created output; never blind retry/overwrite'}))
actual_outputs = {str(p.relative_to(TARGET)) for p in TARGET.rglob('*') if p.is_file()}
need(actual_outputs == set(written), 'Exact output inventory differs')
for name, record in written.items():
    need(len(read(TARGET / name, record['sha256'])) == record['bytes'], 'Final direct path readback failed')
print(json.dumps({'state': 'VERIFIED', 'target': str(TARGET), 'logicalSources': len(rows), 'uniqueContents': len(blobs),
                  'archiveSHA256': written['proofs.tar.gz']['sha256'], 'readbackSHA256': written['readback.json']['sha256'],
                  'inventorySHA256': written['inventory.json']['sha256'], 'productionEngineWritten': False, 'proposalArchiveWritten': True}, indent=2))
