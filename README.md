# Benas Hub

Ecommerce site for Benas Hub, a distributor of organic household and health products in Tema, Ghana. The app uses a vanilla JavaScript + Bootstrap frontend, Python/Flask backend, SQLite storage, Paystack payments, and SMTP email notifications.

## Features

- Storefront homepage with admin-managed hero copy, feature text, testimonials, promo banner, and site meta content.
- Catalog with search, category filtering, product badges, ratings, wishlist buttons, and stock-aware add-to-cart controls.
- Product detail pages with image galleries, badges, product descriptions, usage/delivery tabs, related products, bundle suggestions, reviews, Open Graph tags, and structured product/review data.
- Cart and checkout with shipping estimates, Paystack payment initialization, discount code validation, and first-order-only promo support.
- Customer accounts with login/register, profile editing, order history, password reset, product reviews, and saved products.
- Public order tracking page with a status timeline: Placed, Paid, Processing, Shipped, Completed.
- Admin panel for products, categories, orders, customers, reviews, discount codes, homepage/site content, shipping rates, and settings.
- Review moderation with approve/unapprove, featured reviews, admin replies, and delete controls.
- Low-stock dashboard alerts and optional low-stock email notifications.
- SMTP emails for welcome messages, password resets, paid order confirmations, shipped notifications, admin order alerts, and stock alerts.

## Pages

### Storefront

| Page | Route | Notes |
|---|---|---|
| Home | `/` | Admin-managed hero, promo banner, categories, featured products, value sections, testimonials |
| Shop / Catalog | `/catalog` | Category filter and product search (`?category=`, `?q=`) |
| Product detail | `/product/<slug>` | Gallery, descriptions, reviews, badges, related products, bundles, SEO metadata |
| Cart | `/cart` | Client-side cart using localStorage |
| Checkout | `/checkout` | Shipping details, discount codes, Paystack payment |
| Track Order | `/track-order` | Lookup by order reference and email, with timeline status |

Every storefront page has a desktop top utility bar with product search and a **My Account** dropdown. On mobile, search and account links live in the hamburger drawer.

### Customer Accounts

| Page | Route | Notes |
|---|---|---|
| Login | `/account/login` | Customers log in with email and password |
| Register | `/account/register` | Creates a customer account and can send a welcome email |
| My Account | `/account` | Profile editing, saved products, and order history |
| Forgot password | `/account/forgot-password` | Emails a single-use reset link that expires in 1 hour |
| Reset password | `/account/reset-password?token=...` | Linked from the reset email |

### Admin Panel

| Page | Route | Notes |
|---|---|---|
| Login | `/admin/login` | Admin username login supports the username before `@`; customers still use full email |
| Dashboard | `/admin/dashboard` | Stats, recent orders, low stock, and active stock alerts |
| Products | `/admin/products` | Product CRUD, uploads, badges, gallery images, bundles, descriptions, SEO fields |
| Categories | `/admin/categories` | Category CRUD and ordering |
| Orders | `/admin/orders` | View orders, update status, send shipped email |
| Customers | `/admin/customers` | Customer list and order history |
| Reviews | `/admin/reviews` | Approve/unapprove, feature, reply, delete |
| Discount Codes | `/admin/discount-codes` | Percent/fixed codes, active toggle, max uses, expiry, first-order-only rules |
| Site Content | `/admin/site-content` | Homepage promo, hero copy, feature text, testimonials, site meta title/description |
| Shipping Rates | `/admin/shipping-rates` | Domestic/international zones and rates |
| Settings | `/admin/settings` | Paystack keys, webhook URL, SMTP settings, low-stock threshold |

### Legal

`/privacy-policy`, `/terms-of-use`, `/cookie-policy`, and `/shipping-returns` are linked from the footer.

## Setup

1. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Optionally set bootstrap environment variables:

   | Variable | Purpose | Required? |
   |---|---|---|
   | `SECRET_KEY` | Flask session signing key. If unset, a random key is generated each restart. | Recommended beyond local testing |
   | `ADMIN_USERNAME` | Admin login username. Defaults to `admin`. | No |
   | `ADMIN_PASSWORD` | Admin login password. If unset, one is generated and printed the first time the database is created. | No |

3. Run the server:

   ```bash
   python server.py
   ```

   The first run creates `benashub.db`, seeds categories, placeholder products, shipping zones, `WELCOME10`, default homepage promo content, and the admin user.

4. Open the storefront:

   ```text
   http://127.0.0.1:5000/
   ```

5. Open the admin panel:

   ```text
   http://127.0.0.1:5000/admin/login
   ```

6. In **Admin > Settings**, add your Paystack secret/public keys and SMTP details if you want payments and emails active.

## Seeded Promo

The database seeds `WELCOME10` as a 10% discount code with a minimum subtotal of GHS 50.00, a max use count of 100, active status, and a first-order-only rule. The default homepage promo banner says:

```text
Use WELCOME10 for 10% off your first order
```

Admins can edit or disable the banner under **Admin > Site Content**, and can edit/deactivate the discount code under **Admin > Discount Codes**.

## Operational Notes

- **Payment keys live in the database**: Paystack keys are set via Admin > Settings and stored in the `settings` table. They are not committed to source control.
- **Paystack webhook**: for production, configure Paystack to call `/api/payments/paystack/webhook` so payments are confirmed even if a customer closes the browser after paying.
- **Inventory deduction**: stock is deducted only after payment is verified, and each order is guarded so inventory is deducted once.
- **Low-stock alerts**: set the threshold in Admin > Settings. The dashboard shows active alerts, and SMTP can email the admin notification address when products drop below the threshold.
- **Emails are optional**: leave SMTP host empty to disable email sends. Password reset will tell customers to contact you if SMTP is unavailable.
- **Placeholder data**: seeded products use placeholder images and fictional inventory. Replace them via Admin > Products before launch.
- **Currency**: all prices are shown in Ghana Cedis (GHS) and stored internally as integer pesewas.
- **Local database**: SQLite data lives in `benashub.db`, which should not be committed.
