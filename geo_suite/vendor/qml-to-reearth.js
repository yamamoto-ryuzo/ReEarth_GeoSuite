// QML (QGIS layer style) -> Re:Earth appearance translator.
// Depends on the vendored qml-style.js module (compileQmlStyle /
// resolveSymbolLayers / markerLayersToCanvas). Runs inside the UI iframe
// (needs DOMParser + canvas). Returns plain appearance objects with
// {expression:{conditions}} fields evaluated per-feature by Visualizer.
//
// qmlStyleToReearth(xmlText, opts) -> { marker, polyline, polygon, warnings, legend }
// opts: { qmlUrl, props0, qml: <module>, fetchImages }

function qmlQ2J(expr, fbField){
  const fb = fbField ? '${'+fbField+'}' : 'null';
  let s = String(expr||'').trim();
  if (!s || /^ELSE$/i.test(s)) return 'true';
  s = s.replace(/"([^"]+)"/g, '${$1}');
  s = s.replace(/eval\s*\([^)]*\)/gi, fb);
  s = s.replace(/@[\w]+/g, fb);
  s = s.replace(/(\$\{[^}]+\}|null)\s*\b(NOT\s+|!\s*)?IN\s*\(([^)]*)\)/gi,
      (m,f,n,l)=> (n ? '!(' : '(') + l.split(',').map(v=>`${f} === ${v.trim()}`).join(' || ') + ')');
  s = s.replace(/\bAND\b/gi,'&&').replace(/\bOR\b/gi,'||').replace(/\bNOT\b/gi,'!');
  s = s.replace(/\bIS\s+NOT\s+NULL\b/gi,'!== null').replace(/\bIS\s+NULL\b/gi,'=== null');
  s = s.replace(/<>/g,'!==');
  s = s.replace(/(?<![<>=!~])=(?!=)/g,'===');
  return s;
}

function qmlNumOrStr(v){ return (v!=='' && !isNaN(Number(v))) ? v : `'${String(v).replace(/'/g,"\\'")}'`; }
function qmlToResult(v){ return typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g,"\\'")}'`; }
function qmlRgbaCss(rgba){
  if (!rgba) return 'rgba(0,0,0,0)';
  const [r,g,b,a] = rgba;
  return `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${Math.round(a*1000)/1000})`;
}
const _qmlApplyAlpha = (c, al) => c ? [c[0],c[1],c[2],c[3]*al] : c;
const _qmlGisRgba = s => (s && s.split(',').length >= 3)
  ? `rgba(${s.split(',').slice(0,3).join(',')},${(Number(s.split(',')[3]??255)/255)})` : (s||'#222222');

function qmlRendererConds(rendererEl, props0, warnings){
  const type = rendererEl.getAttribute('type') || 'singleSymbol';
  let attr = rendererEl.getAttribute('attr');
  if (attr && (!/^\w+$/.test(attr) || !(attr in (props0||{})))) {
    warnings.push(`renderer attr '${attr}' is an expression or missing field -> fallback`);
    attr = null;
  }
  if (!attr && props0){
    const cands = ['FEATURECLA','featurecla','NAME','name'];
    attr = cands.find(c => c in props0) || Object.keys(props0)[0];
  }
  const conds = [];
  let elseName = null;
  if (type === 'singleSymbol'){
    const s = rendererEl.querySelector('symbols > symbol');
    return { conds: null, elseName: s ? s.getAttribute('name') : null };
  }
  if (type === 'categorizedSymbol'){
    for (const c of rendererEl.querySelectorAll('categories > category')){
      if (c.getAttribute('render') === 'false') continue;
      const v = c.getAttribute('value'), s = c.getAttribute('symbol');
      if (v === null || v === '') { elseName = s; continue; }
      conds.push([`\${${attr}} === ${qmlNumOrStr(v)}`, s]);
    }
    return { conds, elseName };
  }
  if (type === 'graduatedSymbol'){
    const ranges = [...rendererEl.querySelectorAll('ranges > range')];
    ranges.forEach((r,i)=>{
      const lo = r.getAttribute('lower'), hi = r.getAttribute('upper'), s = r.getAttribute('symbol');
      const op = (i === ranges.length-1) ? '<=' : '<';
      conds.push([`\${${attr}} >= ${lo} && \${${attr}} ${op} ${hi}`, s]);
    });
    return { conds, elseName };
  }
  if (type === 'RuleBased'){
    const walk = (ruleEl, parentCond) => {
      const filter = ruleEl.getAttribute('filter');
      const sym = ruleEl.getAttribute('symbol');
      let cond = parentCond;
      if (filter && !/^ELSE$/i.test(filter)) {
        const c = qmlQ2J(filter, attr);
        cond = cond ? `(${cond}) && (${c})` : c;
      }
      if (sym) conds.push([cond || 'true', sym]);
      for (const ch of [...ruleEl.children].filter(x=>x.tagName==='rule')) walk(ch, cond);
    };
    const rulesEl = [...rendererEl.children].find(c=>c.tagName==='rules');
    for (const r of rulesEl ? [...rulesEl.children].filter(c=>c.tagName==='rule') : []){
      const filter = r.getAttribute('filter');
      if (filter && /^ELSE$/i.test(filter)) { elseName = r.getAttribute('symbol'); continue; }
      walk(r, null);
    }
    return { conds, elseName };
  }
  return { conds: null, elseName: null, warn: `renderer ${type} unsupported` };
}

