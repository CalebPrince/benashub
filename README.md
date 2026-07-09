# Benas Hub

Ecommerce site for Benas Hub &mdash; distributor of organic household and health products (Tema, Ghana). Vanilla JS + Bootstrap frontend, Python (Flask) backend, SQLite storage, Paystack payments.

## Pages

### Storefront

| Page | Route | Notes |
|---|---|---|
| Home | `/` | Hero, shop-by-category, featured products |
| Shop / Catalog | `/catalog` | Category filter and product search (`?category=`, `?q=`) |
| Product detail | `/product/<slug>` | |
| Cart | `/cart` | Client-side cart (localStorage) |
| Checkout | `/checkout` | Shipping details + Paystack payment |

Every storefront page has a black top utility bar (desktop) with the product search box and a **My Account** dropdown floated right &mdash; logged out it offers Login / Create Account; logged in it shows "Hi, &lt;name&gt;" with My Account, My Orders, Profile, and Log Out. On mobile, search and the account link live in the hamburger drawer instead.

### Customer accounts

| Page | Route | Notes |
|---|---|---|
| Login | `/account/login` | |
| Register | `/account/register` | |
| My Account | `/account` | Profile editing (name, email, phone, password) and order history |

### Legal

`/privacy-policy`, `/terms-of-use`, `/cookie-policy`, and `/shipping-returns` &mdash; linked from the footer.

### Admin panel

`/admin/login`, then: Dashboard, Products, Categories, Orders, Customers, Shipping Rates, and Settings (Paystack keys) &mdash; each on its own page under `/admin/...`.

## Setup

1. Install dependencies:

   ```
   pip install -r requirements.txt
   ```

2. (Optional) Set environment variables for infrastructure-level bootstrap secrets &mdash; these have sane dev defaults and are unrelated to payment keys:

   | Variable | Purpose | Required? |
   |---|---|---|
   | `SECRET_KEY` | Flask session signing key. If unset, a random one is generated each restart (logs admin out on every restart). | Recommended for anything beyond local testing |
   | `ADMIN_USERNAME` | Admin login username. Defaults to `admin`. | No |
   | `ADMIN_PASSWORD` | Admin login password. If unset, one is auto-generated and printed to the console the first time the database is created &mdash; save it then, it won't be shown again. | No |

3. Run the server:

   ```
   python server.py
   ```

   The first run creates and seeds `benashub.db` (categories, placeholder products, shipping zones, and the admin user) and prints the admin login to the console. Subsequent runs reuse the existing database.

4. Open `http://127.0.0.1:5000/` for the storefront, or `http://127.0.0.1:5000/admin/login` for the admin panel.

5. Log in to the admin panel and go to **Settings** to add your Paystack secret key (`sk_test_...` for testing, from your Paystack dashboard under Settings &gt; API Keys & Webhooks). This is stored in the database, not in a file or environment variable, so it can be changed anytime without redeploying. Checkout will show a clear error until this is set.

## Notes

- **Payment keys live in the database, not in files**: the Paystack secret key is set via Admin > Settings and stored in the `settings` table. It is never committed to source control or exposed to the storefront.
- **Emails (SMTP)**: configure your mail server under Admin > Settings > Email (SMTP) — works with Gmail, Zoho, or your hosting provider's mail server, and there's a "Send Test" button to verify. Once set, the site sends a welcome email on customer registration, an order confirmation to the customer when payment succeeds, and (optionally) a new-order notification to the admin email. Leave the SMTP host empty to disable all emails.
- **Placeholder data**: the seeded product catalog is fictional. Replace it with real inventory via the admin panel before going live.
- **Placeholder logo**: no logo file was supplied, so a CSS "bh" badge is used. See `static/img/logo/README.txt` to swap in the real logo.
- **Paystack webhook**: for production, configure a webhook in the Paystack dashboard pointing to `/api/payments/paystack/webhook` so payments still get confirmed even if a customer closes the tab after paying.
- **Currency**: all prices are in Ghana Cedis (GHS), stored internally as integer pesewas.
