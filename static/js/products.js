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
    return `
      <div class="col-sm-6 col-lg-4">
        <div class="bh-product-card card h-100">
          <a href="/product/${p.slug}">
            <img src="${p.image_url}" alt="${escapeHtml(p.name)}">
          </a>
          <div class="card-body d-flex flex-column">
            ${p.ships_internationally ? '<span class="badge bh-badge-intl mb-2 align-self-start">Ships Internationally</span>' : ''}
            <a href="/product/${p.slug}" class="bh-product-name mb-1">${escapeHtml(p.name)}</a>
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
      const list = products.slice(0, 8);
      featured.innerHTML = list.map(productCard).join('');
      wireAddToCartButtons(featured, list);
    } catch (e) { /* leave featured empty on failure */ }
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
