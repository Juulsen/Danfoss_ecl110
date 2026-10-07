/* Locked artwork by Juulsen. Files in art/ are used verbatim and stacked at 0,0. */
(function (root) {
  const NS = 'http://www.w3.org/2000/svg';
  const DASH = '–';

  function fileName(portrait, kind) {
    const suffix = portrait ? '-mobil' : '';
    if (kind === 'base') return portrait ? 'ecl110-mobil.svg' : 'ecl110-anlaeg.svg';
    return 'svg/' + kind + suffix + '.svg';
  }

  function layers(portrait, plant) {
    const connection = plant && plant.connection === 'direkte' ? 'direkte' : 'veksler';
    const valve = plant && plant.valve === '2vejs' ? 'ventil-2vejs' : 'ventil-3vejs';
    return [fileName(portrait, 'base'), fileName(portrait, connection), fileName(portrait, valve)];
  }

  function fontSize(node, text, width, height) {
    let size = Math.min(13, Math.max(8, height * 0.62));
    node.setAttribute('font-size', String(size));
    node.textContent = text;
    try {
      while (size > 7 && node.getComputedTextLength() > width - 8) {
        size -= 0.5;
        node.setAttribute('font-size', String(size));
      }
    } catch { /* not laid out yet */ }
    if (size <= 7) {
      node.setAttribute('textLength', String(Math.max(8, width - 8)));
      node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    } else {
      node.removeAttribute('textLength');
      node.removeAttribute('lengthAdjust');
    }
  }

  function place(svg, id, text, bind) {
    const rect = svg.querySelector('#' + id);
    if (!rect) return;
    let node = svg.querySelector('[data-live="' + id + '"]');
    if (!node) {
      node = root.document.createElementNS(NS, 'text');
      node.setAttribute('data-live', id);
      node.setAttribute('fill', '#e8eaed');
      node.setAttribute('text-anchor', 'middle');
      node.setAttribute('dominant-baseline', 'central');
      node.setAttribute('font-weight', '500');
      node.setAttribute('font-family', 'Roboto, -apple-system, Segoe UI, Arial, sans-serif');
      node.setAttribute('pointer-events', 'all');
      rect.after(node);
    }
    const x = Number(rect.getAttribute('x')) || 0;
    const y = Number(rect.getAttribute('y')) || 0;
    const w = Number(rect.getAttribute('width')) || 0;
    const h = Number(rect.getAttribute('height')) || 0;
    node.setAttribute('x', String(x + w / 2));
    node.setAttribute('y', String(y + h / 2 + 0.5));
    if (bind) node.setAttribute('data-bind', bind);
    else node.removeAttribute('data-bind');
    fontSize(node, text == null || text === '' ? DASH : String(text), w, h);
  }

  function tagChevrons(svg) {
    svg.querySelectorAll('polyline').forEach((node, index) => {
      node.classList.add('ecl-flow');
      node.style.animationDelay = (index * 0.12).toFixed(2) + 's';
    });
  }

  async function readFile(name, version) {
    if (root.Ecl110ArtFiles && root.Ecl110ArtFiles[name]) return root.Ecl110ArtFiles[name];
    const response = await fetch('/ecl110-static/art/' + name + '?v=' + (version || ''));
    if (!response.ok) throw Error(name);
    return response.text();
  }

  async function mount(host, options) {
    const portrait = !!options.portrait;
    const names = layers(portrait, options.plant);
    host.replaceChildren();
    host.dataset.art = names.join('|');
    for (const name of names) {
      const layer = root.document.createElement('div');
      layer.className = 'ecl-layer';
      const raw = await readFile(name, options.version);
      const start = raw.indexOf('<svg');
      layer.innerHTML = start >= 0 ? raw.slice(start) : raw;
      const svg = layer.querySelector('svg');
      if (svg) {
        tagChevrons(svg);
        for (const [id, item] of Object.entries(options.values || {})) place(svg, id, item.text, item.bind);
      }
      host.append(layer);
    }
  }

  function patch(host, values) {
    if (!host) return;
    for (const [id, item] of Object.entries(values || {})) {
      host.querySelectorAll('[data-live="' + id + '"]').forEach((node) => {
        const rect = node.ownerSVGElement && node.ownerSVGElement.querySelector('#' + id);
        const w = rect ? Number(rect.getAttribute('width')) || 0 : 80;
        const h = rect ? Number(rect.getAttribute('height')) || 0 : 22;
        if (item.bind) node.setAttribute('data-bind', item.bind);
        else node.removeAttribute('data-bind');
        fontSize(node, item.text == null || item.text === '' ? DASH : String(item.text), w, h);
      });
    }
  }

  root.Ecl110Art = { layers, mount, patch, place, DASH };
})(typeof globalThis === 'undefined' ? window : globalThis);
