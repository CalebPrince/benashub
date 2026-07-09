window.BH = window.BH || {};

BH.shipping = (() => {
  let zonesCache = null;

  async function getZones() {
    if (!zonesCache) {
      zonesCache = await BH.api.get('/shipping/zones');
    }
    return zonesCache;
  }

  async function populateCountrySelect(selectEl) {
    const zones = await getZones();
    const groups = zones.map((zone) => {
      const options = zone.countries.map((c) => `<option value="${c}">${c}</option>`).join('');
      return `<optgroup label="${zone.zone_name}">${options}</optgroup>`;
    }).join('');
    selectEl.insertAdjacentHTML('beforeend', groups);
  }

  async function estimate(country, items) {
    try {
      return await BH.api.post('/shipping/estimate', { country, items });
    } catch (e) {
      return { deliverable: false, error: 'Could not calculate shipping.' };
    }
  }

  function formatMoney(pesewas) {
    return 'GHS ' + (pesewas / 100).toFixed(2);
  }

  function renderEstimateResult(container, result) {
    if (result.error && !result.zone_name) {
      container.innerHTML = `<span class="text-danger">${result.error}</span>`;
      return;
    }
    if (result.excluded_items && result.excluded_items.length > 0) {
      const names = result.excluded_items.map((i) => i.name).join(', ');
      container.innerHTML = `<span class="text-danger">Does not ship to this destination: ${names}</span>`;
      return;
    }
    if (!result.deliverable) {
      container.innerHTML = '<span class="text-danger">Not deliverable to this destination.</span>';
      return;
    }
    container.innerHTML = `<span class="text-success">Ships to this destination &mdash; ${formatMoney(result.shipping_cost_pesewas)} (${result.zone_name})</span>`;
  }

  return { getZones, populateCountrySelect, estimate, renderEstimateResult };
})();
