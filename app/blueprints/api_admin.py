import json
import os
import sqlite3
import uuid

from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import check_password_hash
from werkzeug.utils import secure_filename

from ..auth import login_required
from ..db import get_db
from ..mailer import send_order_shipped_email, send_test_email
from ..settings import get_setting, set_setting

api_admin_bp = Blueprint("api_admin", __name__)


# --- auth ---

@api_admin_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password", "")

    db = get_db()
    user = db.execute(
        """SELECT * FROM admin_users
           WHERE lower(username) = lower(?)
              OR (instr(username, '@') > 0 AND lower(substr(username, 1, instr(username, '@') - 1)) = lower(?))""",
        (username, username),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid username or password"}), 401

    session["admin_id"] = user["id"]
    session["admin_username"] = user["username"]
    return jsonify({"username": user["username"]})


@api_admin_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@api_admin_bp.route("/session")
def get_session():
    if session.get("admin_id"):
        return jsonify({"logged_in": True, "username": session.get("admin_username")})
    return jsonify({"logged_in": False})


# --- products ---

ADMIN_PRODUCT_SELECT = """
    SELECT p.*, COALESCE(AVG(r.rating), 0) AS avg_rating, COUNT(r.id) AS review_count
    FROM products p
    LEFT JOIN reviews r ON r.product_id = p.id
"""


def product_admin_dict(row):
    return {
        "id": row["id"],
        "category_id": row["category_id"],
        "name": row["name"],
        "slug": row["slug"],
        "description": row["description"],
        "extended_description": row["extended_description"],
        "usage_instructions": row["usage_instructions"],
        "delivery_notes": row["delivery_notes"],
        "price_pesewas": row["price_pesewas"],
        "stock_qty": row["stock_qty"],
        "ships_internationally": bool(row["ships_internationally"]),
        "is_active": bool(row["is_active"]),
        "image_url": row["image_url"],
        "avg_rating": round(row["avg_rating"], 1),
        "review_count": row["review_count"],
    }


@api_admin_bp.route("/products", methods=["GET"])
@login_required
def list_products():
    db = get_db()
    rows = db.execute(ADMIN_PRODUCT_SELECT + " GROUP BY p.id ORDER BY p.created_at DESC").fetchall()
    return jsonify([product_admin_dict(r) for r in rows])


@api_admin_bp.route("/products", methods=["POST"])
@login_required
def create_product():
    data = request.get_json(force=True, silent=True) or {}
    required = ["name", "slug", "category_id", "price_pesewas"]
    if not all(data.get(f) not in (None, "") for f in required):
        return jsonify({"error": "Missing required fields"}), 400

    db = get_db()
    try:
        cur = db.execute(
            """INSERT INTO products
               (category_id, name, slug, description, extended_description, usage_instructions,
                delivery_notes, price_pesewas, stock_qty, ships_internationally, is_active, image_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data["category_id"], data["name"], data["slug"], data.get("description", ""),
                data.get("extended_description", ""), data.get("usage_instructions", ""),
                data.get("delivery_notes", ""), int(data["price_pesewas"]), int(data.get("stock_qty", 0)),
                1 if data.get("ships_internationally") else 0,
                1 if data.get("is_active", True) else 0,
                data.get("image_url") or "/static/img/products/placeholder.svg",
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "A product with that slug already exists"}), 400

    row = db.execute(ADMIN_PRODUCT_SELECT + " WHERE p.id = ? GROUP BY p.id", (cur.lastrowid,)).fetchone()
    return jsonify(product_admin_dict(row)), 201


@api_admin_bp.route("/products/<int:product_id>", methods=["PUT"])
@login_required
def update_product(product_id):
    data = request.get_json(force=True, silent=True) or {}
    db = get_db()
    existing = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if existing is None:
        return jsonify({"error": "Product not found"}), 404

    def pick(key, cast=lambda x: x):
        return cast(data[key]) if key in data and data[key] not in (None, "") else existing[key]

    try:
        db.execute(
            """UPDATE products SET category_id=?, name=?, slug=?, description=?, extended_description=?,
               usage_instructions=?, delivery_notes=?, price_pesewas=?, stock_qty=?, ships_internationally=?,
               is_active=?, image_url=?, updated_at=datetime('now')
               WHERE id=?""",
            (
                pick("category_id", int), pick("name"), pick("slug"), pick("description"),
                pick("extended_description"), pick("usage_instructions"), pick("delivery_notes"),
                pick("price_pesewas", int), pick("stock_qty", int),
                1 if data.get("ships_internationally", existing["ships_internationally"]) else 0,
                1 if data.get("is_active", existing["is_active"]) else 0,
                pick("image_url"), product_id,
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "A product with that slug already exists"}), 400

    row = db.execute(ADMIN_PRODUCT_SELECT + " WHERE p.id = ? GROUP BY p.id", (product_id,)).fetchone()
    return jsonify(product_admin_dict(row))


@api_admin_bp.route("/products/<int:product_id>", methods=["DELETE"])
@login_required
def delete_product(product_id):
    db = get_db()
    db.execute("UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?", (product_id,))
    db.commit()
    return jsonify({"ok": True})


@api_admin_bp.route("/products/upload", methods=["POST"])
@login_required
def upload_product_image():
    file = request.files.get("image")
    if file is None or file.filename == "":
        return jsonify({"error": "No file provided"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in current_app.config["ALLOWED_IMAGE_EXTENSIONS"]:
        return jsonify({"error": "Unsupported file type"}), 400

    filename = secure_filename(f"{uuid.uuid4().hex}.{ext}")
    upload_dir = current_app.config["UPLOAD_DIR"]
    os.makedirs(upload_dir, exist_ok=True)
    file.save(os.path.join(upload_dir, filename))

    return jsonify({"url": f"/static/img/products/{filename}"})


# --- categories ---

def category_dict(row, product_count):
    return {
        "id": row["id"], "name": row["name"], "slug": row["slug"],
        "description": row["description"], "sort_order": row["sort_order"],
        "product_count": product_count,
    }


@api_admin_bp.route("/categories", methods=["GET"])
@login_required
def list_categories_admin():
    db = get_db()
    rows = db.execute(
        """SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
           FROM categories c ORDER BY c.sort_order, c.name"""
    ).fetchall()
    return jsonify([category_dict(r, r["product_count"]) for r in rows])


@api_admin_bp.route("/categories", methods=["POST"])
@login_required
def create_category():
    data = request.get_json(force=True, silent=True) or {}
    if not data.get("name") or not data.get("slug"):
        return jsonify({"error": "Name and slug are required"}), 400
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)",
            (data["name"], data["slug"], data.get("description", ""), int(data.get("sort_order", 0))),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "A category with that slug already exists"}), 400
    row = db.execute("SELECT * FROM categories WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(category_dict(row, 0)), 201


@api_admin_bp.route("/categories/<int:category_id>", methods=["PUT"])
@login_required
def update_category(category_id):
    data = request.get_json(force=True, silent=True) or {}
    db = get_db()
    existing = db.execute("SELECT * FROM categories WHERE id = ?", (category_id,)).fetchone()
    if existing is None:
        return jsonify({"error": "Category not found"}), 404

    try:
        db.execute(
            "UPDATE categories SET name=?, slug=?, description=?, sort_order=? WHERE id=?",
            (
                data.get("name", existing["name"]), data.get("slug", existing["slug"]),
                data.get("description", existing["description"]),
                int(data.get("sort_order", existing["sort_order"])), category_id,
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "A category with that slug already exists"}), 400

    row = db.execute("SELECT * FROM categories WHERE id = ?", (category_id,)).fetchone()
    count = db.execute("SELECT COUNT(*) AS c FROM products WHERE category_id = ?", (category_id,)).fetchone()["c"]
    return jsonify(category_dict(row, count))


@api_admin_bp.route("/categories/<int:category_id>", methods=["DELETE"])
@login_required
def delete_category(category_id):
    db = get_db()
    count = db.execute("SELECT COUNT(*) AS c FROM products WHERE category_id = ?", (category_id,)).fetchone()["c"]
    if count > 0:
        return jsonify({"error": f"This category has {count} product(s) — reassign or remove them first"}), 400
    db.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    db.commit()
    return jsonify({"ok": True})


# --- orders ---

@api_admin_bp.route("/orders", methods=["GET"])
@login_required
def list_orders():
    db = get_db()
    status = request.args.get("status")
    sql = "SELECT * FROM orders"
    params = []
    if status:
        sql += " WHERE status = ?"
        params.append(status)
    sql += " ORDER BY created_at DESC"
    rows = db.execute(sql, params).fetchall()
    return jsonify(
        [
            {
                "id": r["id"], "order_ref": r["order_ref"], "customer_name": r["customer_name"],
                "customer_email": r["customer_email"], "shipping_country": r["shipping_country"],
                "total_pesewas": r["total_pesewas"], "status": r["status"], "created_at": r["created_at"],
            }
            for r in rows
        ]
    )


@api_admin_bp.route("/orders/<int:order_id>", methods=["GET"])
@login_required
def get_order_admin(order_id):
    db = get_db()
    order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if order is None:
        return jsonify({"error": "Order not found"}), 404
    items = db.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
    return jsonify(
        {
            "id": order["id"], "order_ref": order["order_ref"], "customer_name": order["customer_name"],
            "customer_email": order["customer_email"], "customer_phone": order["customer_phone"],
            "shipping_address": order["shipping_address"], "shipping_city": order["shipping_city"],
            "shipping_country": order["shipping_country"], "shipping_cost_pesewas": order["shipping_cost_pesewas"],
            "subtotal_pesewas": order["subtotal_pesewas"], "discount_code": order["discount_code"],
            "discount_amount_pesewas": order["discount_amount_pesewas"], "total_pesewas": order["total_pesewas"],
            "status": order["status"], "customer_notes": order["customer_notes"],
            "admin_notes": order["admin_notes"], "created_at": order["created_at"],
            "items": [
                {
                    "product_name": i["product_name"], "qty": i["qty"],
                    "product_price_pesewas": i["product_price_pesewas"],
                    "line_total_pesewas": i["line_total_pesewas"],
                }
                for i in items
            ],
        }
    )


@api_admin_bp.route("/orders/<int:order_id>", methods=["PUT"])
@login_required
def update_order(order_id):
    data = request.get_json(force=True, silent=True) or {}
    db = get_db()
    existing = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if existing is None:
        return jsonify({"error": "Order not found"}), 404

    status = data.get("status", existing["status"])
    admin_notes = data.get("admin_notes", existing["admin_notes"])
    db.execute(
        "UPDATE orders SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?",
        (status, admin_notes, order_id),
    )
    db.commit()

    if status == "shipped" and existing["status"] != "shipped":
        order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        items = db.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
        send_order_shipped_email(db, order, items)

    return jsonify({"ok": True})


# --- shipping rates ---

def rate_dict(row):
    return {
        "id": row["id"], "zone_name": row["zone_name"], "zone_type": row["zone_type"],
        "countries": json.loads(row["countries"]), "base_rate_pesewas": row["base_rate_pesewas"],
        "per_item_rate_pesewas": row["per_item_rate_pesewas"], "is_active": bool(row["is_active"]),
    }


@api_admin_bp.route("/shipping-rates", methods=["GET"])
@login_required
def list_shipping_rates():
    db = get_db()
    rows = db.execute("SELECT * FROM shipping_rates ORDER BY zone_type, zone_name").fetchall()
    return jsonify([rate_dict(r) for r in rows])


@api_admin_bp.route("/shipping-rates", methods=["POST"])
@login_required
def create_shipping_rate():
    data = request.get_json(force=True, silent=True) or {}
    required = ["zone_name", "zone_type", "countries", "base_rate_pesewas"]
    if not all(f in data for f in required):
        return jsonify({"error": "Missing required fields"}), 400
    db = get_db()
    try:
        cur = db.execute(
            """INSERT INTO shipping_rates (zone_name, zone_type, countries, base_rate_pesewas,
               per_item_rate_pesewas, is_active) VALUES (?, ?, ?, ?, ?, ?)""",
            (
                data["zone_name"], data["zone_type"], json.dumps(data["countries"]),
                int(data["base_rate_pesewas"]), int(data.get("per_item_rate_pesewas", 0)),
                1 if data.get("is_active", True) else 0,
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "A zone with that name already exists"}), 400
    row = db.execute("SELECT * FROM shipping_rates WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(rate_dict(row)), 201


@api_admin_bp.route("/shipping-rates/<int:rate_id>", methods=["PUT"])
@login_required
def update_shipping_rate(rate_id):
    data = request.get_json(force=True, silent=True) or {}
    db = get_db()
    existing = db.execute("SELECT * FROM shipping_rates WHERE id = ?", (rate_id,)).fetchone()
    if existing is None:
        return jsonify({"error": "Zone not found"}), 404

    countries = data.get("countries")
    countries_json = json.dumps(countries) if countries is not None else existing["countries"]

    db.execute(
        """UPDATE shipping_rates SET zone_name=?, zone_type=?, countries=?, base_rate_pesewas=?,
           per_item_rate_pesewas=?, is_active=? WHERE id=?""",
        (
            data.get("zone_name", existing["zone_name"]), data.get("zone_type", existing["zone_type"]),
            countries_json, int(data.get("base_rate_pesewas", existing["base_rate_pesewas"])),
            int(data.get("per_item_rate_pesewas", existing["per_item_rate_pesewas"])),
            1 if data.get("is_active", existing["is_active"]) else 0, rate_id,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM shipping_rates WHERE id = ?", (rate_id,)).fetchone()
    return jsonify(rate_dict(row))


# --- settings (payment gateway keys, email/SMTP, etc.) ---

SETTINGS_KEYS = (
    "paystack_secret_key",
    "paystack_public_key",
    "smtp_host",
    "smtp_port",
    "smtp_username",
    "smtp_password",
    "smtp_encryption",
    "mail_from_name",
    "mail_from_email",
    "admin_notify_email",
)


SITE_CONTENT_KEYS = (
    "home_promo_enabled",
    "home_promo_text",
    "home_promo_link_text",
    "home_promo_link_url",
    "home_eyebrow",
    "home_title",
    "home_intro",
    "home_primary_cta_text",
    "home_primary_cta_url",
    "home_feature_1_title",
    "home_feature_1_text",
    "home_feature_2_title",
    "home_feature_2_text",
    "home_feature_3_title",
    "home_feature_3_text",
    "home_why_title",
    "home_why_text",
    "testimonial_1_name",
    "testimonial_1_text",
    "testimonial_2_name",
    "testimonial_2_text",
    "testimonial_3_name",
    "testimonial_3_text",
    "site_meta_title",
    "site_meta_description",
)


@api_admin_bp.route("/settings", methods=["GET"])
@login_required
def get_settings():
    db = get_db()
    return jsonify({key: get_setting(db, key, "") or "" for key in SETTINGS_KEYS})


@api_admin_bp.route("/settings", methods=["PUT"])
@login_required
def update_settings():
    data = request.get_json(force=True, silent=True) or {}
    db = get_db()
    for key in SETTINGS_KEYS:
        if key in data:
            set_setting(db, key, (data[key] or "").strip())
    db.commit()
    return jsonify({"ok": True})


@api_admin_bp.route("/site-content", methods=["GET"])
@login_required
def get_site_content_admin():
    db = get_db()
    return jsonify({key: get_setting(db, key, "") or "" for key in SITE_CONTENT_KEYS})


@api_admin_bp.route("/site-content", methods=["PUT"])
@login_required
def update_site_content_admin():
    data = request.get_json(force=True, silent=True) or {}
    db = get_db()
    for key in SITE_CONTENT_KEYS:
        if key in data:
            set_setting(db, key, (data[key] or "").strip())
    db.commit()
    return jsonify({"ok": True})


@api_admin_bp.route("/settings/test-email", methods=["POST"])
@login_required
def settings_test_email():
    data = request.get_json(force=True, silent=True) or {}
    to_email = (data.get("to") or "").strip()
    if not to_email:
        return jsonify({"error": "Enter an address to send the test email to"}), 400
    try:
        send_test_email(get_db(), to_email)
    except Exception as e:
        return jsonify({"error": f"Test email failed: {e}"}), 502
    return jsonify({"ok": True})


# --- customers ---

@api_admin_bp.route("/customers", methods=["GET"])
@login_required
def list_customers():
    db = get_db()
    rows = db.execute(
        """SELECT c.*, COUNT(o.id) AS order_count, COALESCE(SUM(o.total_pesewas), 0) AS total_spent_pesewas
           FROM customers c
           LEFT JOIN orders o ON o.customer_id = c.id
           GROUP BY c.id
           ORDER BY c.created_at DESC"""
    ).fetchall()
    return jsonify(
        [
            {
                "id": r["id"], "name": r["name"], "email": r["email"], "phone": r["phone"],
                "order_count": r["order_count"], "total_spent_pesewas": r["total_spent_pesewas"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    )


@api_admin_bp.route("/customers/<int:customer_id>", methods=["GET"])
@login_required
def get_customer_admin(customer_id):
    db = get_db()
    customer = db.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if customer is None:
        return jsonify({"error": "Customer not found"}), 404
    orders = db.execute(
        "SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,)
    ).fetchall()
    return jsonify(
        {
            "id": customer["id"], "name": customer["name"], "email": customer["email"],
            "phone": customer["phone"], "created_at": customer["created_at"],
            "orders": [
                {
                    "order_ref": o["order_ref"], "status": o["status"],
                    "total_pesewas": o["total_pesewas"], "created_at": o["created_at"],
                }
                for o in orders
            ],
        }
    )


# --- product reviews ---

@api_admin_bp.route("/reviews", methods=["GET"])
@login_required
def list_reviews_admin():
    db = get_db()
    rows = db.execute(
        """SELECT r.*, p.name AS product_name, p.slug AS product_slug, c.name AS customer_name,
                  c.email AS customer_email
           FROM reviews r
           JOIN products p ON p.id = r.product_id
           JOIN customers c ON c.id = r.customer_id
           ORDER BY r.created_at DESC"""
    ).fetchall()
    return jsonify(
        [
            {
                "id": r["id"], "product_name": r["product_name"], "product_slug": r["product_slug"],
                "customer_name": r["customer_name"], "customer_email": r["customer_email"],
                "rating": r["rating"], "body": r["body"], "created_at": r["created_at"],
            }
            for r in rows
        ]
    )


@api_admin_bp.route("/reviews/<int:review_id>", methods=["DELETE"])
@login_required
def delete_review_admin(review_id):
    db = get_db()
    db.execute("DELETE FROM reviews WHERE id = ?", (review_id,))
    db.commit()
    return jsonify({"ok": True})


# --- discount codes ---

def discount_code_dict(row):
    return {
        "id": row["id"], "code": row["code"], "kind": row["kind"], "value": row["value"],
        "min_subtotal_pesewas": row["min_subtotal_pesewas"], "max_uses": row["max_uses"],
        "used_count": row["used_count"], "is_active": bool(row["is_active"]),
        "expires_at": row["expires_at"], "created_at": row["created_at"],
    }


@api_admin_bp.route("/discount-codes", methods=["GET"])
@login_required
def list_discount_codes():
    db = get_db()
    rows = db.execute("SELECT * FROM discount_codes ORDER BY created_at DESC").fetchall()
    return jsonify([discount_code_dict(r) for r in rows])


@api_admin_bp.route("/discount-codes", methods=["POST"])
@login_required
def create_discount_code():
    data = request.get_json(force=True, silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    kind = data.get("kind")
    if not code or kind not in ("percent", "fixed"):
        return jsonify({"error": "Code and discount type are required"}), 400

    value = int(data.get("value") or 0)
    if value <= 0:
        return jsonify({"error": "Discount value must be greater than zero"}), 400
    if kind == "percent" and value > 100:
        return jsonify({"error": "Percent discounts cannot exceed 100"}), 400

    max_uses = data.get("max_uses")
    max_uses = int(max_uses) if max_uses not in (None, "") else None
    db = get_db()
    try:
        cur = db.execute(
            """INSERT INTO discount_codes
               (code, kind, value, min_subtotal_pesewas, max_uses, is_active, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                code, kind, value, int(data.get("min_subtotal_pesewas") or 0), max_uses,
                1 if data.get("is_active", True) else 0, data.get("expires_at") or None,
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "A discount code with that name already exists"}), 400
    row = db.execute("SELECT * FROM discount_codes WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(discount_code_dict(row)), 201


@api_admin_bp.route("/discount-codes/<int:code_id>", methods=["PUT"])
@login_required
def update_discount_code(code_id):
    data = request.get_json(force=True, silent=True) or {}
    db = get_db()
    existing = db.execute("SELECT * FROM discount_codes WHERE id = ?", (code_id,)).fetchone()
    if existing is None:
        return jsonify({"error": "Discount code not found"}), 404

    code = (data.get("code", existing["code"]) or "").strip().upper()
    kind = data.get("kind", existing["kind"])
    value = int(data.get("value", existing["value"]) or 0)
    if not code or kind not in ("percent", "fixed") or value <= 0:
        return jsonify({"error": "Enter a valid code, type, and value"}), 400
    if kind == "percent" and value > 100:
        return jsonify({"error": "Percent discounts cannot exceed 100"}), 400

    max_uses = data.get("max_uses", existing["max_uses"])
    max_uses = int(max_uses) if max_uses not in (None, "") else None
    try:
        db.execute(
            """UPDATE discount_codes SET code=?, kind=?, value=?, min_subtotal_pesewas=?,
               max_uses=?, is_active=?, expires_at=? WHERE id=?""",
            (
                code, kind, value, int(data.get("min_subtotal_pesewas", existing["min_subtotal_pesewas"]) or 0),
                max_uses, 1 if data.get("is_active", existing["is_active"]) else 0,
                data.get("expires_at") or None, code_id,
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "A discount code with that name already exists"}), 400
    row = db.execute("SELECT * FROM discount_codes WHERE id = ?", (code_id,)).fetchone()
    return jsonify(discount_code_dict(row))


@api_admin_bp.route("/discount-codes/<int:code_id>", methods=["DELETE"])
@login_required
def delete_discount_code(code_id):
    db = get_db()
    db.execute("UPDATE discount_codes SET is_active = 0 WHERE id = ?", (code_id,))
    db.commit()
    return jsonify({"ok": True})


# --- dashboard stats ---

@api_admin_bp.route("/stats", methods=["GET"])
@login_required
def get_stats():
    db = get_db()
    product_count = db.execute("SELECT COUNT(*) AS c FROM products WHERE is_active = 1").fetchone()["c"]
    order_count = db.execute("SELECT COUNT(*) AS c FROM orders").fetchone()["c"]
    pending_count = db.execute(
        "SELECT COUNT(*) AS c FROM orders WHERE status = 'pending_payment'"
    ).fetchone()["c"]
    revenue = db.execute(
        """SELECT COALESCE(SUM(total_pesewas), 0) AS total FROM orders
           WHERE status IN ('paid', 'processing', 'shipped', 'completed')"""
    ).fetchone()["total"]
    customer_count = db.execute("SELECT COUNT(*) AS c FROM customers").fetchone()["c"]

    low_stock_rows = db.execute(
        "SELECT id, name, stock_qty FROM products WHERE is_active = 1 AND stock_qty <= 5 ORDER BY stock_qty"
    ).fetchall()
    recent_order_rows = db.execute(
        "SELECT * FROM orders ORDER BY created_at DESC LIMIT 5"
    ).fetchall()

    return jsonify(
        {
            "product_count": product_count,
            "order_count": order_count,
            "pending_payment_count": pending_count,
            "revenue_pesewas": revenue,
            "customer_count": customer_count,
            "low_stock": [{"id": r["id"], "name": r["name"], "stock_qty": r["stock_qty"]} for r in low_stock_rows],
            "recent_orders": [
                {
                    "order_ref": r["order_ref"], "customer_name": r["customer_name"],
                    "status": r["status"], "total_pesewas": r["total_pesewas"],
                }
                for r in recent_order_rows
            ],
        }
    )
