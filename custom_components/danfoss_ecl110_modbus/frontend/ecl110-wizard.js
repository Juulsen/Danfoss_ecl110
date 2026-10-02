/* First-run plant wizard. Enabling disabled entities always requires an explicit confirm. */
(function (root) {
  const TYPES = [
    ['130', 'hex', 'Fjernvarme med varmeveksler', 'District heating with heat exchanger'],
    ['130', 'direct', 'Fjernvarme, direkte med shunt', 'District heating, direct with shunt'],
    ['130', 'boiler', 'Kedelkreds', 'Boiler circuit'],
    ['116', 'dhw_hex', 'Varmt brugsvand', 'Domestic hot water'],
    ['116', 'dhw_fs', 'Varmt brugsvand ved tapning', 'DHW on draw-off'],
  ];
  const PARTS = [
    ['s1', 'S1 · udeføler', 'S1 · outdoor'],
    ['s2', 'S2 · rum / forsyning', 'S2 · room / supply'],
    ['s3', 'S3 · fremløb', 'S3 · flow'],
    ['s4', 'S4 · retur', 'S4 · return'],
    ['m1', 'Motorventil M1', 'Motor valve M1'],
    ['p1', 'Cirkulationspumpe P1', 'Circulation pump P1'],
    ['radiator', 'Radiator', 'Radiator'],
    ['floor', 'Gulvvarme', 'Floor heating'],
    ['eca', 'Rumpanel ECA 61', 'ECA 61 room panel'],
    ['eca110', 'Ugeprogram ECA 110', 'ECA 110 schedule'],
    ['safety', 'Sikkerhedstermostat', 'Safety thermostat'],
    ['ext', 'Ekstern overstyring', 'External override'],
    ['fs', 'Flowswitch', 'Flow switch'],
    ['meter', 'Varmemåler (HA)', 'Heat meter (HA)'],
  ];
  function open(host) {
    const tr = (da, en) => host.tr(da, en);
    const draft = root.Ecl110Plant.normalize(host.plantDraft || host.resolvedPlant?.() || {});
    const dialog = document.createElement('dialog');
    dialog.className = 'ecl-wizard';
    let step = Number(host._wizardStep) || 0;
    const paint = () => {
      dialog.replaceChildren();
      const title = document.createElement('h2');
      title.textContent = tr('Opsæt anlæg', 'Set up plant');
      dialog.append(title);
      const note = document.createElement('p');
      note.textContent = [
        tr('Applikationen skiftes kun på selve ECL\'en (menu 7000).', 'The application is changed only on the ECL (menu 7000).'),
        tr('Vælg de komponenter der findes. Værdier fra ECL er forudfyldt.', 'Choose the parts that exist. Values reported by the ECL are prefilled.'),
        tr('Eksterne målere er valgfrie og bruges kun til visning.', 'External meters are optional and are only used for display.'),
      ][step];
      dialog.append(note);
      if (step === 0) {
        const app = document.createElement('select');
        for (const value of ['130', '116']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value === '130' ? tr('130 · Rumvarme', '130 · Room heating') : tr('116 · Varmt brugsvand', '116 · Domestic hot water');
          app.append(option);
        }
        app.value = draft.application;
        app.onchange = () => {
          draft.application = app.value;
          if (!root.Ecl110Plant.TYPES[draft.application].includes(draft.type)) draft.type = root.Ecl110Plant.TYPES[draft.application][0];
          paint();
        };
        dialog.append(app);
        for (const [application, type, da, en] of TYPES) {
          if (application !== draft.application) continue;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = draft.type === type ? 'primary' : '';
          button.textContent = tr(da, en);
          button.onclick = () => { draft.type = type; paint(); };
          dialog.append(button);
          if (root.Ecl110Diagram) {
            const preview = document.createElement('div');
            preview.innerHTML = root.Ecl110Diagram.markup({ ...draft, type, components: draft.components });
            dialog.append(preview);
          }
        }
      }
      if (step === 1) {
        const actuator = document.createElement('select');
        actuator.innerHTML = `<option value="gear">${tr('Gearmotor 3-punkt', '3-point gear motor')}</option><option value="abv">${tr('Termoaktuator ABV', 'Thermo actuator ABV')}</option>`;
        actuator.value = draft.actuator;
        actuator.onchange = () => { draft.actuator = actuator.value; };
        dialog.append(actuator);
        if (draft.application === '130') {
          const emitters = document.createElement('select');
          emitters.innerHTML = `<option value="radiator">${tr('Radiatorer', 'Radiators')}</option><option value="floor">${tr('Gulv', 'Floor')}</option><option value="both">${tr('Begge', 'Both')}</option>`;
          emitters.value = draft.emitters || 'radiator';
          emitters.onchange = () => { draft.emitters = emitters.value; };
          dialog.append(emitters);
        }
        for (const [key, da, en] of PARTS) {
          const label = document.createElement('label');
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = draft.components.includes(key);
          input.onchange = () => {
            draft.components = input.checked ? [...draft.components, key] : draft.components.filter((item) => item !== key);
          };
          label.append(input, document.createTextNode(' ' + tr(da, en)));
          dialog.append(label);
        }
        const estimate = document.createElement('label');
        const estimateInput = document.createElement('input');
        estimateInput.type = 'checkbox';
        estimateInput.checked = !!draft.estimate_valve;
        estimateInput.onchange = () => { draft.estimate_valve = estimateInput.checked; };
        estimate.append(estimateInput, document.createTextNode(' ' + tr('Vis estimeret ventilåbning (≈, ud fra gangtid 96 s)', 'Show estimated valve position (≈, from the 96 s travel time)')));
        dialog.append(estimate);
      }
      if (step === 2) {
        for (const [key, da, en] of [['room', 'Rumtemperatur', 'Room temperature'], ['heat_power', 'Varmemåler · effekt', 'Heat meter power'], ['heat_energy', 'Varmemåler · energi', 'Heat meter energy'], ['heat_flow', 'Varmemåler · flow', 'Heat meter flow']]) {
          const label = document.createElement('label');
          label.textContent = tr(da, en);
          const input = document.createElement('input');
          input.value = draft.entities[key] || '';
          input.placeholder = 'sensor.…';
          input.onchange = () => { draft.entities[key] = input.value.trim() || null; };
          label.append(input);
          dialog.append(label);
        }
        const where = document.createElement('select');
        where.innerHTML = `<option value="integration">${tr('Integrationen (alle dashboards)', 'The integration (all dashboards)')}</option><option value="card">${tr('Kun dette kort', 'This card only')}</option>`;
        where.value = host.plantTarget || 'integration';
        where.onchange = () => { host.plantTarget = where.value; };
        dialog.append(where);
        if (root.Ecl110Diagram) {
          const preview = document.createElement('div');
          preview.innerHTML = root.Ecl110Diagram.markup(draft, host.diagramValues?.() || {});
          dialog.append(preview);
        }
      }
      const actions = document.createElement('div');
      actions.className = 'actions';
      if (step > 0) {
        const back = document.createElement('button');
        back.type = 'button';
        back.textContent = tr('Tilbage', 'Back');
        back.onclick = () => { step -= 1; paint(); };
        actions.append(back);
      }
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'primary';
      next.textContent = step === 2 ? tr('Gem anlæg', 'Save plant') : tr('Næste', 'Next');
      next.onclick = async () => {
        if (step < 2) { step += 1; paint(); return; }
        const plant = root.Ecl110Plant.normalize(draft);
        if (plant.estimate_valve || plant.components.includes('m1')) {
          const candidates = host.disabledCandidates ? await host.disabledCandidates() : [];
          const wanted = candidates.filter((item) => ['valve_open_signal', 'valve_close_signal', 'actual_mode', 'pump_state'].includes(item.key));
          if (wanted.length && host.confirmEnable) {
            const accepted = host.confirmEnable(wanted);
            if (accepted && host.enableEntities) await host.enableEntities(wanted.map((item) => item.entity_id));
          }
        }
        await host.savePlant(plant, host.plantTarget || 'integration');
        dialog.close();
      };
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = tr('Annullér', 'Cancel');
      cancel.onclick = () => dialog.close();
      actions.append(next, cancel);
      dialog.append(actions);
    };
    dialog.addEventListener('close', () => dialog.remove());
    host.shadowRoot.append(dialog);
    paint();
    dialog.showModal();
    return dialog;
  }
  root.Ecl110Wizard = { open };
})(typeof globalThis === 'undefined' ? window : globalThis);
