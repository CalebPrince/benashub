window.BH = window.BH || {};

BH.nav = (() => {
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  const TOP_MENU_CATEGORY_COUNT = 3;

  async function populateTopCategories() {
    const anchor = document.getElementById('navShopItem');
    if (!anchor) return;
    try {
      const categories = await BH.api.get('/categories');
      const items = categories.slice(0, TOP_MENU_CATEGORY_COUNT).map((c) => `
        <li class="nav-item"><a class="nav-link" href="/catalog?category=${c.slug}">${escapeHtml(c.name)}</a></li>
      `).join('');
      anchor.insertAdjacentHTML('afterend', items);
    } catch (e) { /* leave just Home/Shop on failure */ }
  }

  async function renderAccountArea() {
    const link = document.getElementById('navAccountLink');
    const loginLink = document.getElementById('topbarLoginLink');
    const toggle = document.getElementById('topbarAccountToggle');
    const menu = document.getElementById('topbarAccountMenu');
    try {
      const session = await BH.api.get('/customers/session');
      if (session.logged_in) {
        if (link) {
          link.textContent = session.name ? `Hi, ${session.name.split(' ')[0]}` : 'My Account';
          link.href = '/account';
        }
        if (loginLink) loginLink.classList.add('d-none');
        if (toggle && session.name) toggle.textContent = `Hi, ${session.name.split(' ')[0]}`;
        if (menu) {
          menu.innerHTML = `
            <li><a class="dropdown-item" href="/account">My Account</a></li>
            <li><a class="dropdown-item" href="/account#orders">My Orders</a></li>
            <li><a class="dropdown-item" href="/account#profile">Profile</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><button type="button" class="dropdown-item" id="topbarLogoutBtn">Log Out</button></li>`;
          document.getElementById('topbarLogoutBtn').addEventListener('click', async () => {
            try { await BH.api.post('/customers/logout'); } catch (e) { /* ignore */ }
            window.location.href = '/';
          });
        }
      }
    } catch (e) { /* leave logged-out defaults on failure */ }
  }

  function initMobileSearch() {
    const mobileForm = document.getElementById('navSearchFormMobile');
    const mobileInput = document.getElementById('navSearchInputMobile');
    const mainForm = document.getElementById('navSearchForm');
    const mainInput = document.getElementById('navSearchInput');
    if (!mobileForm || !mainForm) return;
    mobileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      mainInput.value = mobileInput.value;
      mainForm.requestSubmit();
    });
  }

  function init() {
    populateTopCategories();
    renderAccountArea();
    initMobileSearch();
  }

  return { init };
})();
