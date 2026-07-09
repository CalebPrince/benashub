window.BH = window.BH || {};

BH.cart = (() => {
  const KEY = 'benashub_cart';

  function getCart() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('cart:updated', { detail: { items } }));
  }

  function addItem(product, qty) {
    qty = qty || 1;
    const items = getCart();
    const existing = items.find((i) => i.product_id === product.id);
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({
        product_id: product.id,
        name: product.name,
        slug: product.slug,
        price_pesewas: product.price_pesewas,
        ships_internationally: product.ships_internationally,
        image_url: product.image_url,
        qty,
      });
    }
    saveCart(items);
  }

  function updateQty(productId, qty) {
    let items = getCart();
    if (qty <= 0) {
      items = items.filter((i) => i.product_id !== productId);
    } else {
      const item = items.find((i) => i.product_id === productId);
      if (item) item.qty = qty;
    }
    saveCart(items);
  }

  function removeItem(productId) {
    const items = getCart().filter((i) => i.product_id !== productId);
    saveCart(items);
  }

  function clearCart() {
    saveCart([]);
  }

  function getCartCount() {
    return getCart().reduce((sum, i) => sum + i.qty, 0);
  }

  function getSubtotalPesewas() {
    return getCart().reduce((sum, i) => sum + i.price_pesewas * i.qty, 0);
  }

  function formatMoney(pesewas) {
    return 'GHS ' + (pesewas / 100).toFixed(2);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function updateBadge() {
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    const count = getCartCount();
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }

  function renderCartPage() {
    const emptyState = document.getElementById('cartEmptyState');
    const content = document.getElementById('cartContent');
    const body = document.getElementById('cartItemsBody');
    if (!emptyState || !content || !body) return;

    const items = getCart();
    if (items.length === 0) {
      emptyState.classList.remove('d-none');
      content.classList.add('d-none');
      return;
    }
    emptyState.classList.add('d-none');
    content.classList.remove('d-none');

    body.innerHTML = items.map((item) => `
      <tr>
        <td class="d-flex align-items-center gap-2">
          <img src="${item.image_url || '/static/img/products/placeholder.svg'}" class="bh-thumb" alt="">
          <div>
            <a href="/product/${item.slug}" class="bh-product-name">${escapeHtml(item.name)}</a>
            ${item.ships_internationally ? '<div><span class="badge bh-badge-intl">Ships Internationally</span></div>' : ''}
          </div>
        </td>
        <td>${formatMoney(item.price_pesewas)}</td>
        <td style="max-width:110px">
          <input type="number" min="1" class="form-control form-control-sm cart-qty-input" value="${item.qty}" data-id="${item.product_id}">
        </td>
        <td>${formatMoney(item.price_pesewas * item.qty)}</td>
        <td><button class="btn btn-sm btn-outline-danger cart-remove-btn" data-id="${item.product_id}">Remove</button></td>
      </tr>
    `).join('');

    document.getElementById('cartSubtotal').textContent = formatMoney(getSubtotalPesewas());

    body.querySelectorAll('.cart-qty-input').forEach((input) => {
      input.addEventListener('change', () => {
        const id = Number(input.dataset.id);
        const qty = Math.max(1, parseInt(input.value, 10) || 1);
        updateQty(id, qty);
        renderCartPage();
      });
    });
    body.querySelectorAll('.cart-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeItem(Number(btn.dataset.id));
        renderCartPage();
      });
    });
  }

  window.addEventListener('cart:updated', updateBadge);

  document.addEventListener('DOMContentLoaded', () => {
    updateBadge();
    renderCartPage();

    const navSearchForm = document.getElementById('navSearchForm');
    if (navSearchForm && !window.location.pathname.startsWith('/catalog')) {
      navSearchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = document.getElementById('navSearchInput').value.trim();
        window.location.href = '/catalog' + (q ? '?q=' + encodeURIComponent(q) : '');
      });
    }
  });

  return {
    getCart, addItem, updateQty, removeItem, clearCart,
    getCartCount, getSubtotalPesewas, formatMoney, updateBadge,
  };
})();
