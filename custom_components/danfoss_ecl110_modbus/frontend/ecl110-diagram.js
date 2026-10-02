/* Dynamic ECL 110 process diagram. One 420×236 viewBox for every column width. */
(function (root) {
  const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function pill(part, x, y, label, bind, value) {
    const text = esc(value || '—');
    const w = Math.max(58, text.length * 7 + 16);
    return `<g data-part="${part}" class="pill" transform="translate(${x} ${y})" data-bind-wrap="${esc(bind || '')}">
      <rect rx="11" width="${w}" height="22" fill="#1b212b" stroke="#3c4656"/>
      <text data-bind="${esc(bind || '')}" x="${w / 2}" y="15" text-anchor="middle" fill="#f4f7fb" font-size="11" font-family="system-ui,sans-serif">${text}</text>
      <text x="${w / 2}" y="34" text-anchor="middle" fill="#9aa6b5" font-size="8" font-family="system-ui,sans-serif">${esc(label)}</text>
    </g>`;
  }
  function symbol(part, body) {
    return `<g data-part="${part}">${body}</g>`;
  }
  function markup(raw, values) {
    const plant = root.Ecl110Plant.normalize(raw);
    const has = (part) => plant.components.includes(part);
    const v = values || {};
    const val = (key) => v[key] || '—';
    const site = esc(plant.labels?.site || (plant.application === '116' ? 'FJERNVARME' : 'FJERNVARME'));
    const consumer = esc(plant.labels?.consumer || (plant.application === '116' ? 'TAPPESTED' : 'BOLIG'));
    const hot = plant.application === '116' ? '#f2a3c0' : '#ff8a3d';
    const back = plant.application === '116' ? '#7eb6ff' : '#4aa3ff';
    const core = {
      hex: `<rect x="168" y="62" width="28" height="112" rx="4" fill="#12161c" stroke="#6d7888"/><path d="M172 70 l20 96 M188 70 l-16 96" stroke="#8b97a8" fill="none"/>`,
      direct: `<path d="M182 86 v64" stroke="#7d8ba0" stroke-width="8"/><path d="M170 118 h24" stroke="#9aa6b5" stroke-width="4"/><text x="182" y="112" text-anchor="middle" fill="#c5d0dc" font-size="9" font-family="system-ui,sans-serif">SHUNT</text>`,
      boiler: `<rect x="154" y="78" width="48" height="64" rx="8" fill="#1a140f" stroke="#ff8a3d"/><text x="178" y="114" text-anchor="middle" fill="#ffb088" font-size="9" font-family="system-ui,sans-serif">KEDEL</text>`,
      dhw_hex: `<rect x="168" y="62" width="28" height="112" rx="4" fill="#12161c" stroke="#d48aaa"/><text x="182" y="58" text-anchor="middle" fill="#f2a3c0" font-size="8" font-family="system-ui,sans-serif">VV</text>`,
      dhw_fs: `<rect x="168" y="62" width="28" height="112" rx="4" fill="#12161c" stroke="#d48aaa"/>`,
    }[plant.type];
    const parts = [];
    if (has('m1')) {
      const gear = plant.actuator !== 'abv';
      parts.push(symbol('m1', `<g transform="translate(78 62)">
        <rect x="-14" y="-16" width="28" height="16" rx="3" fill="#2a313c" stroke="#d7dee8"/>
        <text x="0" y="-5" text-anchor="middle" fill="#fff" font-size="9" font-family="system-ui,sans-serif">${gear ? 'M' : 'ABV'}</text>
        <path d="M-8 8 h16 M0 0 v10" stroke="#ffb088" fill="none"/>
      </g>`));
    }
    if (has('p1')) {
      parts.push(symbol('p1', `<g transform="translate(248 86)">
        <circle r="13" fill="#143024" stroke="#3dd68c"/>
        <path d="M-4 -5 l10 5 l-10 5 z" fill="#3dd68c"/>
      </g>`));
    }
    if (has('s1')) parts.push(pill('s1', 8, 8, 'UDE', 'temperature_s1', val('temperature_s1')));
    if (has('s2')) parts.push(pill('s2', 300, 8, 'RUM S2', 'temperature_s2', val('temperature_s2')));
    if (has('s3')) parts.push(pill('s3', 250, 48, plant.application === '116' ? 'VAND S3' : 'FREM S3', 'temperature_s3', val('temperature_s3')));
    if (has('s4')) parts.push(pill('s4', 8, 168, 'RETUR S4', 'temperature_s4', val('temperature_s4')));
    if (has('meter')) parts.push(pill('meter', 8, 198, 'MÅLER', 'heat_power', val('heat_power')));
    if (has('radiator')) parts.push(symbol('radiator', `<g transform="translate(372 78)"><rect width="28" height="70" rx="3" fill="none" stroke="#ffb088"/><path d="M6 8 v54 M14 8 v54 M22 8 v54" stroke="#ffb088"/></g>`));
    if (has('floor')) parts.push(symbol('floor', `<g transform="translate(360 168)"><path d="M0 10 h48 M8 0 v20 M24 0 v20 M40 0 v20" stroke="#ffb088" fill="none"/></g>`));
    if (has('eca')) parts.push(symbol('eca', `<g transform="translate(392 150)"><rect width="22" height="16" rx="3" fill="#123" stroke="#8fd"/><text x="11" y="12" text-anchor="middle" fill="#8fd" font-size="7" font-family="system-ui,sans-serif">ECA</text></g>`));
    if (has('eca110')) parts.push(symbol('eca110', `<text x="300" y="228" fill="#9aa6b5" font-size="8" font-family="system-ui,sans-serif">ECA 110</text>`));
    if (has('safety')) parts.push(symbol('safety', `<text x="392" y="40" fill="#ffce73" font-size="8" font-family="system-ui,sans-serif">STB</text>`));
    if (has('ext')) parts.push(symbol('ext', `<text x="330" y="200" fill="#9aa6b5" font-size="8" font-family="system-ui,sans-serif">EXT</text>`));
    if (has('fs')) parts.push(symbol('fs', `<g transform="translate(330 168)"><rect width="26" height="16" rx="3" fill="#123" stroke="#7eb6ff"/><text x="13" y="12" text-anchor="middle" fill="#d7e8ff" font-size="8" font-family="system-ui,sans-serif">FS</text></g>`));
    if (v.desired_flow) parts.push(`<text data-bind="desired_flow" x="250" y="108" fill="#ffd7b0" font-size="11" font-family="system-ui,sans-serif">${esc(v.desired_flow)}</text>`);
    if (v.valve) parts.push(`<text data-bind="valve" x="70" y="40" fill="#ffd7b0" font-size="10" font-family="system-ui,sans-serif">${esc(v.valve)}</text>`);
    return `<svg viewBox="0 0 420 236" width="100%" data-plant-type="${plant.type}" role="img">
      <defs><pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="#ffffff22"/></pattern></defs>
      <rect width="420" height="236" fill="#10141a"/><rect width="420" height="236" fill="url(#dots)"/>
      <path class="pipe supply" d="M12 86 H168" stroke="#ff5d4a" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path class="pipe return" d="M168 174 H12" stroke="#9aa3af" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path class="pipe flow" d="M196 86 H360" stroke="${hot}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path class="pipe back" d="M360 174 H196" stroke="${back}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path class="flow" d="M12 86 H168 M196 86 H360 M360 174 H196 M168 174 H12" stroke="#ffffff88" stroke-width="2" fill="none" stroke-dasharray="5 9"/>
      ${core}
      <text x="70" y="78" fill="#ff8d7a" font-size="9" font-family="system-ui,sans-serif">${site}</text>
      <text x="300" y="198" fill="#9ec2ff" font-size="9" font-family="system-ui,sans-serif">${consumer}</text>
      ${parts.join('')}
    </svg>`;
  }
  function bind(svg, values) {
    if (!svg) return;
    for (const node of svg.querySelectorAll('[data-bind]')) {
      const next = values[node.dataset.bind];
      if (next != null && node.textContent !== next) node.textContent = next;
    }
  }
  root.Ecl110Diagram = { markup, bind };
})(typeof globalThis === 'undefined' ? window : globalThis);
