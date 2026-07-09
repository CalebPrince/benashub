import json
import os
import sqlite3
import uuid

from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import check_password_hash
from werkzeug.utils import secure_filename

from ..auth import login_required
from ..db import get_db

api_admin_bp = Blueprint("api_admin", __name__)


# --- auth ---

@api_admin_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True, silent=True) or {}
    username = data.get("username", "")
    password = data.get("password", "")

    db = get_db()
    user = db.execute("SELECT * FROM admin_users WHERE username = ?", (username,)).fetchone()
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

def product_admin_dict(row):
    return {
        "id": row["id"],
        "category_id": row["category_id"],
        "name": row["name"],
        "slug": row["slug"],
        "description": row["description"],
        "price_pesewas": row["price_pesewas"],
        "stock_qty": row["stock_qty"],
        "ships_internationally": bool(row["ships_internationally"]),
        "is_active": bool(row["is_active"]),
        "image_url": row["image_url"],
    }


@api_admin_bp.route("/products", methods=["GET"])
@login_required
def list_products():
    db = get_db()
    rows = db.execute("SELECT * FROM products ORDER BY created_at DESC").fetchall()
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
               (category_id, name, slug, description, price_pesewas, stock_qty, ships_internationally,
                is_active, image_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data["category_id"], data["name"], data["slug"], data.get("description", ""),
                int(data["price_pesewas"]), int(data.get("stock_qty", 0)),
                1 if data.get("ships_internationally") else 0,
                1 if data.get("is_active", True) else 0,
                data.get("image_url") or "/static/img/products/placeholder.svg",
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "A product with that slug already exists"}), 400

    row = db.execute("SELECT * FROM products WHERE id = ?", (cur.lastrowid,)).fetchone()
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
            """UPDATE products SET category_id=?, name=?, slug=?, description=?, price_pesewas=?,
               stock_qty=?, ships_internationally=?, is_active=?, image_url=?, updated_at=datetime('now')
               WHERE id=?""",
            (
                pick("category_id", int), pick("name"), pick("slug"), pick("description"),
                pick("price_pesewas", int), pick("stock_qty", int),
                1 if data.get("ships_internationally", existing["ships_internationally"]) else 0,
                1 if data.get("is_active", existing["is_active"]) else 0,
                pick("image_url"), product_id,
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "A product with that slug already exists"}), 400

    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
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


# --- categories (read-only list for the product form dropdown) ---

@api_admin_bp.route("/categories", methods=["GET"])
@login_required
def list_categories_admin():
    db = get_db()
    rows = db.execute("SELECT * FROM categories ORDER BY sort_order, name").fetchall()
    return jsonify([{"id": r["id"], "name": r["name"], "slug": r["slug"]} for r in rows])


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
            "subtotal_pesewas": order["subtotal_pesewas"], "total_pesewas": order["total_pesewas"],
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
