/* Dynamic ECL 110 process diagram. One 420×220 viewBox for every column width. */
(function (root) {
  const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const FONT = 'var(--ecl-font, Roboto, ui-sans-serif, system-ui, sans-serif)';
  function pill(part, x, y, caption, badge, bind, value, dashed) {
    const text = esc(value || '—');
    const w = Math.max(62, text.length * 7.1 + 16);
    const stroke = dashed ? '#d7b08a' : '#4a5568';
    return `<g data-part="${part}" class="hit" transform="translate(${x} ${y})">
      <text x="2" y="-5" fill="#9aa6b5" font-size="8" font-family="${FONT}">${esc(caption)}</text>
      <rect rx="11" width="${w}" height="22" fill="#161b22" stroke="${stroke}" ${dashed ? 'stroke-dasharray="3 2"' : ''}/>
      <text data-bind="${esc(bind || '')}" x="${w / 2}" y="15" text-anchor="middle" fill="#f7f9fc" font-size="12" font-family="${FONT}">${text}</text>
      ${badge ? `<circle cx="${w - 2}" cy="20" r="7" fill="#12171e" stroke="#ff8a3d"/><text x="${w - 2}" y="23" text-anchor="middle" fill="#ffc49a" font-size="7" font-family="${FONT}">${esc(badge)}</text>` : ''}
    </g>`;
  }
  function loose(x, y, caption, bind, value, dashed) {
    return pill('', x, y, caption, '', bind, value, dashed).replace('data-part=""', 'data-extra="1"');
  }
  function symbol(part, body) {
    return `<g data-part="${part}">${body}</g>`;
  }
  function markup(raw, values) {
    const plant = root.Ecl110Plant.normalize(raw);
    const has = (part) => plant.components.includes(part);
    const v = values || {};
    const val = (key) => v[key] || '—';
    const site = esc(plant.labels?.site || 'FJERNVARME');
    const consumer = esc(plant.labels?.consumer || (plant.application === '116' ? 'TAPPESTED' : 'BOLIG'));
    const hot = plant.application === '116' ? '#f2a3c0' : '#ffb15a';
    const back = plant.application === '116' ? '#7eb6ff' : '#4aa3ff';
    const core = {
      hex: `<g>
        <rect x="158" y="52" width="36" height="118" rx="7" fill="#12161c" stroke="#8d98a8"/>
        <path d="M166 60 v102 M172 60 v102 M178 60 v102 M184 60 v102" stroke="#5aa7ff" fill="none"/>
        <path d="M169 60 v102 M175 60 v102 M181 60 v102" stroke="#ff8a3d" fill="none" opacity="0.85"/>
        <path d="M162 62 L190 164" stroke="#c5ced8" fill="none"/>
        <text x="176" y="184" text-anchor="middle" fill="#9aa6b5" font-size="8" font-family="${FONT}">VEKSLER</text>
      </g>`,
      direct: `<g><path d="M176 78 v78" stroke="#8d98a8" stroke-width="8" stroke-linecap="round"/><text x="176" y="72" text-anchor="middle" fill="#c5d0dc" font-size="8" font-family="${FONT}">SHUNT</text></g>`,
      boiler: `<g><rect x="150" y="78" width="52" height="62" rx="8" fill="#1a140f" stroke="#ff8a3d"/><text x="176" y="112" text-anchor="middle" fill="#ffb088" font-size="9" font-family="${FONT}">KEDEL</text></g>`,
      dhw_hex: `<g><rect x="158" y="52" width="36" height="118" rx="7" fill="#12161c" stroke="#d48aaa"/><text x="176" y="184" text-anchor="middle" fill="#f2a3c0" font-size="8" font-family="${FONT}">VV-VEKSLER</text></g>`,
      dhw_fs: `<g><rect x="158" y="52" width="36" height="118" rx="7" fill="#12161c" stroke="#d48aaa"/><text x="176" y="184" text-anchor="middle" fill="#f2a3c0" font-size="8" font-family="${FONT}">VV-VEKSLER</text></g>`,
    }[plant.type];
    const parts = [];
    if (has('m1')) {
      const gear = plant.actuator !== 'abv';
      parts.push(symbol('m1', `<g transform="translate(78 92)">
        <rect x="-12" y="-30" width="24" height="16" rx="3" fill="#242b36" stroke="#e6ebf2"/>
        <text y="-19" text-anchor="middle" fill="#fff" font-size="10" font-family="${FONT}">${gear ? 'M' : 'ABV'}</text>
        <path d="M0 -14 v8" stroke="#e6ebf2"/>
        <path d="M-8 -2 L0 6 L8 -2 M-8 14 L0 6 L8 14" fill="none" stroke="#f2f5f8" stroke-width="1.6" stroke-linejoin="round"/>
      </g>`));
    }
    if (has('p1')) {
      parts.push(symbol('p1', `<g transform="translate(268 92)">
        <circle r="13" fill="#10261c" stroke="#3dd68c" stroke-width="1.6"/>
        <path d="M-4 -5 l10 5 l-10 5 z" fill="#3dd68c"/>
        <text y="28" text-anchor="middle" fill="#9aa6b5" font-size="8" font-family="${FONT}">P1</text>
      </g>`));
    }
    if (has('s1')) parts.push(pill('s1', 8, 18, 'UDE', 'S1', 'temperature_s1', val('temperature_s1')));
    if (has('s2')) parts.push(pill('s2', 250, 12, 'RUM', 'S2', 'temperature_s2', val('temperature_s2')));
    if (has('s3')) parts.push(pill('s3', 292, 58, 'FREM', 'S3', 'temperature_s3', val('temperature_s3')));
    if (has('s4')) parts.push(pill('s4', 36, 132, 'RETUR', 'S4', 'temperature_s4', val('temperature_s4')));
    if (has('meter')) parts.push(pill('meter', 8, 186, 'VARMEMÅLER', '', 'heat_power', val('heat_power')));
    if (has('radiator')) parts.push(symbol('radiator', `<g transform="translate(384 70)"><rect x="0" y="8" width="26" height="78" rx="4" fill="#141820" stroke="#ffb15a"/><path d="M6 16 v62 M13 16 v62 M20 16 v62" stroke="#ffb15a"/></g>`));
    if (has('floor')) parts.push(symbol('floor', `<g transform="translate(360 176)"><path d="M0 8 h46 M8 0 v16 M22 0 v16 M36 0 v16" stroke="#ffb15a" fill="none"/></g>`));
    if (has('eca')) parts.push(symbol('eca', `<g transform="translate(392 168)"><rect width="22" height="14" rx="3" fill="#102028" stroke="#7ddec0"/><text x="11" y="10" text-anchor="middle" fill="#b8ffe8" font-size="7" font-family="${FONT}">ECA</text></g>`));
    if (has('eca110')) parts.push(symbol('eca110', `<text x="300" y="214" fill="#9aa6b5" font-size="8" font-family="${FONT}">ECA 110</text>`));
    if (has('safety')) parts.push(symbol('safety', `<text x="392" y="28" fill="#ffce73" font-size="8" font-family="${FONT}">STB</text>`));
    if (has('ext')) parts.push(symbol('ext', `<text x="330" y="214" fill="#9aa6b5" font-size="8" font-family="${FONT}">EXT</text>`));
    if (has('fs')) parts.push(symbol('fs', `<g transform="translate(330 150)"><rect width="26" height="16" rx="3" fill="#102033" stroke="#7eb6ff"/><text x="13" y="11" text-anchor="middle" fill="#d7e8ff" font-size="8" font-family="${FONT}">FS</text></g>`));
    let extras = '';
    if (!has('s2') && v.room) extras += loose(248, 12, 'RUM · EKST.', 'room', v.room, false);
    if (v.room_target) extras += `<text x="360" y="28" fill="#9aa6b5" font-size="10" font-family="${FONT}">→ ${esc(v.room_target)}</text>`;
    if (v.desired_flow) extras += loose(300, 96, '', '', 'desired_flow', v.desired_flow, true);
    return `<svg viewBox="0 0 420 220" width="100%" data-plant-type="${plant.type}" role="img">
      <style>text{font-family:${FONT}}</style>
      <defs><pattern id="ecldots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="#ffffff18"/></pattern></defs>
      <rect width="420" height="220" rx="12" fill="#10141a"/><rect width="420" height="220" fill="url(#ecldots)"/>
      <path d="M16 92 H158" stroke="#ff5a45" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M16 92 H158" stroke="#ffb0a4" stroke-width="2" fill="none" opacity="0.55"/>
      <path d="M194 92 H372" stroke="${hot}" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M372 92 H396 V112" stroke="${hot}" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M396 156 V168 H194" stroke="${back}" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M158 168 H16" stroke="#9aa3af" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path class="flow" d="M16 92 H158 M194 92 H396 V112 M396 156 V168 H16" stroke="#ffffff99" stroke-width="1.6" fill="none" stroke-dasharray="4 8"/>
      ${core}
      <text x="28" y="84" fill="#ff8d7a" font-size="9" font-family="${FONT}">${site}</text>
      <text x="214" y="184" fill="#8eb6ef" font-size="9" font-family="${FONT}">${plant.application === '116' ? 'RETUR' : 'RETUR ANLÆG'}</text>
      <text x="392" y="188" text-anchor="end" fill="#9ec2ff" font-size="9" font-family="${FONT}">${consumer}</text>
      ${parts.join('')}${extras}
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
