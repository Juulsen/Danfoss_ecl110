/* SVG charts: heat curve and 24 h history. No external libraries. */
(function (root) {
  const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const FONT = 'var(--ecl-font, Roboto, ui-sans-serif, system-ui, sans-serif)';
  const COLORS = {
    temperature_s1: '#7eb6ff',
    temperature_s2: '#3dd68c',
    temperature_s3: '#ff8a3d',
    temperature_s4: '#f5c16c',
    room: '#c4b5fd',
  };
  function flowAt(outdoor, slope, room) {
    const den = 2.5 * room - outdoor - 30;
    if (!(den > 0) || !Number.isFinite(slope)) return null;
    const high = 25 + slope * den;
    const low = 20 + slope * 1.3 * den;
    return high >= 40 ? high : low;
  }
  function num(value, digits, comma) {
    if (!Number.isFinite(Number(value))) return '—';
    const text = Number(value).toFixed(digits);
    return comma ? text.replace('.', ',') : text;
  }
  function curvePoints(slope, parallel, room) {
    const pts = [];
    for (let out = 20; out >= -20; out -= 2) {
      const flow = flowAt(out, slope, room);
      if (flow == null) continue;
      pts.push([out, flow + parallel]);
    }
    return pts;
  }
  function nice(min, max, step) {
    let lo = Math.floor(min / step) * step;
    let hi = Math.ceil(max / step) * step;
    if (hi - lo < step) hi = lo + step;
    return [lo, hi];
  }
  function ticks(min, max, step) {
    const out = [];
    const start = Math.ceil((min - 1e-6) / step) * step;
    for (let value = start; value <= max + 1e-6; value += step) out.push(Math.round(value * 10) / 10);
    return out;
  }
  function projectOf(minX, maxX, minY, maxY, box) {
    const sx = (x) => box.l + ((x - minX) / (maxX - minX || 1)) * box.w;
    const sy = (y) => box.t + box.h - ((y - minY) / (maxY - minY || 1)) * box.h;
    return { sx, sy };
  }
  function path(points, project) {
    return points.map((p, i) => `${i ? 'L' : 'M'}${project.sx(p[0]).toFixed(1)} ${project.sy(p[1]).toFixed(1)}`).join(' ');
  }
  function axis(box, minX, maxX, minY, maxY, xTicks, yTicks, comma, xSuffix, ySuffix, xText) {
    const project = projectOf(minX, maxX, minY, maxY, box);
    const grid = yTicks.map((y) => `<line x1="${box.l}" x2="${box.l + box.w}" y1="${project.sy(y).toFixed(1)}" y2="${project.sy(y).toFixed(1)}" stroke="#2c3442"/>`).join('');
    const vgrid = xTicks.map((x) => `<line y1="${box.t}" y2="${box.t + box.h}" x1="${project.sx(x).toFixed(1)}" x2="${project.sx(x).toFixed(1)}" stroke="#2c344244"/>`).join('');
    const xLabels = xTicks.map((x, i) => `<text x="${project.sx(x).toFixed(1)}" y="${box.t + box.h + 16}" text-anchor="middle" fill="#9aa6b5" font-size="10">${esc(xText ? xText[i] : num(x, 0, comma) + xSuffix)}</text>`).join('');
    const yLabels = yTicks.map((y) => `<text x="${box.l - 6}" y="${(project.sy(y) + 3).toFixed(1)}" text-anchor="end" fill="#9aa6b5" font-size="10">${esc(num(y, 0, comma) + ySuffix)}</text>`).join('');
    return `${grid}${vgrid}<line x1="${box.l}" x2="${box.l + box.w}" y1="${box.t + box.h}" y2="${box.t + box.h}" stroke="#4a5568"/>${xLabels}${yLabels}`;
  }
  function chartWidth(opts, fallback) {
    const width = Math.round(Number(opts && opts.width));
    return width >= 280 ? width : fallback;
  }
  function heatCurve(opts) {
    const comma = !!opts.comma;
    const room = Number(opts.room) || 20;
    const slope = Number(opts.slope);
    const parallel = Number(opts.parallel) || 0;
    const saved = curvePoints(slope, parallel, room);
    const previewSlope = opts.previewSlope == null ? null : Number(opts.previewSlope);
    const previewParallel = opts.previewParallel == null ? parallel : Number(opts.previewParallel);
    const preview = previewSlope == null ? [] : curvePoints(previewSlope, previewParallel, room);
    const differs = preview.length && (Math.abs(previewSlope - slope) > 0.001 || Math.abs(previewParallel - parallel) > 0.001);
    const W = chartWidth(opts, 420);
    const H = 250;
    const box = { l: 46, t: 28, w: W - 62, h: 186 };
    const ys = saved.concat(differs ? preview : []).map((p) => p[1]);
    if (!ys.length) ys.push(20, 40);
    if (Number.isFinite(opts.flow)) ys.push(opts.flow);
    const setSaved = Number.isFinite(opts.outdoor) ? flowAt(opts.outdoor, slope, room) : null;
    const setY = setSaved == null ? null : setSaved + parallel;
    if (setY != null) ys.push(setY);
    const [minY, maxY] = nice(Math.min(...ys, 20), Math.max(...ys, 40), 10);
    const project = projectOf(-20, 20, minY, maxY, box);
    const frame = axis(box, -20, 20, minY, maxY, [-20, -10, 0, 10, 20], ticks(minY, maxY, 10), comma, '°', '°');
    const savedStroke = differs ? 'stroke="#f5c16c" stroke-opacity="0.35" stroke-width="2"' : 'stroke="#f5c16c" stroke-width="2.4"';
    const savedPath = saved.length ? `<path data-series="saved" d="${path(saved, project)}" fill="none" ${savedStroke}/>` : '';
    const previewPath = differs ? `<path data-series="preview" d="${path(preview, project)}" fill="none" stroke="#f5c16c" stroke-width="2.6"/>` : '';
    let live = '';
    if (Number.isFinite(opts.outdoor) && Number.isFinite(opts.flow)) {
      const x = project.sx(opts.outdoor);
      const y = project.sy(opts.flow);
      const anchor = x > box.l + box.w * 0.62 ? 'end' : 'start';
      const lx = anchor === 'end' ? x - 8 : x + 8;
      live = `<circle data-point="live" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="#ff8a3d"/>`;
      if (setY != null) {
        live += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y.toFixed(1)}" y2="${project.sy(setY).toFixed(1)}" stroke="#ff8a3d" stroke-dasharray="3 3" opacity="0.8"/>`;
        live += `<circle data-point="setpoint" cx="${x.toFixed(1)}" cy="${project.sy(setY).toFixed(1)}" r="4" fill="none" stroke="#f5c16c" stroke-width="1.6"/>`;
      }
      if (opts.nowLabel) live += `<text data-label="now" x="${lx.toFixed(1)}" y="${Math.max(box.t + 12, y - 10).toFixed(1)}" text-anchor="${anchor}" fill="#ffd7bf" font-size="11">${esc(opts.nowLabel)}</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" data-chart="curve" data-pad-x="${box.l}" data-plot-w="${box.w}" role="img">
      <style>text{font-family:${FONT}}</style>
      <text x="${box.l}" y="16" fill="#9aa6b5" font-size="11">${esc(opts.yTitle || '')}</text>
      <text x="${box.l + box.w}" y="${H - 4}" text-anchor="end" fill="#9aa6b5" font-size="11">${esc(opts.xTitle || '')}</text>
      ${frame}${savedPath}${previewPath}${live}
    </svg>`;
  }
  function seriesPath(points, project) {
    const finite = points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (finite.length < 2) return '';
    const xs = finite.map((p) => p[0]);
    if (Math.max(...xs) - Math.min(...xs) < 60000) return '';
    return finite.map((p, i) => `${i ? 'L' : 'M'}${project.sx(p[0]).toFixed(1)} ${project.sy(p[1]).toFixed(1)}`).join(' ');
  }
  function history(series, opts) {
    const comma = !!opts?.comma;
    const W = chartWidth(opts, 420);
    const H = 188;
    const box = { l: 46, t: 16, w: W - 60, h: 140 };
    const flat = (series || []).flatMap((item) => item.points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])));
    const now = Date.now();
    const minX = flat.length ? Math.min(...flat.map((p) => p[0])) : now - 86400000;
    const maxX = flat.length ? Math.max(...flat.map((p) => p[0]), minX + 3600000) : now;
    const span = Math.max(maxX - minX, 1);
    const ys = flat.map((p) => p[1]);
    const [minY, maxY] = nice(ys.length ? Math.min(...ys) : 10, ys.length ? Math.max(...ys) : 40, 5);
    const project = projectOf(minX, maxX, minY, maxY, box);
    const xTicks = [minX, minX + span / 2, maxX];
    const xText = xTicks.map((t) => {
      const d = new Date(t);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    });
    const frame = axis(box, minX, maxX, minY, maxY, xTicks, ticks(minY, maxY, 5), comma, '', '°', xText);
    const colors = ['#7eb6ff', '#ff8a3d', '#f5c16c', '#3dd68c', '#c4b5fd'];
    const lines = (series || []).map((item, index) => {
      const color = COLORS[item.id] || colors[index % colors.length];
      const d = seriesPath(item.points, project);
      const last = [...item.points].reverse().find((p) => Number.isFinite(p[1]));
      const dot = last && Number.isFinite(last[0]) ? `<circle cx="${project.sx(Math.min(Math.max(last[0], minX), maxX)).toFixed(1)}" cy="${project.sy(last[1]).toFixed(1)}" r="3.2" fill="${color}"/>` : '';
      return `${d ? `<path data-series="${esc(item.id)}" d="${d}" fill="none" stroke="${color}" stroke-width="1.8"/>` : ''}${dot}`;
    }).join('');
    const empty = flat.length ? '' : `<text x="${box.l + box.w / 2}" y="${box.t + box.h / 2}" text-anchor="middle" fill="#9aa6b5" font-size="12">${esc(opts?.empty || '')}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" data-chart="history" data-pad-x="${box.l}" data-plot-w="${box.w}" role="img">
      <style>text{font-family:${FONT}}</style>
      ${frame}${lines}${empty}
      <line data-cursor="1" x1="${box.l}" x2="${box.l}" y1="${box.t}" y2="${box.t + box.h}" stroke="#ffffff55" visibility="hidden"/>
    </svg>`;
  }
  function nearest(series, ratio) {
    const stamps = (series || []).flatMap((item) => item.points.map((p) => p[0])).filter((t) => Number.isFinite(t));
    if (!stamps.length) return null;
    const min = Math.min(...stamps);
    const max = Math.max(...stamps);
    const target = min + (max - min) * Math.min(1, Math.max(0, ratio));
    const rows = series.map((item) => {
      let best = null;
      for (const point of item.points) {
        if (!Number.isFinite(point[1]) || !Number.isFinite(point[0])) continue;
        if (!best || Math.abs(point[0] - target) < Math.abs(best[0] - target)) best = point;
      }
      return best ? { id: item.id, name: item.name, value: best[1], time: best[0] } : null;
    }).filter(Boolean);
    return { time: target, rows };
  }
  root.Ecl110Chart = { flowAt, heatCurve, history, nearest, color: (id) => COLORS[id] || '#9aa6b5' };
})(typeof globalThis === 'undefined' ? window : globalThis);
