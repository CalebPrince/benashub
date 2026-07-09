window.BH = window.BH || {};

BH.products = (() => {
  function formatMoney(pesewas) {
    return 'GHS ' + (pesewas / 100).toFixed(2);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function productCard(p) {
    const roundedRating = Math.round(p.avg_rating || 0);
    const ratingHtml = '&starf;'.repeat(roundedRating) + '&star;'.repeat(5 - roundedRating);
    return `
      <div class="col-sm-6 col-lg-4">
        <div class="bh-product-card card h-100">
          <a href="/product/${p.slug}">
            <img src="${p.image_url}" alt="${escapeHtml(p.name)}">
          </a>
          <div class="card-body d-flex flex-column">
            ${p.ships_internationally ? '<span class="badge bh-badge-intl mb-2 align-self-start">Ships Internationally</span>' : ''}
            <a href="/product/${p.slug}" class="bh-product-name mb-1">${escapeHtml(p.name)}</a>
            ${p.review_count > 0 ? `<div class="small mb-2"><span class="bh-stars">${ratingHtml}</span> <span class="text-secondary">${p.avg_rating}</span></div>` : ''}
            <div class="bh-product-price mb-3">${formatMoney(p.price_pesewas)}</div>
            <button class="btn bh-btn-red mt-auto add-to-cart-btn" data-id="${p.id}">Add to Cart</button>
          </div>
        </div>
      </div>
    `;
  }

  function wireAddToCartButtons(container, products) {
    container.querySelectorAll('.add-to-cart-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const product = products.find((p) => p.id === Number(btn.dataset.id));
        if (product) {
          BH.cart.addItem(product, 1);
          btn.textContent = 'Added ✓';
          setTimeout(() => { btn.textContent = 'Add to Cart'; }, 1200);
        }
      });
    });
  }

  async function initHome() {
    const tiles = document.getElementById('categoryTiles');
    const featured = document.getElementById('featuredProducts');
    await loadSiteContent();

    try {
      const categories = await BH.api.get('/categories');
      tiles.innerHTML = categories.map((c) => `
        <div class="col-6 col-md-4 col-lg-2">
          <a class="bh-category-tile" href="/catalog?category=${c.slug}">${escapeHtml(c.name)}</a>
        </div>
      `).join('');
    } catch (e) { /* leave tiles empty on failure */ }

    try {
      const products = await BH.api.get('/products');
      const list = products.slice(0, 6);
      featured.innerHTML = list.map(productCard).join('');
      wireAddToCartButtons(featured, list);

      const topRated = products
        .filter((p) => p.review_count > 0)
        .sort((a, b) => b.avg_rating - a.avg_rating || b.review_count - a.review_count)
        .slice(0, 3);
      const topRatedEl = document.getElementById('topRatedProducts');
      if (topRatedEl) {
        const fallback = products.slice(0, 3);
        const topRatedList = topRated.length ? topRated : fallback;
        topRatedEl.innerHTML = topRatedList.map(productCard).join('');
        wireAddToCartButtons(topRatedEl, topRatedList);
      }

      const newArrivalsEl = document.getElementById('newArrivalProducts');
      if (newArrivalsEl) {
        const arrivals = products.slice(0, 3);
        newArrivalsEl.innerHTML = arrivals.map(productCard).join('');
        wireAddToCartButtons(newArrivalsEl, arrivals);
      }
    } catch (e) { /* leave featured empty on failure */ }
  }

  async function loadSiteContent() {
    try {
      const content = await BH.api.get('/site-content');
      setText('homeEyebrow', content.home_eyebrow);
      setText('homeTitle', content.home_title);
      setText('homeIntro', content.home_intro);
      setText('homeFeature1Title', content.home_feature_1_title);
      setText('homeFeature1Text', content.home_feature_1_text);
      setText('homeFeature2Title', content.home_feature_2_title);
      setText('homeFeature2Text', content.home_feature_2_text);
      setText('homeFeature3Title', content.home_feature_3_title);
      setText('homeFeature3Text', content.home_feature_3_text);
      setText('homeWhyTitle', content.home_why_title);
      setText('homeWhyText', content.home_why_text);
      setText('testimonial1Name', content.testimonial_1_name);
      setText('testimonial1Text', content.testimonial_1_text);
      setText('testimonial2Name', content.testimonial_2_name);
      setText('testimonial2Text', content.testimonial_2_text);
      setText('testimonial3Name', content.testimonial_3_name);
      setText('testimonial3Text', content.testimonial_3_text);
      setLink('homePrimaryCta', content.home_primary_cta_text, content.home_primary_cta_url);
      renderPromo(content);
      if (content.site_meta_title) document.title = content.site_meta_title;
      setMetaDescription(content.site_meta_description);
    } catch (e) { /* keep template defaults */ }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el && value) el.textContent = value;
  }

  function setLink(id, text, href) {
    const el = document.getElementById(id);
    if (!el) return;
    if (text) el.textContent = text;
    if (href) el.href = href;
  }

  function renderPromo(content) {
    const banner = document.getElementById('homePromoBanner');
    if (!banner || content.home_promo_enabled !== '1' || !content.home_promo_text) return;
    document.getElementById('homePromoText').textContent = content.home_promo_text;
    setLink('homePromoLink', content.home_promo_link_text || 'Shop now', content.home_promo_link_url || '/catalog');
    banner.classList.remove('d-none');
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

  async function initCatalog() {
    const grid = document.getElementById('catalogGrid');
    const emptyState = document.getElementById('catalogEmptyState');
    const categoryList = document.getElementById('categoryFilterList');
    const params = new URLSearchParams(window.location.search);
    let activeCategory = params.get('category') || '';
    const searchInput = document.getElementById('navSearchInput');
    let searchTerm = params.get('q') || '';
    if (searchInput) searchInput.value = searchTerm;

    let categories = [];
    try {
      categories = await BH.api.get('/categories');
    } catch (e) {
      categories = [];
    }

    function renderCategoryList() {
      const allItem = `<a href="#" class="list-group-item list-group-item-action ${!activeCategory ? 'active' : ''}" data-slug="">All Products</a>`;
      const items = categories.map((c) => `
        <a href="#" class="list-group-item list-group-item-action ${activeCategory === c.slug ? 'active' : ''}" data-slug="${c.slug}">${escapeHtml(c.name)}</a>
      `).join('');
      categoryList.innerHTML = allItem + items;
      categoryList.querySelectorAll('a').forEach((a) => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          activeCategory = a.dataset.slug;
          renderCategoryList();
          loadProducts();
        });
      });
    }

    async function loadProducts() {
      const qs = [];
      if (activeCategory) qs.push('category=' + encodeURIComponent(activeCategory));
      if (searchTerm) qs.push('q=' + encodeURIComponent(searchTerm));
      let products = [];
      try {
        products = await BH.api.get('/products' + (qs.length ? '?' + qs.join('&') : ''));
      } catch (e) {
        products = [];
      }

      if (products.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('d-none');
      } else {
        emptyState.classList.add('d-none');
        grid.innerHTML = products.map(productCard).join('');
        wireAddToCartButtons(grid, products);
      }
    }

    renderCategoryList();
    loadProducts();

    const form = document.getElementById('navSearchForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        searchTerm = searchInput.value.trim();
        loadProducts();
      });
    }
  }

  return { initHome, initCatalog, productCard, wireAddToCartButtons, formatMoney };
})();
