window.BH = window.BH || {};

BH.account = (() => {
  function formatMoney(pesewas) {
    return 'GHS ' + (pesewas / 100).toFixed(2);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function initLogin() {
    const form = document.getElementById('accountLoginForm');
    const errorEl = document.getElementById('loginError');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.add('d-none');
      const formData = new FormData(form);
      try {
        await BH.api.post('/customers/login', {
          email: formData.get('email'),
          password: formData.get('password'),
        });
        window.location.href = '/account';
      } catch (err) {
        errorEl.textContent = err.message || 'Login failed';
        errorEl.classList.remove('d-none');
      }
    });
  }

  function initRegister() {
    const form = document.getElementById('accountRegisterForm');
    const errorEl = document.getElementById('registerError');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.add('d-none');
      const formData = new FormData(form);
      try {
        await BH.api.post('/customers/register', {
          name: formData.get('name'),
          email: formData.get('email'),
          phone: formData.get('phone'),
          password: formData.get('password'),
        });
        window.location.href = '/account';
      } catch (err) {
        errorEl.textContent = err.message || 'Could not create account';
        errorEl.classList.remove('d-none');
      }
    });
  }

  function initForgotPassword() {
    const form = document.getElementById('forgotPasswordForm');
    const errorEl = document.getElementById('forgotError');
    const sentEl = document.getElementById('forgotSent');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.add('d-none');
      try {
        await BH.api.post('/customers/password-reset/request', {
          email: new FormData(form).get('email'),
        });
        sentEl.classList.remove('d-none');
        form.classList.add('d-none');
      } catch (err) {
        errorEl.textContent = err.message || 'Could not send reset link';
        errorEl.classList.remove('d-none');
      }
    });
  }

  function initResetPassword() {
    const form = document.getElementById('resetPasswordForm');
    const errorEl = document.getElementById('resetError');
    const doneEl = document.getElementById('resetDone');
    const token = new URLSearchParams(window.location.search).get('token') || '';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.add('d-none');
      const formData = new FormData(form);
      if (formData.get('password') !== formData.get('confirm_password')) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.classList.remove('d-none');
        return;
      }
      try {
        await BH.api.post('/customers/password-reset/confirm', {
          token,
          password: formData.get('password'),
        });
        doneEl.classList.remove('d-none');
        form.classList.add('d-none');
      } catch (err) {
        errorEl.textContent = err.message || 'Could not reset password';
        errorEl.classList.remove('d-none');
      }
    });
  }

  async function initDashboard() {
    let me;
    try {
      me = await BH.api.get('/customers/me');
    } catch (e) {
      window.location.href = '/account/login';
      return;
    }

    const form = document.getElementById('profileForm');
    form.name.value = me.name;
    form.email.value = me.email;
    form.phone.value = me.phone || '';

    document.getElementById('accountLogoutBtn').addEventListener('click', async () => {
      await BH.api.post('/customers/logout');
      window.location.href = '/';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const savedEl = document.getElementById('profileSaved');
      const errorEl = document.getElementById('profileError');
      savedEl.classList.add('d-none');
      errorEl.classList.add('d-none');

      const formData = new FormData(form);
      const payload = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
      };
      const newPassword = formData.get('new_password');
      if (newPassword) {
        payload.current_password = formData.get('current_password');
        payload.new_password = newPassword;
      }

      try {
        await BH.api.put('/customers/me', payload);
        form.current_password.value = '';
        form.new_password.value = '';
        savedEl.classList.remove('d-none');
      } catch (err) {
        errorEl.textContent = err.message || 'Could not save changes';
        errorEl.classList.remove('d-none');
      }
    });

    await loadOrders();
    await loadWishlist();
  }

  async function loadOrders() {
    const orders = await BH.api.get('/customers/orders');
    const body = document.getElementById('accountOrdersBody');
    const emptyState = document.getElementById('ordersEmptyState');

    if (orders.length === 0) {
      emptyState.classList.remove('d-none');
      return;
    }

    body.innerHTML = orders.map((o) => `
      <tr>
        <td>${escapeHtml(o.order_ref)}</td>
        <td>${escapeHtml(o.created_at)}</td>
        <td>${escapeHtml(o.status.replace('_', ' '))}</td>
        <td>${formatMoney(o.total_pesewas)}</td>
      </tr>
    `).join('');
  }

  async function loadWishlist() {
    const grid = document.getElementById('wishlistGrid');
    const emptyState = document.getElementById('wishlistEmptyState');
    if (!grid || !emptyState) return;
    const items = await BH.api.get('/customers/wishlist');
    if (items.length === 0) {
      emptyState.classList.remove('d-none');
      grid.innerHTML = '';
      return;
    }
    emptyState.classList.add('d-none');
    grid.innerHTML = items.map((p) => `
      <div class="col-md-6 col-xl-4">
        <div class="bh-saved-product">
          <img src="${p.image_url}" alt="">
          <div class="flex-grow-1">
            <a href="/product/${p.slug}" class="bh-product-name">${escapeHtml(p.name)}</a>
            <div class="bh-product-price small">${formatMoney(p.price_pesewas)}</div>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-sm bh-btn-red wishlist-cart-btn" data-id="${p.id}">Add to Cart</button>
              <button class="btn btn-sm btn-outline-danger wishlist-remove-btn" data-id="${p.id}">Remove</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
    grid.querySelectorAll('.wishlist-cart-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const product = items.find((p) => p.id === Number(btn.dataset.id));
        if (product) {
          BH.cart.addItem(product, 1);
          btn.textContent = 'Added';
          setTimeout(() => { btn.textContent = 'Add to Cart'; }, 1200);
        }
      });
    });
    grid.querySelectorAll('.wishlist-remove-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await BH.api.del('/customers/wishlist/' + btn.dataset.id);
        await loadWishlist();
      });
    });
  }

  return { initLogin, initRegister, initDashboard, initForgotPassword, initResetPassword };
})();
