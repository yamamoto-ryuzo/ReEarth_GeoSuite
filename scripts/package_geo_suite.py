#!/usr/bin/env python3
"""
Package the geo_suite folder into a ZIP suitable for upload/use.
- Reads target folder (default: C:\\github\\ReEarth_GeoSuite\\geo_suite)
- Ensures ZIP has files at the root (no extra top-level folder)
- Excludes common dev artifacts and optional patterns from .geosuiteignore
- Outputs ZIP into ./artifacts/geo_suite.zip
"""

import argparse
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

DEFAULT_EXCLUDES = [
    'node_modules/',
    '.git/',
    '.vscode/',
    '.DS_Store',
    'Thumbs.db',
    'tmp/', 'temp/',
    'artifacts/',
    '**/*.map',
    '**/*.ts', '**/*.tsx',
    '**/__tests__/**', '**/tests/**', '**/test/**',
]

def glob_to_regex(pattern: str) -> re.Pattern:
    p = re.escape(pattern)
    p = re.sub(r'\\\\\*\\\\\\*', r'.*', p)   # ** -> .*
    p = re.sub(r'\\\\\*', r'[^/\\\\]*', p)     # * -> non-separator
    p = re.sub(r'\\\\\?', r'[^/\\\\]', p)      # ? -> single char
    if pattern.endswith('/'):
        p += r'.*'
    return re.compile(r'^' + p + r'$')

class Excluder:
    def __init__(self, patterns):
        self.regexes = [glob_to_regex(p) for p in patterns]
    def should_exclude(self, relpath: str) -> bool:
        relpath = relpath.replace('\\', '/')
        for rx in self.regexes:
            if rx.search(relpath):
                return True
        return False


def read_ignore_file(folder: Path, name: str) -> list[str]:
    fp = folder / name
    if not fp.exists():
        return []
    lines = []
    try:
        for line in fp.read_text(encoding='utf-8').splitlines():
            s = line.strip()
            if not s or s.startswith('#'):
                continue
            lines.append(s)
    except Exception:
        pass
    return lines


def validate_structure(root: Path) -> None:
    # Basic guidance: ensure there is some content; warn if nested single top-level dir
    entries = [p for p in root.iterdir() if not p.name.startswith('.')]
    if not entries:
        raise RuntimeError(f"No files found in: {root}")
    # If packaging Re:Earth plugin inside geo_suite, remind about root requirements
    reearth_yml = root / 'reearth.yml'
    index_js = root / 'index.js'
    if reearth_yml.exists() and not index_js.exists():
        print('[WARN] reearth.yml found without index.js at root. Ensure plugin files are at ZIP root.', file=sys.stderr)


def zip_folder(source: Path, dest_zip: Path, excluder: Excluder) -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        stage = Path(tmpdir)
        for path in source.rglob('*'):
            if path.is_dir():
                continue
            rel = path.relative_to(source).as_posix()
            if excluder.should_exclude(rel):
                continue
            tgt = stage / rel
            tgt.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, tgt)
        dest_zip.parent.mkdir(parents=True, exist_ok=True)
        with ZipFile(dest_zip, 'w', compression=ZIP_DEFLATED) as zf:
            for path in stage.rglob('*'):
                if path.is_dir():
                    continue
                arcname = path.relative_to(stage).as_posix()
                zf.write(path, arcname)


def main():
    parser = argparse.ArgumentParser(description='Package geo_suite folder into a ZIP')
    parser.add_argument('--source', '-s', default=str(Path('geo_suite').resolve()), help='Source folder to package')
    parser.add_argument('--output', '-o', default=str(Path('artifacts') / 'geo_suite.zip'), help='Output ZIP path')
    parser.add_argument('--ignore-file', default='.geosuiteignore', help='Optional ignore file name inside source')
    args = parser.parse_args()

    src = Path(args.source)
    if not src.exists() or not src.is_dir():
        print(f"Invalid source folder: {src}", file=sys.stderr)
        return 1

    validate_structure(src)

    patterns = DEFAULT_EXCLUDES + read_ignore_file(src, args.ignore_file)
    excluder = Excluder(patterns)

    out_zip = Path(args.output)
    zip_folder(src, out_zip, excluder)
    print(f"Created ZIP: {out_zip}")
    return 0

if __name__ == '__main__':
    sys.exit(main())