function qmlSpecToFrags(spec, qml){
  const al = (spec && (spec.alpha!==undefined && spec.alpha!==null)) ? spec.alpha : 1;
  const frag = {};
  if (spec && spec.markers && spec.markers.length){
    try { frag.markerImage = qml.markerLayersToCanvas(spec.markers).toDataURL('image/png'); } catch(e){}
  }
  if (!frag.markerImage && spec && spec.markers && spec.markers.length){
    const m = spec.markers[0];
    if (m && m.fill) frag.point = { color: _qmlApplyAlpha(m.fill, al), sizePx: Math.max(2, Math.round(m.sizePx||6)) };
  }
  if (spec && spec.line) frag.line = { color: _qmlApplyAlpha(spec.line.color, al), widthPx: spec.line.widthPx, dash: spec.line.dash };
  const solid = spec && spec.fillParts ? spec.fillParts.find(p=>p && p.solid) : null;
  if (spec && spec.fillParts && spec.fillParts.length){
    frag.fill = { color: _qmlApplyAlpha(solid ? solid.solid : [0,0,0,0], al), hasFill: !!solid };
  }
  if (spec && spec.outline) frag.outline = { color: _qmlApplyAlpha(spec.outline.color, al), widthPx: spec.outline.widthPx, dash: spec.outline.dash };
  return frag;
}

function qmlLabelInfo(labelingEl, fbField){
  if (!labelingEl) return null;
  const type = labelingEl.getAttribute('type') || 'simple';
  const grab = el => {
    const ts = el.querySelector('text-style') || el.querySelector('settings text-style');
    if (!ts) return null;
    const g = n => ts.getAttribute(n);
    return {
      field: g('fieldName')||'', isExpr: g('isExpression')==='1',
      sizePx: Math.round((Number(g('fontSize'))||10) * ((g('fontSizeUnit')||'Point')==='MM'?96/25.4:96/72)),
      color: g('textColor'), buffer: g('bufferDraw')==='1', bufferColor: g('bufferColor'),
      bold: g('fontBold')==='1', italic: g('fontItalic')==='1', family: g('fontFamily')||'sans-serif',
    };
  };
  if (type === 'rule-based'){
    const rules = [];
    const rulesEl = [...labelingEl.children].find(c=>c.tagName==='rules') || labelingEl;
    for (const r of [...rulesEl.children].filter(c=>c.tagName==='rule')){
      const st = grab(r); if (!st) continue;
      rules.push({ cond: qmlQ2J(r.getAttribute('filter'), fbField), style: st });
    }
    return rules.length ? { rules, style: rules[0].style } : null;
  }
  const st = grab(labelingEl);
  return st ? { style: st } : null;
}

