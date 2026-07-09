from flask import Blueprint, redirect, render_template, session, url_for

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
def index():
    return render_template("index.html")


@pages_bp.route("/catalog")
def catalog():
    return render_template("catalog.html")


@pages_bp.route("/product/<slug>")
def product_detail(slug):
    return render_template("product.html")


@pages_bp.route("/cart")
def cart():
    return render_template("cart.html")


@pages_bp.route("/checkout")
def checkout():
    return render_template("checkout.html")


@pages_bp.route("/account/login")
def account_login():
    if session.get("customer_id"):
        return redirect(url_for("pages.account_dashboard"))
    return render_template("account/login.html")


@pages_bp.route("/account/register")
def account_register():
    if session.get("customer_id"):
        return redirect(url_for("pages.account_dashboard"))
    return render_template("account/register.html")


@pages_bp.route("/account/forgot-password")
def account_forgot_password():
    if session.get("customer_id"):
        return redirect(url_for("pages.account_dashboard"))
    return render_template("account/forgot_password.html")


@pages_bp.route("/account/reset-password")
def account_reset_password():
    return render_template("account/reset_password.html")


@pages_bp.route("/account")
def account_dashboard():
    if not session.get("customer_id"):
        return redirect(url_for("pages.account_login"))
    return render_template("account/dashboard.html")


@pages_bp.route("/privacy-policy")
def privacy_policy():
    return render_template("legal/privacy.html")


@pages_bp.route("/terms-of-use")
def terms_of_use():
    return render_template("legal/terms.html")


@pages_bp.route("/cookie-policy")
def cookie_policy():
    return render_template("legal/cookies.html")


@pages_bp.route("/shipping-returns")
def shipping_returns():
    return render_template("legal/shipping_returns.html")


@pages_bp.route("/admin")
def admin_index():
    if session.get("admin_id"):
        return redirect(url_for("pages.admin_dashboard"))
    return redirect(url_for("pages.admin_login"))


@pages_bp.route("/admin/login")
def admin_login():
    if session.get("admin_id"):
        return redirect(url_for("pages.admin_dashboard"))
    return render_template("admin/login.html")


def _require_admin():
    if not session.get("admin_id"):
        return redirect(url_for("pages.admin_login"))
    return None


@pages_bp.route("/admin/dashboard")
def admin_dashboard():
    guard = _require_admin()
    if guard:
        return guard
    return render_template("admin/dashboard.html", active_page="dashboard")


@pages_bp.route("/admin/products")
def admin_products():
    guard = _require_admin()
    if guard:
        return guard
    return render_template("admin/products.html", active_page="products")


@pages_bp.route("/admin/categories")
def admin_categories():
    guard = _require_admin()
    if guard:
        return guard
    return render_template("admin/categories.html", active_page="categories")


@pages_bp.route("/admin/orders")
def admin_orders():
    guard = _require_admin()
    if guard:
        return guard
    return render_template("admin/orders.html", active_page="orders")


@pages_bp.route("/admin/customers")
def admin_customers():
    guard = _require_admin()
    if guard:
        return guard
    return render_template("admin/customers.html", active_page="customers")


@pages_bp.route("/admin/shipping-rates")
def admin_shipping_rates():
    guard = _require_admin()
    if guard:
        return guard
    return render_template("admin/shipping_rates.html", active_page="shipping-rates")


@pages_bp.route("/admin/settings")
def admin_settings():
    guard = _require_admin()
    if guard:
        return guard
    return render_template("admin/settings.html", active_page="settings")
