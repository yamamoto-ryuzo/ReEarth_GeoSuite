#!/usr/bin/env python3
"""Build releases/geosuite-hub.zip — GeoSuite 専用ハブ配布物。

hub/ クレート（src/main.rs: geosuite-hub.exe・8514/8515・geosuite-hub://）を
cargo build --release でビルドし、プラグインの Ext 導線がダウンロードする
配布 ZIP（exe を ZIP ルートに配置・自己インストール型）を releases/ に作る。

配布 URL はリポジトリコミット済みの
https://raw.githubusercontent.com/yamamoto-ryuzo/ReEarth_GeoSuite/main/releases/geosuite-hub.zip
（layers-and-tiles-list.ts の HUB_DOWNLOAD_URL が参照）。

usage:
    python tools/build_hub.py [--no-build]
"""

import os
import subprocess
import sys
import zipfile

REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HUB_DIR = os.path.join(REPO_DIR, 'hub')
EXE = os.path.join(HUB_DIR, 'target', 'release', 'geosuite-hub.exe')
OUT = os.path.join(REPO_DIR, 'releases', 'geosuite-hub.zip')


def build(cargo=True):
    if cargo:
        subprocess.run(['cargo', 'build', '--release'], cwd=HUB_DIR, check=True)
    if not os.path.isfile(EXE):
        raise FileNotFoundError(
            'geosuite-hub.exe not found: {0} '
            '(cargo build --release in hub/)'.format(EXE))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(EXE, 'geosuite-hub.exe')
    print('built: {0}'.format(OUT))
    return OUT


if __name__ == '__main__':
    build(cargo='--no-build' not in sys.argv)