function qmlStyleToReearth(xmlText, opts){
  opts = opts || {};
  const qml = opts.qml;
  const props0 = opts.props0 || {};
  const warnings = [];
  const qmlUrl = opts.qmlUrl || '';
  const style = qml.compileQmlStyle(xmlText, qmlUrl, opts.preloadedImages);
  warnings.push(...(style.warnings||[]));
  const doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
  const rendererEl = doc.querySelector('renderer-v2');
  const specByName = new Map();
  for (const le of style.legend) specByName.set(le.symbolName, le.spec);
  for (const [name, sym] of style.symbols){
    if (!specByName.has(name)){
      try { specByName.set(name, qml.resolveSymbolLayers(sym, {}, style.images, new Set())); }
      catch(e){ specByName.set(name, null); }
    }
  }
  const { conds, elseName, warn } = qmlRendererConds(rendererEl, props0, warnings);
  if (warn) { warnings.push(warn); return { error: warn, warnings }; }
  const fbField = ('FEATURECLA' in props0) ? 'FEATURECLA' : ('NAME' in props0 ? 'NAME' : (Object.keys(props0)[0]||null));
  const label = qmlLabelInfo(doc.querySelector('labeling'), fbField);
  if (label){
    const fix = st => {
      if (st.isExpr || !st.field || !(st.field in props0)){
        warnings.push(`label field '${st.field}' -> ${fbField||'?'} fallback`);
        st.field = fbField || Object.keys(props0)[0];
        st.isExpr = false;
      }
      return st;
    };
    if (label.rules) label.rules.forEach(r => fix(r.style));
    else fix(label.style);
  }
  const frags = new Map();
  const fragFor = n => {
    if (!frags.has(n)) frags.set(n, qmlSpecToFrags(specByName.get(n) || {}, qml));
    return frags.get(n);
  };
  const condOrVal = (conds, getV, elseName2) => {
    if (!conds) return getV(fragFor(elseName2));
    const list = conds.map(([c,s])=>[c, getV(fragFor(s))]).filter(([,v])=>v!==undefined&&v!==null)
      .map(([c,v])=>[c, qmlToResult(v)]);
    if (elseName2) { const v = getV(fragFor(elseName2)); if (v!==undefined&&v!==null) list.push(['true', qmlToResult(v)]); }
    if (!list.length) return undefined;
    return { expression: { conditions: list } };
  };

  const marker = {};
  const img = condOrVal(conds, f=>f.markerImage, elseName);
  if (img !== undefined){
    marker.style = 'image'; marker.image = img; marker.imageSize = 1;
    marker.imageHorizontalOrigin = 'center'; marker.imageVerticalOrigin = 'center';
  } else {
    const pt = condOrVal(conds, f=>f.point, elseName);
    marker.style = 'point';
    marker.pointColor = pt && pt.color ? (typeof pt === 'string' ? pt : qmlRgbaCss(pt.color)) : '#3388ff';
    marker.pointSize = pt && pt.sizePx ? pt.sizePx : 8;
  }
  if (label){
    marker.label = true; marker.labelPosition = 'righttop';
    const st = label.style;
    marker.labelTypography = { fontFamily: st.family, fontSize: st.sizePx, fontWeight: st.bold?'bold':'normal', fontStyle: st.italic?'italic':'normal', color: _qmlGisRgba(st.color) };
    if (st.buffer) { marker.labelBackground = true; marker.labelBackgroundColor = _qmlGisRgba(st.bufferColor); marker.labelBackgroundPaddingHorizontal = 2; marker.labelBackgroundPaddingVertical = 1; }
    if (label.rules){
      marker.labelText = { expression: { conditions: [...label.rules.map(r=>[r.cond, qmlToResult("${" + r.style.field + "}")]), ['true', "''"]] } };
    } else if (st.field){
      marker.labelText = { expression: "'${" + st.field + "}'" };
    }
  } else {
    marker.style = marker.style || 'none';
  }

  const polyline = { clampToGround: true };
  const sc = condOrVal(conds, f=>f.line && qmlRgbaCss(f.line.color), elseName);
  const sw = condOrVal(conds, f=>f.line && Math.max(1,Math.round(f.line.widthPx)), elseName);
  if (sc !== undefined){ polyline.strokeColor = sc; polyline.strokeWidth = (sw!==undefined?sw:1); }
  else polyline.show = false;
  const dashWarn = [...frags.values()].some(f=>f.line&&f.line.dash) || [...frags.values()].some(f=>f.outline&&f.outline.dash);
  if (dashWarn) warnings.push('dash/dot line styles degrade to solid lines');

  const polygon = { fill:true, stroke:false, heightReference:'clamp' };
  const fc = condOrVal(conds, f=>f.fill && qmlRgbaCss(f.fill.color), elseName);
  const oc = condOrVal(conds, f=>f.outline && qmlRgbaCss(f.outline.color), elseName);
  const ow = condOrVal(conds, f=>f.outline && Math.max(1,Math.round(f.outline.widthPx)), elseName);
  if (fc !== undefined) polygon.fillColor = fc;
  if (oc !== undefined){ polygon.stroke = true; polygon.strokeColor = oc; polygon.strokeWidth = (ow!==undefined?ow:1); }

  const legend = (style.legend||[]).map(e=>({ label: e.label, symbolName: e.symbolName }));
  return { marker, polyline, polygon, warnings, legend };
}
