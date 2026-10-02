/* Small SVG charts: heat curve, 24 h history and sparklines. No external libraries. */
(function (root) {
  const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function flowAt(outdoor, slope, room) {
    const den = 2.5 * room - outdoor - 30;
    if (!(den > 0) || !Number.isFinite(slope)) return null;
    const high = 25 + slope * den;
    const low = 20 + slope * 1.3 * den;
    return high >= 40 ? high : low;
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
  function scale(points, width, height, pad) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs, -20);
    const maxX = Math.max(...xs, 20);
    const minY = Math.min(...ys, 15);
    const maxY = Math.max(...ys, 55);
    const sx = (x) => pad + ((x - minX) / (maxX - minX || 1)) * (width - pad * 2);
    const sy = (y) => height - pad - ((y - minY) / (maxY - minY || 1)) * (height - pad * 2);
    return { sx, sy };
  }
  function path(points, project) {
    return points.map((p, i) => `${i ? 'L' : 'M'}${project.sx(p[0]).toFixed(1)} ${project.sy(p[1]).toFixed(1)}`).join(' ');
  }
  function heatCurve(opts) {
    const room = Number(opts.room) || 20;
    const slope = Number(opts.slope);
    const parallel = Number(opts.parallel) || 0;
    const current = curvePoints(slope, parallel, room);
    const previewSlope = opts.previewSlope == null ? null : Number(opts.previewSlope);
    const previewParallel = opts.previewParallel == null ? parallel : Number(opts.previewParallel);
    const preview = previewSlope == null ? [] : curvePoints(previewSlope, previewParallel, room);
    const all = current.concat(preview);
    if (Number.isFinite(opts.outdoor) && Number.isFinite(opts.flow)) all.push([opts.outdoor, opts.flow]);
    const project = scale(all.length ? all : [[0, 30]], 420, 180, 28);
    const live = Number.isFinite(opts.outdoor) && Number.isFinite(opts.flow)
      ? `<circle data-point="live" cx="${project.sx(opts.outdoor)}" cy="${project.sy(opts.flow)}" r="5" fill="#ff8a3d"/>`
      : '';
    const previewPath = preview.length ? `<path d="${path(preview, project)}" fill="none" stroke="#c4b5fd" stroke-width="2" stroke-dasharray="4 3"/>` : '';
    return `<svg viewBox="0 0 420 180" width="100%" data-chart="curve" role="img">
      <path d="${path(current, project)}" fill="none" stroke="#f5c16c" stroke-width="2.5"/>
      ${previewPath}${live}
    </svg>`;
  }
  function seriesPath(points, project) {
    const finite = points.filter((p) => Number.isFinite(p[1]));
    if (!finite.length) return '';
    return finite.map((p, i) => `${i ? 'L' : 'M'}${project.sx(p[0]).toFixed(1)} ${project.sy(p[1]).toFixed(1)}`).join(' ');
  }
  function history(series, width) {
    const w = width || 420;
    const h = 140;
    const flat = series.flatMap((item) => item.points.filter((p) => Number.isFinite(p[1])));
    if (!flat.length) {
      return `<svg viewBox="0 0 ${w} ${h}" width="100%" data-chart="history"></svg>`;
    }
    const project = scale(flat, w, h, 16);
    const colors = ['#f5c16c', '#ff8a3d', '#4aa3ff', '#3dd68c'];
    const lines = series.map((item, index) => {
      const d = seriesPath(item.points, project);
      return d ? `<path data-series="${esc(item.id)}" d="${d}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="1.8"/>` : '';
    }).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" data-chart="history" role="img">${lines}<line data-cursor="1" x1="0" x2="0" y1="8" y2="${h - 8}" stroke="#ffffff55" visibility="hidden"/></svg>`;
  }
  function spark(points) {
    const finite = (points || []).filter((p) => Number.isFinite(p[1]));
    if (finite.length < 2) return '';
    const min = Math.min(...finite.map((p) => p[1]));
    const max = Math.max(...finite.map((p) => p[1]));
    const step = 80 / (finite.length - 1);
    const d = finite.map((p, i) => {
      const y = 22 - ((p[1] - min) / (max - min || 1)) * 18;
      return `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    return `<svg viewBox="0 0 80 24" width="100%" height="24" data-chart="spark"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
  }
  function nearest(series, ratio) {
    const stamps = series.flatMap((item) => item.points.map((p) => p[0])).filter((t) => Number.isFinite(t));
    if (!stamps.length) return null;
    const min = Math.min(...stamps);
    const max = Math.max(...stamps);
    const target = min + (max - min) * ratio;
    const rows = series.map((item) => {
      let best = null;
      for (const point of item.points) {
        if (!Number.isFinite(point[1])) continue;
        if (!best || Math.abs(point[0] - target) < Math.abs(best[0] - target)) best = point;
      }
      return best ? { id: item.id, name: item.name, value: best[1], time: best[0] } : null;
    }).filter(Boolean);
    return { time: rows[0]?.time, rows };
  }
  root.Ecl110Chart = { flowAt, heatCurve, history, spark, nearest };
})(typeof globalThis === 'undefined' ? window : globalThis);
