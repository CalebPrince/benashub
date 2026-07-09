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

  return { initLogin, initRegister, initDashboard };
})();
