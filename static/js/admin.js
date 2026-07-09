window.BH = window.BH || {};

BH.admin = (() => {
  function formatMoney(pesewas) {
    return 'GHS ' + (pesewas / 100).toFixed(2);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function slugify(str) {
    return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function initLogin() {
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('loginError');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.add('d-none');
      const formData = new FormData(form);
      try {
        await BH.api.post('/admin/login', {
          username: formData.get('username'),
          password: formData.get('password'),
        });
        window.location.href = '/admin/dashboard';
      } catch (err) {
        errorEl.textContent = err.message || 'Login failed';
        errorEl.classList.remove('d-none');
      }
    });
  }

  // ---------- SHARED CHROME (every logged-in admin page) ----------

  async function initAdminChrome() {
    try {
      const sessionInfo = await BH.api.get('/admin/session');
      if (!sessionInfo.logged_in) {
        window.location.href = '/admin/login';
        return false;
      }
      document.getElementById('adminUsername').textContent = sessionInfo.username;
    } catch (e) {
      window.location.href = '/admin/login';
      return false;
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await BH.api.post('/admin/logout');
      window.location.href = '/admin/login';
    });
    return true;
  }

  // ---------- OVERVIEW ----------

  async function initOverview() {
    if (!(await initAdminChrome())) return;
    const stats = await BH.api.get('/admin/stats');
    renderStatCards(stats);
    renderRecentOrders(stats.recent_orders);
    renderLowStock(stats.low_stock);
  }

  function statCard(label, value) {
    return `
      <div class="col-sm-6 col-lg-4 col-xl-2">
        <div class="bh-stat-card">
          <div class="bh-stat-value">${value}</div>
          <div class="bh-stat-label">${label}</div>
        </div>
      </div>
    `;
  }

  function renderStatCards(stats) {
    document.getElementById('statCards').innerHTML = [
      statCard('Products', stats.product_count),
      statCard('Orders', stats.order_count),
      statCard('Pending Payment', stats.pending_payment_count),
      statCard('Revenue', formatMoney(stats.revenue_pesewas)),
      statCard('Customers', stats.customer_count),
      statCard('Low Stock', stats.low_stock.length),
    ].join('');
  }

  function renderRecentOrders(orders) {
    const body = document.getElementById('recentOrdersBody');
    const emptyState = document.getElementById('recentOrdersEmpty');
    if (orders.length === 0) {
      emptyState.classList.remove('d-none');
      return;
    }
    body.innerHTML = orders.map((o) => `
      <tr>
        <td>${escapeHtml(o.order_ref)}</td>
        <td>${escapeHtml(o.customer_name)}</td>
        <td>${escapeHtml(o.status.replace('_', ' '))}</td>
        <td>${formatMoney(o.total_pesewas)}</td>
      </tr>
    `).join('');
  }

  function renderLowStock(items) {
    const list = document.getElementById('lowStockList');
    const emptyState = document.getElementById('lowStockEmpty');
    if (items.length === 0) {
      emptyState.classList.remove('d-none');
      return;
    }
    list.innerHTML = items.map((p) => `
      <li class="list-group-item d-flex justify-content-between align-items-center px-0">
        <span>${escapeHtml(p.name)}</span>
        <span class="badge bg-danger">${p.stock_qty} left</span>
      </li>
    `).join('');
  }

  // ---------- PRODUCTS ----------

  let categories = [];
  let currentProducts = [];

  async function initProducts() {
    if (!(await initAdminChrome())) return;
    categories = await BH.api.get('/admin/categories');
    populateCategorySelect();
    wireProductsTab();
    await loadProducts();
  }

  function populateCategorySelect() {
    const select = document.getElementById('productCategorySelect');
    select.innerHTML = categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  function wireProductsTab() {
    document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
    document.getElementById('showInactiveToggle').addEventListener('change', renderProductsTable);

    const form = document.getElementById('productForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveProduct(form);
    });

    document.getElementById('productImageInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('image', file);
      try {
        const result = await BH.api.postForm('/admin/products/upload', formData);
        form.querySelector('input[name="image_url"]').value = result.url;
        const preview = document.getElementById('productImagePreview');
        preview.src = result.url;
        preview.classList.remove('d-none');
      } catch (err) {
        const errorEl = document.getElementById('productFormError');
        errorEl.textContent = err.message;
        errorEl.classList.remove('d-none');
      }
    });
  }

  async function loadProducts() {
    currentProducts = await BH.api.get('/admin/products');
    renderProductsTable();
  }

  function renderProductsTable() {
    const showInactive = document.getElementById('showInactiveToggle').checked;
    const body = document.getElementById('productsTableBody');
    const rows = currentProducts.filter((p) => showInactive || p.is_active);
    body.innerHTML = rows.map((p) => {
      const cat = categories.find((c) => c.id === p.category_id);
      return `
        <tr>
          <td><img src="${p.image_url}" class="bh-thumb" alt=""></td>
          <td>${escapeHtml(p.name)}</td>
          <td>${cat ? escapeHtml(cat.name) : ''}</td>
          <td>${formatMoney(p.price_pesewas)}</td>
          <td>${p.stock_qty}</td>
          <td>${p.ships_internationally ? 'Yes' : 'No'}</td>
          <td>${p.is_active ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Inactive</span>'}</td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-outline-secondary edit-product-btn" data-id="${p.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger delete-product-btn" data-id="${p.id}">Delete</button>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('.edit-product-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const product = currentProducts.find((p) => p.id === Number(btn.dataset.id));
        openProductModal(product);
      });
    });
    body.querySelectorAll('.delete-product-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Deactivate this product? It will be hidden from the shop.')) return;
        await BH.api.del('/admin/products/' + btn.dataset.id);
        await loadProducts();
      });
    });
  }

  let productModal;
  function openProductModal(product) {
    const form = document.getElementById('productForm');
    form.reset();
    document.getElementById('productFormError').classList.add('d-none');
    document.getElementById('productImagePreview').classList.add('d-none');

    document.getElementById('productModalTitle').textContent = product ? 'Edit Product' : 'Add Product';
    form.querySelector('input[name="id"]').value = product ? product.id : '';
    form.querySelector('input[name="image_url"]').value = product ? product.image_url : '';

    if (product) {
      form.querySelector('input[name="name"]').value = product.name;
      form.querySelector('input[name="slug"]').value = product.slug;
      form.querySelector('select[name="category_id"]').value = product.category_id;
      form.querySelector('input[name="price_ghs"]').value = (product.price_pesewas / 100).toFixed(2);
      form.querySelector('input[name="stock_qty"]').value = product.stock_qty;
      form.querySelector('textarea[name="description"]').value = product.description || '';
      form.querySelector('input[name="ships_internationally"]').checked = product.ships_internationally;
      form.querySelector('input[name="is_active"]').checked = product.is_active;
      if (product.image_url) {
        const preview = document.getElementById('productImagePreview');
        preview.src = product.image_url;
        preview.classList.remove('d-none');
      }
    } else {
      form.querySelector('input[name="is_active"]').checked = true;
    }

    if (!productModal) productModal = new bootstrap.Modal(document.getElementById('productModal'));
    productModal.show();
  }

  async function saveProduct(form) {
    const errorEl = document.getElementById('productFormError');
    errorEl.classList.add('d-none');
    const formData = new FormData(form);
    const id = formData.get('id');
    const payload = {
      name: formData.get('name'),
      slug: formData.get('slug') || slugify(formData.get('name')),
      category_id: Number(formData.get('category_id')),
      price_pesewas: Math.round(parseFloat(formData.get('price_ghs')) * 100),
      stock_qty: Number(formData.get('stock_qty')),
      description: formData.get('description'),
      ships_internationally: form.querySelector('input[name="ships_internationally"]').checked,
      is_active: form.querySelector('input[name="is_active"]').checked,
      image_url: formData.get('image_url'),
    };

    try {
      if (id) {
        await BH.api.put('/admin/products/' + id, payload);
      } else {
        await BH.api.post('/admin/products', payload);
      }
      productModal.hide();
      await loadProducts();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  }

  // ---------- CATEGORIES ----------

  let currentCategories = [];

  async function initCategories() {
    if (!(await initAdminChrome())) return;
    wireCategoriesTab();
    await loadCategories();
  }

  function wireCategoriesTab() {
    document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal());
    document.getElementById('categoryForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveCategory(e.target);
    });
  }

  async function loadCategories() {
    currentCategories = await BH.api.get('/admin/categories');
    renderCategoriesTable();
  }

  function renderCategoriesTable() {
    const body = document.getElementById('categoriesTableBody');
    body.innerHTML = currentCategories.map((c) => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.slug)}</td>
        <td>${c.sort_order}</td>
        <td>${c.product_count}</td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-outline-secondary edit-category-btn" data-id="${c.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger delete-category-btn" data-id="${c.id}">Delete</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('.edit-category-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const category = currentCategories.find((c) => c.id === Number(btn.dataset.id));
        openCategoryModal(category);
      });
    });
    body.querySelectorAll('.delete-category-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this category?')) return;
        try {
          await BH.api.del('/admin/categories/' + btn.dataset.id);
          await loadCategories();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  let categoryModal;
  function openCategoryModal(category) {
    const form = document.getElementById('categoryForm');
    form.reset();
    document.getElementById('categoryFormError').classList.add('d-none');
    document.getElementById('categoryModalTitle').textContent = category ? 'Edit Category' : 'Add Category';
    form.querySelector('input[name="id"]').value = category ? category.id : '';

    if (category) {
      form.querySelector('input[name="name"]').value = category.name;
      form.querySelector('input[name="slug"]').value = category.slug;
      form.querySelector('textarea[name="description"]').value = category.description || '';
      form.querySelector('input[name="sort_order"]').value = category.sort_order;
    }

    if (!categoryModal) categoryModal = new bootstrap.Modal(document.getElementById('categoryModal'));
    categoryModal.show();
  }

  async function saveCategory(form) {
    const errorEl = document.getElementById('categoryFormError');
    errorEl.classList.add('d-none');
    const formData = new FormData(form);
    const id = formData.get('id');
    const payload = {
      name: formData.get('name'),
      slug: formData.get('slug') || slugify(formData.get('name')),
      description: formData.get('description'),
      sort_order: Number(formData.get('sort_order') || 0),
    };

    try {
      if (id) {
        await BH.api.put('/admin/categories/' + id, payload);
      } else {
        await BH.api.post('/admin/categories', payload);
      }
      categoryModal.hide();
      await loadCategories();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  }

  // ---------- ORDERS ----------

  async function initOrders() {
    if (!(await initAdminChrome())) return;
    wireOrdersTab();
    await loadOrders();
  }

  function wireOrdersTab() {
    document.getElementById('orderStatusFilter').addEventListener('change', loadOrders);
    document.getElementById('saveOrderStatusBtn').addEventListener('click', saveOrderStatus);
  }

  async function loadOrders() {
    const status = document.getElementById('orderStatusFilter').value;
    const orders = await BH.api.get('/admin/orders' + (status ? '?status=' + status : ''));
    const body = document.getElementById('ordersTableBody');
    body.innerHTML = orders.map((o) => `
      <tr>
        <td>${escapeHtml(o.order_ref)}</td>
        <td>${escapeHtml(o.customer_name)}<br><span class="text-secondary small">${escapeHtml(o.customer_email)}</span></td>
        <td>${escapeHtml(o.shipping_country)}</td>
        <td>${formatMoney(o.total_pesewas)}</td>
        <td>${statusBadge(o.status)}</td>
        <td>${escapeHtml(o.created_at)}</td>
        <td><button class="btn btn-sm btn-outline-secondary view-order-btn" data-id="${o.id}">View</button></td>
      </tr>
    `).join('');

    body.querySelectorAll('.view-order-btn').forEach((btn) => {
      btn.addEventListener('click', () => openOrderModal(Number(btn.dataset.id)));
    });
  }

  function statusBadge(status) {
    const map = {
      pending_payment: 'bg-warning text-dark', paid: 'bg-success', processing: 'bg-info text-dark',
      shipped: 'bg-primary', completed: 'bg-success', payment_failed: 'bg-danger', cancelled: 'bg-secondary',
    };
    return `<span class="badge ${map[status] || 'bg-secondary'}">${status.replace('_', ' ')}</span>`;
  }

  let orderModal;
  let activeOrderId = null;

  async function openOrderModal(orderId) {
    activeOrderId = orderId;
    const order = await BH.api.get('/admin/orders/' + orderId);
    const itemsHtml = order.items.map((i) => `
      <div class="d-flex justify-content-between small mb-1">
        <span>${escapeHtml(i.product_name)} &times; ${i.qty}</span>
        <span>${formatMoney(i.line_total_pesewas)}</span>
      </div>
    `).join('');

    document.getElementById('orderModalBody').innerHTML = `
      <p class="mb-1"><strong>${escapeHtml(order.customer_name)}</strong> &mdash; ${escapeHtml(order.customer_email)} &mdash; ${escapeHtml(order.customer_phone)}</p>
      <p class="small text-secondary mb-3">${escapeHtml(order.shipping_address)}, ${escapeHtml(order.shipping_city)}, ${escapeHtml(order.shipping_country)}</p>
      ${itemsHtml}
      <hr>
      <div class="d-flex justify-content-between small mb-1"><span>Subtotal</span><span>${formatMoney(order.subtotal_pesewas)}</span></div>
      ${order.discount_amount_pesewas ? `<div class="d-flex justify-content-between small mb-1"><span>Discount ${escapeHtml(order.discount_code || '')}</span><span>-${formatMoney(order.discount_amount_pesewas)}</span></div>` : ''}
      <div class="d-flex justify-content-between small mb-1"><span>Shipping</span><span>${formatMoney(order.shipping_cost_pesewas)}</span></div>
      <div class="d-flex justify-content-between fw-bold mb-3"><span>Total</span><span>${formatMoney(order.total_pesewas)}</span></div>
      ${order.customer_notes ? `<p class="small"><strong>Customer notes:</strong> ${escapeHtml(order.customer_notes)}</p>` : ''}
    `;
    document.getElementById('orderStatusSelect').value = order.status;

    if (!orderModal) orderModal = new bootstrap.Modal(document.getElementById('orderModal'));
    orderModal.show();
  }

  async function saveOrderStatus() {
    const status = document.getElementById('orderStatusSelect').value;
    await BH.api.put('/admin/orders/' + activeOrderId, { status });
    orderModal.hide();
    await loadOrders();
  }

  // ---------- CUSTOMERS ----------

  let currentCustomers = [];

  async function initCustomers() {
    if (!(await initAdminChrome())) return;
    await loadCustomers();
  }

  async function loadCustomers() {
    currentCustomers = await BH.api.get('/admin/customers');
    const body = document.getElementById('customersTableBody');
    const emptyState = document.getElementById('customersEmpty');

    if (currentCustomers.length === 0) {
      emptyState.classList.remove('d-none');
      return;
    }

    body.innerHTML = currentCustomers.map((c) => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.email)}</td>
        <td>${escapeHtml(c.phone || '')}</td>
        <td>${c.order_count}</td>
        <td>${escapeHtml(c.created_at)}</td>
        <td><button class="btn btn-sm btn-outline-secondary view-customer-btn" data-id="${c.id}">View</button></td>
      </tr>
    `).join('');

    body.querySelectorAll('.view-customer-btn').forEach((btn) => {
      btn.addEventListener('click', () => openCustomerModal(Number(btn.dataset.id)));
    });
  }

  let customerModal;
  async function openCustomerModal(customerId) {
    const customer = await BH.api.get('/admin/customers/' + customerId);
    document.getElementById('customerModalTitle').textContent = customer.name;

    const ordersHtml = customer.orders.length
      ? customer.orders.map((o) => `
          <div class="d-flex justify-content-between small mb-1">
            <span>${escapeHtml(o.order_ref)} &mdash; ${escapeHtml(o.status.replace('_', ' '))}</span>
            <span>${formatMoney(o.total_pesewas)}</span>
          </div>
        `).join('')
      : '<p class="text-secondary small mb-0">No orders yet.</p>';

    document.getElementById('customerModalBody').innerHTML = `
      <p class="mb-1">${escapeHtml(customer.email)} &mdash; ${escapeHtml(customer.phone || 'No phone on file')}</p>
      <p class="small text-secondary mb-3">Joined ${escapeHtml(customer.created_at)}</p>
      <hr>
      <h6 class="mb-2">Order History</h6>
      ${ordersHtml}
    `;

    if (!customerModal) customerModal = new bootstrap.Modal(document.getElementById('customerModal'));
    customerModal.show();
  }

  // ---------- REVIEWS ----------

  async function initReviews() {
    if (!(await initAdminChrome())) return;
    await loadAdminReviews();
  }

  async function loadAdminReviews() {
    const reviews = await BH.api.get('/admin/reviews');
    const body = document.getElementById('adminReviewsTableBody');
    const emptyState = document.getElementById('reviewsEmpty');

    if (reviews.length === 0) {
      emptyState.classList.remove('d-none');
      body.innerHTML = '';
      return;
    }

    emptyState.classList.add('d-none');
    body.innerHTML = reviews.map((r) => `
      <tr>
        <td><a href="/product/${encodeURIComponent(r.product_slug)}" target="_blank">${escapeHtml(r.product_name)}</a></td>
        <td>${escapeHtml(r.customer_name)}<br><span class="text-secondary small">${escapeHtml(r.customer_email)}</span></td>
        <td><span class="bh-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span></td>
        <td class="small">${escapeHtml(r.body || '')}</td>
        <td>${escapeHtml(r.created_at)}</td>
        <td><button class="btn btn-sm btn-outline-danger delete-review-btn" data-id="${r.id}">Delete</button></td>
      </tr>
    `).join('');

    body.querySelectorAll('.delete-review-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this review?')) return;
        await BH.api.del('/admin/reviews/' + btn.dataset.id);
        await loadAdminReviews();
      });
    });
  }

  // ---------- DISCOUNT CODES ----------

  let currentDiscountCodes = [];
  let discountCodeModal;

  async function initDiscountCodes() {
    if (!(await initAdminChrome())) return;
    wireDiscountCodesTab();
    await loadDiscountCodes();
  }

  function wireDiscountCodesTab() {
    document.getElementById('addDiscountCodeBtn').addEventListener('click', () => openDiscountCodeModal());
    document.getElementById('discountCodeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveDiscountCode(e.target);
    });
  }

  async function loadDiscountCodes() {
    currentDiscountCodes = await BH.api.get('/admin/discount-codes');
    const body = document.getElementById('discountCodesTableBody');
    body.innerHTML = currentDiscountCodes.map((c) => `
      <tr>
        <td><strong>${escapeHtml(c.code)}</strong></td>
        <td>${c.kind === 'percent' ? c.value + '%' : formatMoney(c.value)}</td>
        <td>${formatMoney(c.min_subtotal_pesewas)}</td>
        <td>${c.used_count}${c.max_uses ? ' / ' + c.max_uses : ''}</td>
        <td>${escapeHtml(c.expires_at || 'Never')}</td>
        <td>${c.is_active ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Inactive</span>'}</td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-outline-secondary edit-discount-code-btn" data-id="${c.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger delete-discount-code-btn" data-id="${c.id}">Deactivate</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('.edit-discount-code-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = currentDiscountCodes.find((c) => c.id === Number(btn.dataset.id));
        openDiscountCodeModal(code);
      });
    });
    body.querySelectorAll('.delete-discount-code-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Deactivate this discount code?')) return;
        await BH.api.del('/admin/discount-codes/' + btn.dataset.id);
        await loadDiscountCodes();
      });
    });
  }

  function openDiscountCodeModal(code) {
    const form = document.getElementById('discountCodeForm');
    form.reset();
    document.getElementById('discountCodeFormError').classList.add('d-none');
    document.getElementById('discountCodeModalTitle').textContent = code ? 'Edit Discount Code' : 'Add Discount Code';
    form.querySelector('input[name="id"]').value = code ? code.id : '';

    if (code) {
      form.querySelector('input[name="code"]').value = code.code;
      form.querySelector('select[name="kind"]').value = code.kind;
      form.querySelector('input[name="value"]').value =
        code.kind === 'fixed' ? (code.value / 100).toFixed(2) : code.value;
      form.querySelector('input[name="min_subtotal_ghs"]').value = (code.min_subtotal_pesewas / 100).toFixed(2);
      form.querySelector('input[name="max_uses"]').value = code.max_uses || '';
      form.querySelector('input[name="expires_at"]').value = code.expires_at || '';
      form.querySelector('input[name="is_active"]').checked = code.is_active;
    } else {
      form.querySelector('input[name="is_active"]').checked = true;
      form.querySelector('select[name="kind"]').value = 'percent';
      form.querySelector('input[name="min_subtotal_ghs"]').value = '0';
    }

    if (!discountCodeModal) discountCodeModal = new bootstrap.Modal(document.getElementById('discountCodeModal'));
    discountCodeModal.show();
  }

  async function saveDiscountCode(form) {
    const errorEl = document.getElementById('discountCodeFormError');
    errorEl.classList.add('d-none');
    const formData = new FormData(form);
    const id = formData.get('id');
    const payload = {
      code: formData.get('code'),
      kind: formData.get('kind'),
      value: formData.get('kind') === 'fixed'
        ? Math.round(parseFloat(formData.get('value') || '0') * 100)
        : Number(formData.get('value')),
      min_subtotal_pesewas: Math.round(parseFloat(formData.get('min_subtotal_ghs') || '0') * 100),
      max_uses: formData.get('max_uses'),
      expires_at: formData.get('expires_at'),
      is_active: form.querySelector('input[name="is_active"]').checked,
    };

    try {
      if (id) {
        await BH.api.put('/admin/discount-codes/' + id, payload);
      } else {
        await BH.api.post('/admin/discount-codes', payload);
      }
      discountCodeModal.hide();
      await loadDiscountCodes();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  }

  // ---------- SHIPPING RATES ----------

  let currentRates = [];

  async function initShippingRates() {
    if (!(await initAdminChrome())) return;
    wireRatesTab();
    await loadRates();
  }

  function wireRatesTab() {
    document.getElementById('addRateBtn').addEventListener('click', () => openRateModal());
    document.getElementById('rateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveRate(e.target);
    });
  }

  async function loadRates() {
    currentRates = await BH.api.get('/admin/shipping-rates');
    const body = document.getElementById('ratesTableBody');
    body.innerHTML = currentRates.map((r) => `
      <tr>
        <td>${escapeHtml(r.zone_name)}</td>
        <td>${r.zone_type}</td>
        <td class="small">${r.countries.join(', ')}</td>
        <td>${formatMoney(r.base_rate_pesewas)}</td>
        <td>${formatMoney(r.per_item_rate_pesewas)}</td>
        <td>${r.is_active ? 'Yes' : 'No'}</td>
        <td><button class="btn btn-sm btn-outline-secondary edit-rate-btn" data-id="${r.id}">Edit</button></td>
      </tr>
    `).join('');

    body.querySelectorAll('.edit-rate-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rate = currentRates.find((r) => r.id === Number(btn.dataset.id));
        openRateModal(rate);
      });
    });
  }

  let rateModal;
  function openRateModal(rate) {
    const form = document.getElementById('rateForm');
    form.reset();
    document.getElementById('rateFormError').classList.add('d-none');
    document.getElementById('rateModalTitle').textContent = rate ? 'Edit Shipping Zone' : 'Add Shipping Zone';
    form.querySelector('input[name="id"]').value = rate ? rate.id : '';

    if (rate) {
      form.querySelector('input[name="zone_name"]').value = rate.zone_name;
      form.querySelector('select[name="zone_type"]').value = rate.zone_type;
      form.querySelector('textarea[name="countries"]').value = rate.countries.join(', ');
      form.querySelector('input[name="base_rate_ghs"]').value = (rate.base_rate_pesewas / 100).toFixed(2);
      form.querySelector('input[name="per_item_rate_ghs"]').value = (rate.per_item_rate_pesewas / 100).toFixed(2);
      form.querySelector('input[name="is_active"]').checked = rate.is_active;
    } else {
      form.querySelector('input[name="is_active"]').checked = true;
    }

    if (!rateModal) rateModal = new bootstrap.Modal(document.getElementById('rateModal'));
    rateModal.show();
  }

  async function saveRate(form) {
    const errorEl = document.getElementById('rateFormError');
    errorEl.classList.add('d-none');
    const formData = new FormData(form);
    const id = formData.get('id');
    const payload = {
      zone_name: formData.get('zone_name'),
      zone_type: formData.get('zone_type'),
      countries: formData.get('countries').split(',').map((c) => c.trim()).filter(Boolean),
      base_rate_pesewas: Math.round(parseFloat(formData.get('base_rate_ghs')) * 100),
      per_item_rate_pesewas: Math.round(parseFloat(formData.get('per_item_rate_ghs')) * 100),
      is_active: form.querySelector('input[name="is_active"]').checked,
    };

    try {
      if (id) {
        await BH.api.put('/admin/shipping-rates/' + id, payload);
      } else {
        await BH.api.post('/admin/shipping-rates', payload);
      }
      rateModal.hide();
      await loadRates();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  }

  // ---------- SETTINGS ----------

  async function initSettings() {
    if (!(await initAdminChrome())) return;
    wireSettingsTab();
    await loadSettings();
  }

  const SETTINGS_FIELDS = [
    'paystack_secret_key', 'paystack_public_key', 'smtp_host', 'smtp_port', 'smtp_username',
    'smtp_password', 'smtp_encryption', 'mail_from_name', 'mail_from_email', 'admin_notify_email',
  ];

  function wireSettingsTab() {
    const form = document.getElementById('settingsForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveSettings(form);
    });
    const webhookInput = document.getElementById('webhookUrlInput');
    webhookInput.value = window.location.origin + '/api/payments/paystack/webhook';
    document.getElementById('copyWebhookBtn').addEventListener('click', async (e) => {
      await navigator.clipboard.writeText(webhookInput.value);
      e.target.textContent = 'Copied!';
      setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
    });
    document.getElementById('testEmailBtn').addEventListener('click', async () => {
      const resultEl = document.getElementById('testEmailResult');
      resultEl.classList.add('d-none');
      // Save first so the test uses what's on screen.
      await saveSettings(form);
      try {
        await BH.api.post('/admin/settings/test-email', {
          to: document.getElementById('testEmailInput').value.trim(),
        });
        resultEl.textContent = 'Test email sent — check the inbox (and spam folder).';
        resultEl.className = 'small mt-2 text-success';
      } catch (err) {
        resultEl.textContent = err.message;
        resultEl.className = 'small mt-2 text-danger';
      }
    });
  }

  async function loadSettings() {
    const settings = await BH.api.get('/admin/settings');
    const form = document.getElementById('settingsForm');
    SETTINGS_FIELDS.forEach((key) => {
      if (form.elements[key]) form.elements[key].value = settings[key] || '';
    });
    if (!settings.smtp_encryption) form.elements.smtp_encryption.value = 'tls';
  }

  async function saveSettings(form) {
    const savedEl = document.getElementById('settingsSaved');
    const errorEl = document.getElementById('settingsError');
    savedEl.classList.add('d-none');
    errorEl.classList.add('d-none');

    const formData = new FormData(form);
    const payload = {};
    SETTINGS_FIELDS.forEach((key) => { payload[key] = formData.get(key); });
    try {
      await BH.api.put('/admin/settings', payload);
      savedEl.classList.remove('d-none');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  }

  return {
    initLogin, initOverview, initProducts, initCategories, initOrders,
    initCustomers, initReviews, initDiscountCodes, initShippingRates, initSettings,
  };
})();
