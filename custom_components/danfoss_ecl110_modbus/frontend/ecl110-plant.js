/* Plant schema shared with custom_components/danfoss_ecl110_modbus/plant.py */
(function (root) {
  const TYPES = { '130': ['hex', 'direct', 'boiler'], '116': ['dhw_hex', 'dhw_fs'] };
  const COMPONENTS = ['s1', 's2', 's3', 's4', 'm1', 'p1', 'radiator', 'floor', 'eca', 'eca110', 'safety', 'ext', 'fs', 'meter'];
  const ENTITIES = ['room', 'heat_power', 'heat_energy', 'heat_flow'];
  function text(value, limit) {
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned ? cleaned.slice(0, limit || 40) : null;
  }
  function normalize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    let application = String(source.application || '130');
    if (!TYPES[application]) application = '130';
    const allowed = TYPES[application];
    const type = allowed.includes(source.type) ? source.type : allowed[0];
    const actuator = source.actuator === 'abv' ? 'abv' : 'gear';
    const components = [];
    for (const item of Array.isArray(source.components) ? source.components : []) {
      if (!COMPONENTS.includes(item) || components.includes(item)) continue;
      if (item === 'fs' && type !== 'dhw_fs') continue;
      if ((item === 'radiator' || item === 'floor') && application !== '130') continue;
      if (item === 'p1' && type === 'dhw_fs') continue;
      components.push(item);
    }
    const rawEntities = source.entities && typeof source.entities === 'object' ? source.entities : {};
    const entities = {};
    for (const key of ENTITIES) entities[key] = text(rawEntities[key], 255);
    const rawLabels = source.labels && typeof source.labels === 'object' ? source.labels : {};
    const labels = {};
    for (const key of ['site', 'consumer']) {
      const value = text(rawLabels[key]);
      if (value) labels[key] = value;
    }
    const plant = {
      version: 1,
      application,
      type,
      actuator,
      components,
      entities,
      estimate_valve: !!source.estimate_valve,
    };
    if (application === '130') plant.emitters = ['radiator', 'floor', 'both'].includes(source.emitters) ? source.emitters : 'radiator';
    if (Object.keys(labels).length) plant.labels = labels;
    return plant;
  }
  root.Ecl110Plant = { normalize, TYPES, COMPONENTS, ENTITIES };
})(typeof globalThis === 'undefined' ? window : globalThis);
