window.BH = window.BH || {};

BH.productDetail = (() => {
  function formatMoney(pesewas) {
    return 'GHS ' + (pesewas / 100).toFixed(2);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function getSlugFromUrl() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1];
  }

  async function init() {
    const container = document.getElementById('productDetail');
    const notFound = document.getElementById('productNotFound');
    const slug = getSlugFromUrl();

    let product;
    try {
      product = await BH.api.get('/products/' + encodeURIComponent(slug));
    } catch (e) {
      container.classList.add('d-none');
      notFound.classList.remove('d-none');
      return;
    }

    document.title = product.name + ' — Benas Hub';

    container.innerHTML = `
      <div class="col-lg-6">
        <img src="${product.image_url}" class="img-fluid rounded" alt="${escapeHtml(product.name)}">
      </div>
      <div class="col-lg-6">
        ${product.ships_internationally
          ? '<span class="badge bh-badge-intl mb-2">Ships Internationally</span>'
          : '<span class="badge bg-secondary mb-2">Ghana Only</span>'}
        <h1 class="mb-2">${escapeHtml(product.name)}</h1>
        <div class="bh-product-price fs-3 mb-3">${formatMoney(product.price_pesewas)}</div>
        <p class="text-secondary">${escapeHtml(product.description || '')}</p>
        <p class="small text-secondary">${product.stock_qty > 0 ? product.stock_qty + ' in stock' : 'Out of stock'}</p>
        <div class="d-flex align-items-center gap-2 mb-4">
          <input type="number" min="1" value="1" id="qtyInput" class="form-control" style="max-width:100px">
          <button class="btn bh-btn-red" id="addToCartBtn" ${product.stock_qty === 0 ? 'disabled' : ''}>Add to Cart</button>
        </div>
        <div class="bh-filter-card">
          <h6 class="mb-2">Check shipping</h6>
          <select class="form-select form-select-sm mb-2" id="shipCountrySelect">
            <option value="">Select destination&hellip;</option>
          </select>
          <div id="shipEstimateResult" class="small"></div>
        </div>
      </div>
    `;

    document.getElementById('addToCartBtn').addEventListener('click', () => {
      const qty = Math.max(1, parseInt(document.getElementById('qtyInput').value, 10) || 1);
      BH.cart.addItem(product, qty);
      const btn = document.getElementById('addToCartBtn');
      btn.textContent = 'Added ✓';
      setTimeout(() => { btn.textContent = 'Add to Cart'; }, 1200);
    });

    const countrySelect = document.getElementById('shipCountrySelect');
    await BH.shipping.populateCountrySelect(countrySelect);
    countrySelect.addEventListener('change', async (e) => {
      const country = e.target.value;
      const resultEl = document.getElementById('shipEstimateResult');
      if (!country) {
        resultEl.innerHTML = '';
        return;
      }
      resultEl.innerHTML = 'Checking&hellip;';
      const result = await BH.shipping.estimate(country, [{ product_id: product.id, qty: 1 }]);
      BH.shipping.renderEstimateResult(resultEl, result);
    });
  }

  return { init };
})();
