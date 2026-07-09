window.BH = window.BH || {};

BH.orderTracking = (() => {
  function formatMoney(pesewas) {
    return 'GHS ' + (pesewas / 100).toFixed(2);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function statusLabel(status) {
    return (status || '').replace('_', ' ');
  }

  function init() {
    const form = document.getElementById('trackOrderForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await trackOrder(form);
    });
  }

  async function trackOrder(form) {
    const errorEl = document.getElementById('trackOrderError');
    const resultEl = document.getElementById('trackOrderResult');
    const btn = document.getElementById('trackOrderBtn');
    const formData = new FormData(form);
    errorEl.classList.add('d-none');
    resultEl.classList.add('d-none');
    btn.disabled = true;
    btn.textContent = 'Checking...';

    try {
      const order = await BH.api.post('/orders/track', {
        order_ref: formData.get('order_ref'),
        customer_email: formData.get('customer_email'),
      });
      renderOrder(order);
    } catch (err) {
      errorEl.textContent = err.message || 'Could not find that order.';
      errorEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Find Order';
    }
  }

  function renderOrder(order) {
    const resultEl = document.getElementById('trackOrderResult');
    const itemsHtml = order.items.map((i) => `
      <div class="d-flex justify-content-between small mb-1">
        <span>${escapeHtml(i.product_name)} &times; ${i.qty}</span>
        <span>${formatMoney(i.line_total_pesewas)}</span>
      </div>
    `).join('');

    resultEl.innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h5 class="mb-1">${escapeHtml(order.order_ref)}</h5>
          <p class="small text-secondary mb-0">Placed ${escapeHtml((order.created_at || '').split(' ')[0])}</p>
        </div>
        <span class="badge bg-dark text-capitalize">${escapeHtml(statusLabel(order.status))}</span>
      </div>
      ${itemsHtml}
      <hr>
      <div class="d-flex justify-content-between small mb-1"><span>Subtotal</span><span>${formatMoney(order.subtotal_pesewas)}</span></div>
      ${order.discount_amount_pesewas ? `<div class="d-flex justify-content-between small mb-1"><span>Discount ${escapeHtml(order.discount_code || '')}</span><span>-${formatMoney(order.discount_amount_pesewas)}</span></div>` : ''}
      <div class="d-flex justify-content-between small mb-1"><span>Shipping</span><span>${formatMoney(order.shipping_cost_pesewas)}</span></div>
      <div class="d-flex justify-content-between fw-bold"><span>Total</span><span>${formatMoney(order.total_pesewas)}</span></div>
      <hr>
      <p class="small text-secondary mb-0">Shipping to ${escapeHtml(order.shipping_city)}, ${escapeHtml(order.shipping_country)}</p>
      <p class="small text-secondary mb-0">Last updated ${escapeHtml(order.updated_at || order.created_at || '')}</p>
    `;
    resultEl.classList.remove('d-none');
  }

  return { init };
})();
