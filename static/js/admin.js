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

  let categories = [];
  let currentProducts = [];
  let currentRates = [];

  async function initDashboard() {
    try {
      const sessionInfo = await BH.api.get('/admin/session');
      if (!sessionInfo.logged_in) {
        window.location.href = '/admin/login';
        return;
      }
      document.getElementById('adminUsername').textContent = sessionInfo.username;
    } catch (e) {
      window.location.href = '/admin/login';
      return;
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await BH.api.post('/admin/logout');
      window.location.href = '/admin/login';
    });

    categories = await BH.api.get('/admin/categories');
    populateCategorySelect();

    wireProductsTab();
    wireOrdersTab();
    wireRatesTab();

    await loadProducts();
    await loadOrders();
    await loadRates();
  }

  function populateCategorySelect() {
    const select = document.getElementById('productCategorySelect');
    select.innerHTML = categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  // ---------- PRODUCTS ----------

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

  // ---------- ORDERS ----------

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

  // ---------- SHIPPING RATES ----------

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

  return { initLogin, initDashboard };
})();
