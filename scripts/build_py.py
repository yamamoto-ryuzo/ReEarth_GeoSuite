#!/usr/bin/env python3
"""
ビルドと ZIP 作成を自動化する補助スクリプト（日本語コメント版）。

使い方:
  python scripts/build_py.py

このスクリプトの役割:
  1. 必要に応じて `prepare_default_inspector.js` を実行して `.ts` 内のデフォルトテキストを埋める
  2. TypeScript をコンパイル（`npx tsc -p geo_suite/tsconfig.json`）
  3. `geo_suite/build/` の成果物を `dist/` にコピー
  4. `release/` を作成して主要ファイルと `plugin/reearth.yml` をコピー
  5. `dist/artifacts/geo_suite.zip` を作成

注意: CI 環境では `npm run build` を推奨します。本スクリプトはローカル操作や簡易自動化用です。
"""
from __future__ import annotations
import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)


def run(cmd, check=True):
    # コマンドを日本語で表示して実行する
    print("実行: ", " ".join(cmd))
    res = subprocess.run(cmd, shell=False)
    if check and res.returncode != 0:
        raise SystemExit(res.returncode)


def main():
    try:
        # 1) prepare_default_inspector.js を実行（存在する場合）
        prep = ROOT / 'scripts' / 'prepare_default_inspector.js'
        if prep.exists():
            run([shutil.which('node') or 'node', str(prep)])
        else:
            print('prepare_default_inspector.js が見つかりません。スキップします。')

        # 2) TypeScript コンパイル
        print('TypeScript をコンパイルします: npx tsc -p geo_suite/tsconfig.json')
        run(['npx', 'tsc', '-p', 'geo_suite/tsconfig.json'])

        # 3) dist ディレクトリを準備して geo_suite/build の成果物をコピー
        dist = ROOT / 'dist'
        if dist.exists():
            shutil.rmtree(dist)
        dist.mkdir(parents=True, exist_ok=True)

        build_dir = ROOT / 'geo_suite' / 'build'
        if build_dir.exists():
            for p in build_dir.glob('*'):
                dest = dist / p.name
                if p.is_dir():
                    shutil.copytree(p, dest)
                else:
                    shutil.copy2(p, dest)
        else:
            print('警告: build ディレクトリが見つかりません:', str(build_dir))

        # HTML ファイルをコピー
        for fname in ('index.html', 'ryu.html'):
            src = ROOT / fname
            if src.exists():
                shutil.copy2(src, dist / src.name)

        # 画像ディレクトリをコピー
        img = ROOT / 'image'
        if img.exists():
            shutil.copytree(img, dist / 'image')

        # artifacts ディレクトリを作成
        artifacts = dist / 'artifacts'
        artifacts.mkdir(parents=True, exist_ok=True)

        # 4) release フォルダを作成して主要ファイルをコピー
        release = ROOT / 'release'
        if release.exists():
            shutil.rmtree(release)
        release.mkdir(parents=True, exist_ok=True)

        for js in ('layers-and-tiles-list.js', 'navigation-toolbar.js'):
            src = dist / js
            if src.exists():
                shutil.copy2(src, release / js)

        plugin_manifest = ROOT / 'plugin' / 'reearth.yml'
        if plugin_manifest.exists():
            shutil.copy2(plugin_manifest, release / 'reearth.yml')
            shutil.copy2(plugin_manifest, dist / 'reearth.yml')

        # 5) release を ZIP にまとめる
        zip_base = artifacts / 'geo_suite'
        shutil.make_archive(str(zip_base), 'zip', root_dir=str(release))
        print('作成済み ZIP:', str(artifacts / 'geo_suite.zip'))

        # 6) vercel 出力先へコピー（存在しない場合は作成）
        vo = ROOT / 'vercel' / 'output' / 'static'
        vo.mkdir(parents=True, exist_ok=True)
        for p in dist.iterdir():
            dest = vo / p.name
            if p.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(p, dest)
            else:
                shutil.copy2(p, dest)

        print('ビルドとパッケージ作成が正常に完了しました。')
    except Exception as e:
        print('エラー:', e)
        raise


if __name__ == '__main__':
    main()
