import re
import sqlite3

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from ..customer_auth import customer_login_required
from ..db import get_db

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

    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required"}), 400
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
    return jsonify(customer_dict(row)), 201


@api_customers_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    db = get_db()
    row = db.execute("SELECT * FROM customers WHERE email = ?", (email,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    session["customer_id"] = row["id"]
    return jsonify(customer_dict(row))


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
