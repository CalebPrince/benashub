window.BH = window.BH || {};

BH.checkout = (() => {
  function formatMoney(pesewas) {
    return 'GHS ' + (pesewas / 100).toFixed(2);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  let currentShipping = null;
  let currentDiscount = null;

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');

    if (reference) {
      await handlePaymentReturn(reference);
      return;
    }

    const items = BH.cart.getCart();
    if (items.length === 0) {
      document.getElementById('checkoutEmptyState').classList.remove('d-none');
      return;
    }
    document.getElementById('checkoutForm').classList.remove('d-none');

    renderOrderSummary(items);
    await prefillFromAccount();
    await BH.shipping.populateCountrySelect(document.getElementById('shippingCountrySelect'));

    document.getElementById('shippingCountrySelect').addEventListener('change', () => refreshShipping(items));
    document.getElementById('discountCodeForm').addEventListener('submit', (e) => {
      e.preventDefault();
      applyDiscountCode();
    });

    document.getElementById('checkoutFormEl').addEventListener('submit', (e) => {
      e.preventDefault();
      submitOrder(items);
    });
  }

  function renderOrderSummary(items) {
    const el = document.getElementById('checkoutItems');
    el.innerHTML = items.map((i) => `
      <div class="d-flex justify-content-between small mb-1">
        <span>${escapeHtml(i.name)} &times; ${i.qty}</span>
        <span>${formatMoney(i.price_pesewas * i.qty)}</span>
      </div>
    `).join('');
    const subtotal = BH.cart.getSubtotalPesewas();
    document.getElementById('checkoutSubtotal').textContent = formatMoney(subtotal);
    document.getElementById('checkoutTotal').textContent = formatMoney(subtotal);
  }

  async function prefillFromAccount() {
    try {
      const me = await BH.api.get('/customers/me');
      const form = document.getElementById('checkoutFormEl');
      form.customer_name.value = me.name || '';
      form.customer_email.value = me.email || '';
      form.customer_phone.value = me.phone || '';
    } catch (e) { /* not logged in — leave the form blank for guest checkout */ }
  }

  async function refreshShipping(items) {
    const country = document.getElementById('shippingCountrySelect').value;
    const warning = document.getElementById('shippingWarning');
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    warning.classList.add('d-none');

    if (!country) {
      currentShipping = null;
      document.getElementById('checkoutShipping').textContent = '—';
      updateTotal();
      return;
    }

    document.getElementById('checkoutShipping').textContent = 'Calculating…';
    const cartItems = items.map((i) => ({ product_id: i.product_id, qty: i.qty }));
    const result = await BH.shipping.estimate(country, cartItems);
    currentShipping = result;

    if (result.excluded_items && result.excluded_items.length > 0) {
      const names = result.excluded_items.map((i) => i.name).join(', ');
      warning.textContent = `These items can't ship to ${country}: ${names}. Remove them from your cart to continue.`;
      warning.classList.remove('d-none');
      placeOrderBtn.disabled = true;
      document.getElementById('checkoutShipping').textContent = '—';
    } else if (!result.deliverable) {
      warning.textContent = `Sorry, we can't ship your cart to ${country}.`;
      warning.classList.remove('d-none');
      placeOrderBtn.disabled = true;
      document.getElementById('checkoutShipping').textContent = '—';
    } else {
      placeOrderBtn.disabled = false;
      document.getElementById('checkoutShipping').textContent =
        formatMoney(result.shipping_cost_pesewas) + ` (${result.zone_name})`;
    }
    updateTotal();
  }

  function updateTotal() {
    const subtotal = BH.cart.getSubtotalPesewas();
    const shippingCost = (currentShipping && currentShipping.deliverable) ? currentShipping.shipping_cost_pesewas : 0;
    const discountAmount = currentDiscount ? currentDiscount.discount_amount_pesewas : 0;
    document.getElementById('checkoutTotal').textContent = formatMoney(subtotal - discountAmount + shippingCost);
  }

  async function applyDiscountCode() {
    const input = document.getElementById('discountCodeInput');
    const message = document.getElementById('discountCodeMessage');
    const code = input.value.trim().toUpperCase();
    currentDiscount = null;
    renderDiscount();
    message.classList.add('d-none');
    updateTotal();

    if (!code) return;

    try {
      const customerEmail = document.getElementById('checkoutFormEl').customer_email.value.trim();
      currentDiscount = await BH.api.post('/discount-codes/validate', {
        code,
        subtotal_pesewas: BH.cart.getSubtotalPesewas(),
        customer_email: customerEmail,
      });
      input.value = currentDiscount.code;
      message.textContent = 'Discount applied.';
      message.className = 'small mt-2 text-success';
      renderDiscount();
    } catch (err) {
      message.textContent = err.message || 'Could not apply that code.';
      message.className = 'small mt-2 text-danger';
    }
    updateTotal();
  }

  function renderDiscount() {
    const row = document.getElementById('checkoutDiscountRow');
    if (!currentDiscount) {
      row.classList.add('d-none');
      return;
    }
    document.getElementById('checkoutDiscountCode').textContent = '(' + currentDiscount.code + ')';
    document.getElementById('checkoutDiscount').textContent = '-' + formatMoney(currentDiscount.discount_amount_pesewas);
    row.classList.remove('d-none');
  }

  async function submitOrder(items) {
    const form = document.getElementById('checkoutFormEl');
    const errorEl = document.getElementById('checkoutError');
    errorEl.classList.add('d-none');

    if (!currentShipping || !currentShipping.deliverable) {
      errorEl.textContent = 'Please select a valid shipping destination.';
      errorEl.classList.remove('d-none');
      return;
    }

    const formData = new FormData(form);
    const payload = {
      customer_name: formData.get('customer_name'),
      customer_email: formData.get('customer_email'),
      customer_phone: formData.get('customer_phone'),
      shipping_address: formData.get('shipping_address'),
      shipping_city: formData.get('shipping_city'),
      shipping_country: formData.get('shipping_country'),
      customer_notes: formData.get('customer_notes'),
      discount_code: currentDiscount ? currentDiscount.code : '',
      items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
    };

    const btn = document.getElementById('placeOrderBtn');
    btn.disabled = true;
    btn.textContent = 'Placing Order…';

    try {
      const result = await BH.api.post('/orders', payload);
      window.location.href = result.authorization_url;
    } catch (e) {
      errorEl.textContent = e.message || 'Something went wrong placing your order.';
      errorEl.classList.remove('d-none');
      btn.disabled = false;
      btn.textContent = 'Place Order & Pay';
    }
  }

  async function handlePaymentReturn(reference) {
    document.getElementById('checkoutVerifying').classList.remove('d-none');
    try {
      const result = await BH.api.post('/payments/verify', { reference });
      const order = await BH.api.get('/orders/' + encodeURIComponent(result.order_ref));
      BH.cart.clearCart();
      showConfirmation(order);
    } catch (e) {
      document.getElementById('checkoutVerifying').classList.add('d-none');
      document.getElementById('checkoutForm').classList.remove('d-none');
      const errorEl = document.getElementById('checkoutError');
      errorEl.textContent = e.message || 'We could not confirm your payment. Please contact us with your order reference.';
      errorEl.classList.remove('d-none');
    }
  }

  function showConfirmation(order) {
    document.getElementById('checkoutVerifying').classList.add('d-none');
    document.getElementById('checkoutForm').classList.add('d-none');
    const confirmation = document.getElementById('checkoutConfirmation');
    confirmation.classList.remove('d-none');

    document.getElementById('confirmationRef').textContent = order.order_ref;

    const paidStatuses = ['paid', 'processing', 'shipped', 'completed'];
    document.getElementById('confirmationTitle').textContent =
      paidStatuses.includes(order.status) ? 'Thank you for your order!' : 'Payment not confirmed';

    const itemsHtml = order.items.map((i) => `
      <div class="d-flex justify-content-between small mb-1">
        <span>${escapeHtml(i.product_name)} &times; ${i.qty}</span>
        <span>${formatMoney(i.line_total_pesewas)}</span>
      </div>
    `).join('');

    document.getElementById('confirmationDetails').innerHTML = `
      ${itemsHtml}
      <hr>
      <div class="d-flex justify-content-between small mb-1"><span>Subtotal</span><span>${formatMoney(order.subtotal_pesewas)}</span></div>
      ${order.discount_amount_pesewas ? `<div class="d-flex justify-content-between small mb-1"><span>Discount ${escapeHtml(order.discount_code || '')}</span><span>-${formatMoney(order.discount_amount_pesewas)}</span></div>` : ''}
      <div class="d-flex justify-content-between small mb-1"><span>Shipping</span><span>${formatMoney(order.shipping_cost_pesewas)}</span></div>
      <div class="d-flex justify-content-between fw-bold"><span>Total</span><span>${formatMoney(order.total_pesewas)}</span></div>
      <hr>
      <p class="small text-secondary mb-0">Shipping to: ${escapeHtml(order.shipping_address)}, ${escapeHtml(order.shipping_city)}, ${escapeHtml(order.shipping_country)}</p>
      <p class="small text-secondary mb-0">A confirmation has been sent to ${escapeHtml(order.customer_email)}.</p>
    `;
  }

  return { init };
})();
