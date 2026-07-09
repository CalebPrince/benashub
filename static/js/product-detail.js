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

  function starsHtml(rating) {
    const full = Math.round(rating);
    return `<span class="bh-stars" aria-label="${rating} out of 5">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
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
        ${product.review_count > 0
          ? `<div class="mb-2">${starsHtml(product.avg_rating)} <span class="small text-secondary">${product.avg_rating} (${product.review_count} review${product.review_count === 1 ? '' : 's'})</span></div>`
          : ''}
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

    renderProductInfo(product);
    await loadRelatedProducts(product);
    await initReviews(slug);
  }

  function renderProductInfo(product) {
    document.getElementById('productInfoSections').classList.remove('d-none');

    const description = product.extended_description || product.description || 'A practical organic product selected for everyday household and wellness routines.';
    const usageInstructions = product.usage_instructions || `
      Read the product label before first use.
      Use as part of your normal home, personal care, or wellness routine.
      Store in a cool, dry place and keep sealed when not in use.
      For skincare or wellness items, test a small amount first if you have sensitive skin.
    `;
    const deliveryNotes = product.delivery_notes || `
      ${product.ships_internationally ? 'This item is eligible for international shipping.' : 'This item currently ships within Ghana only.'}
      Use the shipping checker above to estimate delivery cost before checkout.
      Order status can be checked from the Track Order page after purchase.
      See Shipping & Returns for return windows and product condition requirements.
    `;
    document.getElementById('descriptionPanel').innerHTML = `
      <h5 class="mb-3">About ${escapeHtml(product.name)}</h5>
      <p class="text-secondary">${escapeHtml(description)}</p>
      <p class="text-secondary mb-0">Benas Hub focuses on useful organic household and health products with clear pricing, stock visibility, and straightforward delivery options.</p>
    `;

    document.getElementById('usagePanel').innerHTML = `
      <h5 class="mb-3">How to Use</h5>
      ${textBlockHtml(usageInstructions)}
    `;

    document.getElementById('deliveryPanel').innerHTML = `
      <h5 class="mb-3">Delivery &amp; Returns</h5>
      ${textBlockHtml(deliveryNotes)}
    `;

    document.getElementById('productHighlights').innerHTML = `
      <div class="bh-highlight-row">
        <span>Stock</span>
        <strong>${product.stock_qty > 0 ? product.stock_qty + ' available' : 'Out of stock'}</strong>
      </div>
      <div class="bh-highlight-row">
        <span>Shipping</span>
        <strong>${product.ships_internationally ? 'Ghana & abroad' : 'Ghana only'}</strong>
      </div>
      <div class="bh-highlight-row">
        <span>Reviews</span>
        <strong>${product.review_count ? product.avg_rating + ' / 5' : 'Be first'}</strong>
      </div>
      <div class="bh-highlight-row">
        <span>Checkout</span>
        <strong>Secure Paystack payment</strong>
      </div>
    `;
  }

  function textBlockHtml(text) {
    const lines = (text || '').split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) {
      return `<p class="text-secondary mb-0">${escapeHtml(text || '')}</p>`;
    }
    return `<ul class="bh-clean-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`;
  }

  async function loadRelatedProducts(product) {
    const section = document.getElementById('relatedProductsSection');
    const grid = document.getElementById('relatedProducts');
    try {
      const products = await BH.api.get('/products');
      let related = products
        .filter((p) => p.id !== product.id && p.category_id === product.category_id)
        .slice(0, 3);
      if (related.length < 3) {
        const extras = products
          .filter((p) => p.id !== product.id && !related.some((r) => r.id === p.id))
          .slice(0, 3 - related.length);
        related = related.concat(extras);
      }
      if (related.length === 0) return;
      grid.innerHTML = related.map(BH.products.productCard).join('');
      BH.products.wireAddToCartButtons(grid, related);
      section.classList.remove('d-none');
    } catch (e) { /* leave related products hidden on failure */ }
  }

  async function initReviews(slug) {
    document.getElementById('productReviews').classList.remove('d-none');
    await loadReviews(slug);

    let loggedIn = false;
    try {
      loggedIn = (await BH.api.get('/customers/session')).logged_in;
    } catch (e) { /* treat as logged out */ }

    if (!loggedIn) {
      document.getElementById('reviewLoginPrompt').classList.remove('d-none');
      return;
    }

    const form = document.getElementById('reviewForm');
    form.classList.remove('d-none');
    let selectedRating = 0;

    const starsInput = document.getElementById('reviewStarsInput');
    starsInput.innerHTML = [1, 2, 3, 4, 5].map((n) =>
      `<button type="button" class="bh-star-btn" data-rating="${n}" aria-label="${n} star${n === 1 ? '' : 's'}">☆</button>`
    ).join('');
    starsInput.querySelectorAll('.bh-star-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedRating = Number(btn.dataset.rating);
        starsInput.querySelectorAll('.bh-star-btn').forEach((b) => {
          b.textContent = Number(b.dataset.rating) <= selectedRating ? '★' : '☆';
          b.classList.toggle('selected', Number(b.dataset.rating) <= selectedRating);
        });
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('reviewError');
      const savedEl = document.getElementById('reviewSaved');
      errorEl.classList.add('d-none');
      savedEl.classList.add('d-none');
      if (!selectedRating) {
        errorEl.textContent = 'Pick a star rating first';
        errorEl.classList.remove('d-none');
        return;
      }
      try {
        await BH.api.post('/products/' + encodeURIComponent(slug) + '/reviews', {
          rating: selectedRating,
          body: new FormData(form).get('body'),
        });
        savedEl.classList.remove('d-none');
        await loadReviews(slug);
      } catch (err) {
        errorEl.textContent = err.message || 'Could not submit review';
        errorEl.classList.remove('d-none');
      }
    });
  }

  async function loadReviews(slug) {
    const listEl = document.getElementById('reviewsList');
    const emptyEl = document.getElementById('reviewsEmptyState');
    let data;
    try {
      data = await BH.api.get('/products/' + encodeURIComponent(slug) + '/reviews');
    } catch (e) {
      return;
    }
    const reviews = data.reviews;
    if (reviews.length === 0) {
      emptyEl.classList.remove('d-none');
      listEl.innerHTML = '';
      return;
    }
    emptyEl.classList.add('d-none');
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    document.getElementById('reviewsSummary').innerHTML =
      `${starsHtml(avg)} ${avg.toFixed(1)} &middot; ${reviews.length} review${reviews.length === 1 ? '' : 's'}`;
    listEl.innerHTML = reviews.map((r) => `
      <div class="bh-review mb-3 pb-3 border-bottom">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span>${starsHtml(r.rating)} <strong class="small">${escapeHtml(r.customer_name)}</strong>
            ${r.is_mine ? '<span class="badge bg-secondary">Your review</span>' : ''}</span>
          <span class="small text-secondary">${escapeHtml((r.created_at || '').split(' ')[0])}</span>
        </div>
        ${r.body ? `<p class="small mb-0">${escapeHtml(r.body)}</p>` : ''}
      </div>
    `).join('');

    const mine = reviews.find((r) => r.is_mine);
    if (mine) {
      document.getElementById('reviewFormTitle').textContent = 'Update Your Review';
      const form = document.getElementById('reviewForm');
      if (form) form.body.value = mine.body || '';
    }
  }

  return { init };
})();
