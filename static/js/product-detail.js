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

  function parseList(value) {
    return (value || '')
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
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

    document.title = product.meta_title || (product.name + ' — Benas Hub');
    setMetaDescription(product.meta_description || product.description || product.extended_description || '');

    const galleryImages = buildGalleryImages(product);
    const badges = parseList(product.badges);

    container.innerHTML = `
      <div class="col-lg-6">
        <div class="bh-product-gallery">
          <img src="${escapeHtml(galleryImages[0])}" class="img-fluid rounded bh-gallery-main" id="productGalleryMain" alt="${escapeHtml(product.name)}">
          ${galleryImages.length > 1 ? `<div class="bh-gallery-thumbs mt-3">${galleryImages.map((url, index) => `
            <button type="button" class="bh-gallery-thumb ${index === 0 ? 'active' : ''}" data-image="${escapeHtml(url)}" aria-label="View product image ${index + 1}">
              <img src="${escapeHtml(url)}" alt="">
            </button>
          `).join('')}</div>` : ''}
        </div>
      </div>
      <div class="col-lg-6">
        ${badges.length ? `<div class="d-flex flex-wrap gap-2 mb-2">${badges.map((b) => `<span class="badge bh-badge-red">${escapeHtml(b)}</span>`).join('')}</div>` : ''}
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
          <button class="btn bh-btn-outline-red" id="wishlistBtn">Save</button>
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

    wireGallery();

    document.getElementById('addToCartBtn').addEventListener('click', () => {
      const qty = Math.max(1, parseInt(document.getElementById('qtyInput').value, 10) || 1);
      BH.cart.addItem(product, qty);
      const btn = document.getElementById('addToCartBtn');
      btn.textContent = 'Added ✓';
      setTimeout(() => { btn.textContent = 'Add to Cart'; }, 1200);
    });
    document.getElementById('wishlistBtn').addEventListener('click', async () => {
      const btn = document.getElementById('wishlistBtn');
      try {
        await BH.api.post('/customers/wishlist', { product_id: product.id });
        btn.textContent = 'Saved';
        btn.disabled = true;
      } catch (err) {
        if (err.status === 401) {
          window.location.href = '/account/login';
          return;
        }
        btn.textContent = 'Try Again';
        setTimeout(() => { btn.textContent = 'Save'; }, 1600);
      }
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
    renderStructuredData(product, galleryImages);
    await loadBundleProducts(product);
    await loadRelatedProducts(product);
    await initReviews(slug);
  }

  function buildGalleryImages(product) {
    const urls = [product.image_url].concat(parseList(product.gallery_images));
    return [...new Set(urls.filter(Boolean))];
  }

  function wireGallery() {
    const main = document.getElementById('productGalleryMain');
    if (!main) return;
    document.querySelectorAll('.bh-gallery-thumb').forEach((btn) => {
      btn.addEventListener('click', () => {
        main.src = btn.dataset.image;
        document.querySelectorAll('.bh-gallery-thumb').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function setMetaDescription(value) {
    if (!value) return;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = value;
  }

  function renderStructuredData(product, galleryImages) {
    const oldScript = document.getElementById('productStructuredData');
    if (oldScript) oldScript.remove();
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      image: galleryImages.map((url) => new URL(url, window.location.origin).href),
      description: product.meta_description || product.description || product.extended_description || product.name,
      sku: String(product.id),
      brand: { '@type': 'Brand', name: 'Benas Hub' },
      aggregateRating: product.review_count > 0 ? {
        '@type': 'AggregateRating',
        ratingValue: product.avg_rating,
        reviewCount: product.review_count,
      } : undefined,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'GHS',
        price: (product.price_pesewas / 100).toFixed(2),
        availability: product.stock_qty > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: window.location.href,
      },
    };
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'productStructuredData';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
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

  async function loadBundleProducts(product) {
    const ids = parseList(product.bundle_product_ids).map((id) => Number(id)).filter(Boolean);
    if (ids.length === 0) return;
    const section = document.getElementById('bundleProductsSection');
    const grid = document.getElementById('bundleProducts');
    if (!section || !grid) return;
    try {
      const products = await BH.api.get('/products');
      const bundles = ids
        .map((id) => products.find((p) => p.id === id))
        .filter(Boolean)
        .slice(0, 3);
      if (bundles.length === 0) return;
      grid.innerHTML = bundles.map(BH.products.productCard).join('');
      BH.products.wireAddToCartButtons(grid, bundles);
      section.classList.remove('d-none');
    } catch (e) { /* leave bundle products hidden on failure */ }
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
        ${r.admin_reply ? `<div class="bh-admin-reply mt-2"><strong>Benas Hub reply:</strong> ${escapeHtml(r.admin_reply)}</div>` : ''}
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
