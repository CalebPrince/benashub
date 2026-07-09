import hashlib
import re
import secrets
import sqlite3

from flask import Blueprint, jsonify, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from ..customer_auth import customer_login_required
from ..db import get_db
from ..mailer import load_mail_config, send_password_reset_email, send_welcome_email

api_customers_bp = Blueprint("api_customers", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def customer_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
    }


@api_customers_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    password = data.get("password") or ""
    terms_accepted = bool(data.get("terms_accepted"))

    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required"}), 400
    if not terms_accepted:
        return jsonify({"error": "You must agree to the Terms of Use before creating an account"}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO customers (name, email, phone, password_hash) VALUES (?, ?, ?, ?)",
            (name, email, phone, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "An account with that email already exists"}), 400

    row = db.execute("SELECT * FROM customers WHERE id = ?", (cur.lastrowid,)).fetchone()
    session["customer_id"] = row["id"]
    send_welcome_email(db, name, email)
    return jsonify(customer_dict(row)), 201


@api_customers_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not EMAIL_RE.match(email):
        return jsonify({"error": "Enter your email address to log in"}), 400

    db = get_db()
    row = db.execute("SELECT * FROM customers WHERE email = ?", (email,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    session["customer_id"] = row["id"]
    return jsonify(customer_dict(row))


@api_customers_bp.route("/password-reset/request", methods=["POST"])
def password_reset_request():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email or not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address"}), 400

    db = get_db()
    if load_mail_config(db) is None:
        return (
            jsonify({"error": "Password reset emails aren't available right now. Please contact us for help."}),
            503,
        )

    row = db.execute("SELECT * FROM customers WHERE email = ?", (email,)).fetchone()
    if row is not None:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        db.execute("DELETE FROM password_resets WHERE customer_id = ?", (row["id"],))
        db.execute(
            """INSERT INTO password_resets (customer_id, token_hash, expires_at)
               VALUES (?, ?, datetime('now', '+1 hour'))""",
            (row["id"], token_hash),
        )
        db.commit()
        reset_url = url_for("pages.account_reset_password", _external=True) + "?token=" + token
        send_password_reset_email(db, row["name"], row["email"], reset_url)

    # Same response whether or not an account exists, so emails can't be enumerated.
    return jsonify({"ok": True})


@api_customers_bp.route("/password-reset/confirm", methods=["POST"])
def password_reset_confirm():
    data = request.get_json(force=True, silent=True) or {}
    token = (data.get("token") or "").strip()
    password = data.get("password") or ""
    if not token:
        return jsonify({"error": "Missing reset token"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    db = get_db()
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = db.execute(
        """SELECT * FROM password_resets
           WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')""",
        (token_hash,),
    ).fetchone()
    if row is None:
        return jsonify({"error": "This reset link is invalid or has expired. Request a new one."}), 400

    db.execute(
        "UPDATE customers SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
        (generate_password_hash(password), row["customer_id"]),
    )
    db.execute("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?", (row["id"],))
    db.commit()
    return jsonify({"ok": True})


@api_customers_bp.route("/logout", methods=["POST"])
def logout():
    session.pop("customer_id", None)
    return jsonify({"ok": True})


@api_customers_bp.route("/session")
def get_session():
    customer_id = session.get("customer_id")
    if not customer_id:
        return jsonify({"logged_in": False})
    db = get_db()
    row = db.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if row is None:
        session.pop("customer_id", None)
        return jsonify({"logged_in": False})
    return jsonify({"logged_in": True, **customer_dict(row)})


@api_customers_bp.route("/me")
@customer_login_required
def get_me():
    db = get_db()
    row = db.execute("SELECT * FROM customers WHERE id = ?", (session["customer_id"],)).fetchone()
    return jsonify(customer_dict(row))


@api_customers_bp.route("/me", methods=["PUT"])
@customer_login_required
def update_me():
    data = request.get_json(force=True, silent=True) or {}
    db = get_db()
    existing = db.execute("SELECT * FROM customers WHERE id = ?", (session["customer_id"],)).fetchone()

    name = (data.get("name") or existing["name"]).strip()
    phone = data.get("phone", existing["phone"])
    email = (data.get("email") or existing["email"]).strip().lower()
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address"}), 400

    new_password_hash = existing["password_hash"]
    if data.get("new_password"):
        if not check_password_hash(existing["password_hash"], data.get("current_password") or ""):
            return jsonify({"error": "Current password is incorrect"}), 400
        if len(data["new_password"]) < 8:
            return jsonify({"error": "New password must be at least 8 characters"}), 400
        new_password_hash = generate_password_hash(data["new_password"])

    try:
        db.execute(
            """UPDATE customers SET name = ?, email = ?, phone = ?, password_hash = ?,
               updated_at = datetime('now') WHERE id = ?""",
            (name, email, phone, new_password_hash, existing["id"]),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "An account with that email already exists"}), 400

    row = db.execute("SELECT * FROM customers WHERE id = ?", (existing["id"],)).fetchone()
    return jsonify(customer_dict(row))


@api_customers_bp.route("/orders")
@customer_login_required
def get_orders():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC",
        (session["customer_id"],),
    ).fetchall()
    return jsonify(
        [
            {
                "order_ref": r["order_ref"],
                "status": r["status"],
                "total_pesewas": r["total_pesewas"],
                "shipping_country": r["shipping_country"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    )


@api_customers_bp.route("/wishlist")
@customer_login_required
def get_wishlist():
    db = get_db()
    rows = db.execute(
        """SELECT p.*, w.created_at AS saved_at
           FROM customer_wishlist w
           JOIN products p ON p.id = w.product_id
           WHERE w.customer_id = ? AND p.is_active = 1
           ORDER BY w.created_at DESC""",
        (session["customer_id"],),
    ).fetchall()
    return jsonify(
        [
            {
                "id": r["id"],
                "name": r["name"],
                "slug": r["slug"],
                "price_pesewas": r["price_pesewas"],
                "image_url": r["image_url"],
                "ships_internationally": bool(r["ships_internationally"]),
                "saved_at": r["saved_at"],
            }
            for r in rows
        ]
    )


@api_customers_bp.route("/wishlist", methods=["POST"])
@customer_login_required
def add_wishlist_item():
    data = request.get_json(force=True, silent=True) or {}
    try:
        product_id = int(data.get("product_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid product"}), 400

    db = get_db()
    product = db.execute("SELECT id FROM products WHERE id = ? AND is_active = 1", (product_id,)).fetchone()
    if product is None:
        return jsonify({"error": "Product not found"}), 404
    db.execute(
        """INSERT OR IGNORE INTO customer_wishlist (customer_id, product_id)
           VALUES (?, ?)""",
        (session["customer_id"], product_id),
    )
    db.commit()
    return jsonify({"ok": True})


@api_customers_bp.route("/wishlist/<int:product_id>", methods=["DELETE"])
@customer_login_required
def remove_wishlist_item(product_id):
    db = get_db()
    db.execute(
        "DELETE FROM customer_wishlist WHERE customer_id = ? AND product_id = ?",
        (session["customer_id"], product_id),
    )
    db.commit()
    return jsonify({"ok": True})
