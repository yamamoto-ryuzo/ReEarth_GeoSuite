#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function readYmlDefault(ymlPath) {
  const raw = fs.readFileSync(ymlPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const idx = lines.findIndex(l => /defaultValue\s*:\s*\|/.test(l));
  if (idx === -1) return null;
  const block = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s+/.test(line)) block.push(line);
    else break;
  }
  if (!block.length) return null;
  // remove common indentation
  const indents = block.filter(Boolean).map(l => (l.match(/^(\s*)/) || ['',''])[1].length);
  const minIndent = Math.min.apply(null, indents);
  const trimmed = block.map(l => l.slice(minIndent)).join('\n');
  return trimmed;
}

function sanitizeForTemplate(s) {
  if (s == null) return '';
  return String(s).replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function replaceInTs(tsPath, newContent) {
  const raw = fs.readFileSync(tsPath, 'utf8');
  const re = /const\s+_defaultInspectorText\s*=\s*`[\s\S]*?`\s*;/m;
  const replacement = 'const _defaultInspectorText = `' + newContent + '`;';
  if (!re.test(raw)) {
    console.error('Pattern not found in', tsPath);
    return false;
  }
  const out = raw.replace(re, replacement);
  fs.writeFileSync(tsPath, out, 'utf8');
  return true;
}

function main() {
  try {
    const repoRoot = path.resolve(__dirname, '..');
    const ymlPath = path.join(repoRoot, 'plugin', 'reearth.yml');
    const tsPath = path.join(repoRoot, 'geo_suite', 'src', 'layers-and-tiles-list.ts');
    if (!fs.existsSync(ymlPath)) { console.error('reearth.yml not found at', ymlPath); process.exit(0); }
    if (!fs.existsSync(tsPath)) { console.error('TS file not found at', tsPath); process.exit(0); }
    const def = readYmlDefault(ymlPath);
    if (!def) { console.log('No defaultValue found in reearth.yml; skipping replace.'); return; }
    const sanitized = sanitizeForTemplate(def);
    const ok = replaceInTs(tsPath, sanitized);
    if (ok) console.log('Replaced _defaultInspectorText in', tsPath);
  } catch (e) {
    console.error('prepare_default_inspector error:', e);
    process.exit(1);
  }
}

main();
