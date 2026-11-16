#!/usr/bin/env python
# feature-verify artifact generator: rebuild verify/index.html and
# verify/features/<fid>.html from verify/features.json.
# usage: python verify/gen_pages.py
import json, html, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(ROOT, 'features.json'), encoding='utf-8'))
FE = D['features']
os.makedirs(os.path.join(ROOT, 'features'), exist_ok=True)

def esc(s):
    return html.escape(str(s if s is not None else ''))

def color(r):
    return {'pass': '#2e7d32', 'fail': '#c62828', 'skip': '#ef6c00',
            'untested': '#757575', 'removed': '#9e9e9e'}.get(r, '#000')

MERMAID = {
    'ai_integration': """sequenceDiagram
  participant AI as AI/ハーネス
  participant BR as __geoBridge (nav-toolbar iframe)
  participant EXT as ai-chat 拡張ctx (dispatchToolCall)
  participant PNL as layer panel / chat iframe
  AI->>BR: call(name,args)
  BR->>EXT: bridgeCall
  EXT->>PNL: aiToolRequest / aiChatCmd (転送ツールのみ)
  PNL-->>EXT: result
  EXT-->>BR: bridgeResult
  BR-->>AI: result""",
    'api_route': """sequenceDiagram
  participant C as client
  participant H as geosuite-hub :8514
  participant S as duckdb.exe / provider CLI / canvas
  C->>H: HTTP request
  H->>S: 処理委譲 (種別による)
  S-->>H: result
  H-->>C: HTTP response""",
    'ui_control': """flowchart LR
  A[test.js / shot.js] --> B[headless Chrome CDP]
  B --> C[workbench :8787]
  C --> D[plugin iframe DOM assert]""",
    'logic_fn': """flowchart LR
  A[compiler/checker] --> B[src tree] --> C[0 errors assert]""",
}

for f in FE:
    fid = f['id']
    mm = MERMAID.get(f['kind'], MERMAID['logic_fn'])
    pg = f"""<!doctype html><meta charset="utf-8"><title>{esc(fid)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>mermaid.initialize({{startOnLoad:true}});</script>
<body style="font-family:sans-serif;max-width:900px;margin:2em auto">
<h1>{esc(f.get('name', fid))}</h1>
<p><b>id:</b> {esc(fid)}<br><b>kind:</b> {esc(f['kind'])}<br>
<b>source:</b> {esc(f.get('source',''))}<br><b>signature:</b> <code>{esc(f.get('signature',''))}</code></p>
<p><b>summary:</b> {esc(f.get('summary',''))}</p>
<pre class="mermaid">
{mm}
</pre>
<p><b>result:</b> <span style="color:{color(f['last_result'])};font-weight:bold">{esc(f['last_result'])}</span><br>
<b>verified:</b> {esc(f.get('last_verified',''))}<br><b>note:</b> {esc(f.get('note',''))}</p>
<p><b>verify:</b> standalone=<code>{esc((f.get('verify') or {}).get('standalone',''))}</code><br>
integrated=<code>{esc((f.get('verify') or {}).get('integrated',''))}</code></p>
<p><a href="../index.html">← index</a></p>
"""
    with open(os.path.join(ROOT, 'features', fid + '.html'), 'w', encoding='utf-8') as fh:
        fh.write(pg)

rows = ''.join(
    f"<tr><td><a href='features/{esc(f['id'])}.html'>{esc(f['id'])}</a></td>"
    f"<td>{esc(f['kind'])}</td>"
    f"<td style='color:{color(f['last_result'])}'>{esc(f['last_result'])}</td>"
    f"<td>{esc(f.get('note',''))}</td></tr>"
    for f in FE)
cnt = {}
for f in FE:
    cnt[f['last_result']] = cnt.get(f['last_result'], 0) + 1
summary = ' '.join(f"{k}={v}" for k, v in sorted(cnt.items()))
idx = f"""<!doctype html><meta charset="utf-8"><title>ReEarth_GeoSuite verify</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>mermaid.initialize({{startOnLoad:true}});</script>
<body style="font-family:sans-serif;max-width:1100px;margin:2em auto">
<h1>ReEarth_GeoSuite — feature verify</h1>
<p>type={esc(D['component_type'])} version={esc(D.get('version',''))} updated={esc(D.get('updated',''))}</p>
<p>{summary} (total {len(FE)})</p>
<pre class="mermaid">
flowchart LR
  subgraph AI経路
    A[AI/harness] --> B["__geoBridge (nav-toolbar iframe)"] --> C[ai-chat dispatchToolCall]
    C --> D[local exec / layer panel / chat iframe]
  end
  subgraph Workbench
    W[workbench :8787] --> P[plugin iframes x4]
  end
  subgraph Hub
    H[geosuite-hub :8514] --> V["/vector duckdb.exe"] & M[/mcp + agent/ & K[/canvas/]
  end
  B -.vectorHub/aiHub.-> H
</pre>
<table border="1" cellspacing="0" cellpadding="4"><tr><th>id</th><th>kind</th><th>result</th><th>note</th></tr>{rows}</table>
"""
with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as fh:
    fh.write(idx)

# ---- logic-sheet.md ----
lines = []
lines.append(f"# ReEarth_GeoSuite — 完全ロジックシート\n")
lines.append(f"- component: {D['component']} ({D['component_type']})")
lines.append(f"- version: {D.get('version','')}")
lines.append(f"- generated: {D.get('updated','')}")
lines.append(f"- features: {len(FE)}\n")
lines.append("## トポロジ\n")
lines.append("```mermaid")
lines.append("""flowchart LR
  subgraph entry[entry points]
    UIW[Workbench UI widgets x4]:::ui
    BR[__geoBridge / bridge_server / aiToolCall]
    HUB[geosuite-hub :8514 HTTP]
  end
  subgraph ext[extensions]
    NAV[navigation-toolbar.ts]
    BMP[basemap-widget.ts]
    LTL[layers-and-tiles-list.ts]
    AI[ai-chat.ts]
  end
  BR --> NAV --> AI
  AI --> LTL
  LTL --> BMP
  LTL -.vectorHub/aiHub.-> HUB
  UIW --> ext
  HUB --> DUCK[duckdb.exe] & MCP[/mcp/] & CANVAS[/canvas/]
""")
lines.append("```\n")
lines.append("## 検証マトリクス\n")
lines.append("| feature | kind | runtime | 単独 | 連携 | result | note |")
lines.append("|---|---|---|---|---|---|---|")
for f in FE:
    v = f.get('verify') or {}
    lines.append(f"| `{f['id']}` | {f['kind']} | {'yes' if f.get('needs_runtime') else 'no'} "
                 f"| {v.get('standalone','')[:60]} | {v.get('integrated','')[:60]} "
                 f"| **{f['last_result']}** | {str(f.get('note',''))[:100]} |")
lines.append("\n## 機能別ロジック\n")
for f in FE:
    lines.append(f"### {f['id']} — {f.get('name','')}\n")
    lines.append(f"- kind: `{f['kind']}` / source: `{f.get('source','')}` / signature: `{f.get('signature','')}`")
    lines.append(f"- summary: {f.get('summary','')}")
    lines.append(f"- result: **{f['last_result']}** ({f.get('last_verified','')}) — {f.get('note','')}\n")
    lines.append("```mermaid")
    lines.append(MERMAID.get(f['kind'], MERMAID['logic_fn']))
    lines.append("```\n")
with open(os.path.join(ROOT, 'logic-sheet.md'), 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(lines))
print('generated', len(FE), 'feature pages + index + logic-sheet.md')
