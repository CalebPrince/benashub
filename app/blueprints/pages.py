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


@pages_bp.route("/admin/dashboard")
def admin_dashboard():
    if not session.get("admin_id"):
        return redirect(url_for("pages.admin_login"))
    return render_template("admin/dashboard.html")
