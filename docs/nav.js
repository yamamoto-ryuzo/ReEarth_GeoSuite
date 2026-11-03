// Re:Earth GeoSuite ドキュメント共通ナビゲーション
// 使い方: <script src="nav.js" defer></script>（サイトルートのページは src="docs/nav.js"）
// - 左サイドバーにサイト内リンクを生成（ナビ用 CSS はこのファイルが注入する自己完結型）
// - 現在ページを自動ハイライト
// - JS が無効でも本文は通常表示される（サイドバーだけ出ない）
// - docs/ 配下のページを追加したら GROUPS を更新すること（ここがページ一覧の正本）
(function () {
  const scriptUrl = document.currentScript.src;
  const VERSION = 'v22.3.1';

  // サイトルートのページ（nav.js は docs/ に置くため ../ で指す）
  const SITE = [
    { href: '../index.html', text: 'GeoSuite トップ' }
  ];

  const GROUPS = [
    {
      label: null,
      items: [
        { href: 'index.html', text: '1. トップ・ドキュメント一覧' }
      ]
    },
    {
      label: '仕様',
      items: [
        { href: 'layer-grouping-specification.html', text: '2. レイヤ階層化・排他グループ機能' },
        { href: 'basemap-initial-selection.html', text: '3. ベースマップ初期選択' },
        { href: 'payload-limits.html', text: '4. ペイロード制限（QuickJS OOM 対策）' }
      ]
    },
    {
      label: '連携・実装',
      items: [
        { href: 'external-bridge.html', text: '5. 外部ブリッジ（実装構成）' },
        { href: 'bridge-hub.html', text: '6. AIチャット → ブリッジハブ' }
      ]
    },
    {
      label: '参考資料',
      items: [
        { href: 'duckdb-persistence.html', text: '7. DuckDB-Wasm 永続化検証（解決済・検証記録）' }
      ]
    }
  ];

  const DEMOS = [
    { href: 'https://re-earth-geo-suite.vercel.app/', text: '▶ デプロイ済みサイト（Vercel）' },
    { href: 'https://github.com/yamamoto-ryuzo/ReEarth_GeoSuite/issues', text: '🐛 問い合わせ（GitHub Issues）' }
  ];

  function norm(url) {
    // 末尾の index.html / / を正規化して比較できる形にする
    return url.replace(/index\.html$/, '').replace(/\/$/, '');
  }
  const current = norm(location.href);

  function abs(href) {
    return new URL(href, scriptUrl).href;
  }
  function isActive(href) {
    return norm(abs(href)) === current;
  }
  function linkFor(item) {
    const active = isActive(item.href) ? ' class="active"' : '';
    return `<a href="${abs(item.href)}"${active}>${item.text}</a>`;
  }

  // ナビゲーション用 CSS（ページ本体のスタイルとは独立・自己完結）
  const css = `
#site-nav {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 250px;
  background: #fff;
  border-right: 1px solid #e0e0e0;
  overflow-y: auto;
  padding: 16px 14px 24px;
  z-index: 1000;
  font-size: 0.92em;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', sans-serif;
  line-height: 1.6;
  color: #333;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.06);
}
#site-nav a { text-decoration: none; }
#site-nav .nav-title {
  font-weight: 700;
  font-size: 1.05em;
  padding-bottom: 10px;
  border-bottom: 2px solid #e0e0e0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
#site-nav .nav-title a { color: #667eea; }
#site-nav .nav-version {
  font-size: 0.72em;
  background: #28a745;
  color: #fff;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 600;
}
#site-nav .nav-demos {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0 6px;
}
#site-nav .nav-demo {
  display: block;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  padding: 7px 10px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.9em;
}
#site-nav .nav-demo:hover { opacity: 0.9; }
#site-nav .nav-group { margin-top: 14px; }
#site-nav .nav-group-label {
  font-size: 0.78em;
  font-weight: 700;
  color: #999;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
  padding-left: 10px;
}
#site-nav ul { list-style: none; padding: 0; margin: 0; }
#site-nav ul li { margin: 1px 0; }
#site-nav ul li a {
  display: block;
  padding: 6px 10px;
  border-radius: 6px;
  color: #333;
}
#site-nav ul li a:hover { background: #e8ecff; color: #667eea; }
#site-nav ul li a.active { background: #667eea; color: #fff; font-weight: 600; }
#site-nav .nav-sub {
  padding-left: 14px;
  border-left: 2px solid #e8e8e8;
  margin-left: 14px;
}
#site-nav .nav-sub a { font-size: 0.92em; padding: 4px 8px; }
.nav-toggle {
  display: none;
  position: fixed;
  top: 10px;
  left: 10px;
  z-index: 1100;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  width: 42px;
  height: 42px;
  font-size: 1.2em;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
@media (min-width: 901px) {
  body.has-nav { padding-left: 280px; }
}
@media (max-width: 900px) {
  #site-nav { transform: translateX(-105%); transition: transform 0.25s ease; }
  body.nav-open #site-nav { transform: none; }
  .nav-toggle { display: block; }
}`;
  const styleEl = document.createElement('style');
  styleEl.id = 'site-nav-style';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const nav = document.createElement('aside');
  nav.id = 'site-nav';

  let html = `<div class="nav-title"><a href="${abs('index.html')}">Re:Earth GeoSuite</a><span class="nav-version">${VERSION}</span></div>`;

  html += '<div class="nav-demos">';
  for (const d of DEMOS) {
    html += `<a class="nav-demo" href="${abs(d.href)}" target="_blank" rel="noopener noreferrer">${d.text}</a>`;
  }
  html += '</div>';

  html += '<div class="nav-group"><div class="nav-group-label">サイト</div><ul>';
  for (const s of SITE) html += `<li>${linkFor(s)}</li>`;
  html += '</ul></div>';

  for (const g of GROUPS) {
    html += '<div class="nav-group">';
    if (g.label) html += `<div class="nav-group-label">${g.label}</div>`;
    html += '<ul>';
    for (const item of g.items) {
      html += `<li>${linkFor(item)}`;
      if (item.children) {
        html += '<ul class="nav-sub">';
        for (const c of item.children) html += `<li>${linkFor(c)}</li>`;
        html += '</ul>';
      }
      html += '</li>';
    }
    html += '</ul></div>';
  }

  nav.innerHTML = html;
  document.body.prepend(nav);
  document.body.classList.add('has-nav');

  // モバイル用ハンバーガー
  const btn = document.createElement('button');
  btn.className = 'nav-toggle';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'メニュー');
  btn.textContent = '☰';
  btn.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.body.prepend(btn);
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) document.body.classList.remove('nav-open');
  });
})();
