# Benas Hub

Ecommerce site for Benas Hub &mdash; distributor of organic household and health products (Tema, Ghana). Vanilla JS + Bootstrap frontend, Python (Flask) backend, SQLite storage, Paystack payments.

## Setup

1. Install dependencies:

   ```
   pip install -r requirements.txt
   ```

2. Set environment variables (required for payments; the rest have sane dev defaults):

   | Variable | Purpose | Required? |
   |---|---|---|
   | `PAYSTACK_SECRET_KEY` | Your Paystack secret key (`sk_test_...` for testing). Sign up free at paystack.com, grab it from Settings &gt; API Keys & Webhooks. Without this, checkout will show a clear error instead of working. | Yes, before checkout works |
   | `SECRET_KEY` | Flask session signing key. If unset, a random one is generated each restart (logs admin out on every restart). | Recommended for anything beyond local testing |
   | `ADMIN_USERNAME` | Admin login username. Defaults to `admin`. | No |
   | `ADMIN_PASSWORD` | Admin login password. If unset, one is auto-generated and printed to the console the first time the database is created &mdash; save it then, it won't be shown again. | No |

   On Windows PowerShell:
   ```
   $env:PAYSTACK_SECRET_KEY = "sk_test_xxxxxxxx"
   ```

3. Run the server:

   ```
   python server.py
   ```

   The first run creates and seeds `benashub.db` (categories, placeholder products, shipping zones, and the admin user) and prints the admin login to the console. Subsequent runs reuse the existing database.

4. Open `http://127.0.0.1:5000/` for the storefront, or `http://127.0.0.1:5000/admin/login` for the admin panel.

## Notes

- **Placeholder data**: the seeded product catalog is fictional. Replace it with real inventory via the admin panel before going live.
- **Placeholder logo**: no logo file was supplied, so a CSS "bh" badge is used. See `static/img/logo/README.txt` to swap in the real logo.
- **Paystack webhook**: for production, configure a webhook in the Paystack dashboard pointing to `/api/payments/paystack/webhook` so payments still get confirmed even if a customer closes the tab after paying.
- **Currency**: all prices are in Ghana Cedis (GHS), stored internally as integer pesewas.
