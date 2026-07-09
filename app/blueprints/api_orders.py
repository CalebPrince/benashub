import secrets
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, session, url_for

from .. import shipping
from ..db import get_db
from ..payments import get_gateway
from ..payments.paystack import PaystackError, PaystackNotConfigured

api_orders_bp = Blueprint("api_orders", __name__)


def generate_order_ref():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"BH-{stamp}-{secrets.token_hex(3).upper()}"


def normalize_discount_code(code):
    return (code or "").strip().upper()


PAID_ORDER_STATUSES = ("paid", "processing", "shipped", "completed")


def customer_has_paid_order(db, customer_id=None, customer_email=None):
    clauses = []
    params = []
    if customer_id:
        clauses.append("customer_id = ?")
        params.append(customer_id)
    if customer_email:
        clauses.append("lower(customer_email) = ?")
        params.append(customer_email.strip().lower())
    if not clauses:
        return False
    status_placeholders = ",".join("?" for _ in PAID_ORDER_STATUSES)
    row = db.execute(
        f"""SELECT COUNT(*) AS c FROM orders
            WHERE status IN ({status_placeholders})
              AND ({" OR ".join(clauses)})""",
        [*PAID_ORDER_STATUSES, *params],
    ).fetchone()
    return row["c"] > 0


def get_discount_for_subtotal(db, code, subtotal, customer_id=None, customer_email=None):
    normalized = normalize_discount_code(code)
    if not normalized:
        return None, 0, None

    discount = db.execute("SELECT * FROM discount_codes WHERE code = ?", (normalized,)).fetchone()
    if discount is None or not discount["is_active"]:
        return None, 0, "Discount code not found"
    if discount["expires_at"] and discount["expires_at"] < datetime.now(timezone.utc).strftime("%Y-%m-%d"):
        return None, 0, "Discount code has expired"
    if discount["max_uses"] is not None and discount["used_count"] >= discount["max_uses"]:
        return None, 0, "Discount code has reached its usage limit"
    if subtotal < discount["min_subtotal_pesewas"]:
        minimum = discount["min_subtotal_pesewas"] / 100
        return None, 0, f"Discount code requires a subtotal of at least GHS {minimum:.2f}"
    if discount["first_order_only"]:
        if not customer_id and not customer_email:
            return None, 0, "Enter your email before applying this first-order code"
        if customer_has_paid_order(db, customer_id, customer_email):
            return None, 0, "This discount code is only for first orders"

    if discount["kind"] == "percent":
        amount = round(subtotal * discount["value"] / 100)
    else:
        amount = discount["value"]
    return discount, min(amount, subtotal), None


@api_orders_bp.route("/discount-codes/validate", methods=["POST"])
def validate_discount_code():
    data = request.get_json(force=True, silent=True) or {}
    try:
        subtotal = int(data.get("subtotal_pesewas", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid subtotal"}), 400
    discount, amount, error = get_discount_for_subtotal(
        get_db(), data.get("code"), subtotal,
        customer_id=session.get("customer_id"),
        customer_email=data.get("customer_email"),
    )
    if error:
        return jsonify({"error": error}), 400
    if discount is None:
        return jsonify({"error": "Enter a discount code"}), 400
    return jsonify(
        {
            "code": discount["code"],
            "kind": discount["kind"],
            "value": discount["value"],
            "discount_amount_pesewas": amount,
        }
    )


@api_orders_bp.route("/orders", methods=["POST"])
def create_order():
    data = request.get_json(force=True, silent=True) or {}

    customer_name = (data.get("customer_name") or "").strip()
    customer_email = (data.get("customer_email") or "").strip()
    customer_phone = (data.get("customer_phone") or "").strip()
    shipping_address = (data.get("shipping_address") or "").strip()
    shipping_city = (data.get("shipping_city") or "").strip()
    shipping_country = (data.get("shipping_country") or "").strip()
    customer_notes = (data.get("customer_notes") or "").strip()
    discount_code = normalize_discount_code(data.get("discount_code"))
    items = data.get("items", [])

    if not all([customer_name, customer_email, customer_phone, shipping_address, shipping_city, shipping_country]):
        return jsonify({"error": "Missing required customer/shipping details"}), 400
    if not items:
        return jsonify({"error": "Cart is empty"}), 400

    db = get_db()

    ship_result = shipping.estimate(db, shipping_country, items)
    if ship_result["zone_id"] is None:
        return jsonify({"error": ship_result.get("error", "We don't ship to that destination")}), 400
    if ship_result["excluded_items"]:
        names = ", ".join(i["name"] for i in ship_result["excluded_items"])
        return (
            jsonify(
                {
                    "error": f"These items can't ship to {shipping_country}: {names}. Remove them and try again.",
                    "excluded_items": ship_result["excluded_items"],
                }
            ),
            400,
        )
    if not ship_result["deliverable"]:
        return jsonify({"error": "No items in the cart can be shipped to that destination"}), 400

    order_items = []
    subtotal = 0
    for item in items:
        product = db.execute(
            "SELECT * FROM products WHERE id = ? AND is_active = 1", (item.get("product_id"),)
        ).fetchone()
        if product is None:
            return jsonify({"error": "One of the items in your cart is no longer available"}), 400
        qty = int(item.get("qty", 1))
        if qty < 1:
            return jsonify({"error": "Invalid quantity"}), 400
        if product["stock_qty"] < qty:
            return jsonify({"error": f"Not enough stock for {product['name']}"}), 400
        line_total = product["price_pesewas"] * qty
        subtotal += line_total
        order_items.append(
            {
                "product_id": product["id"],
                "product_name": product["name"],
                "product_price_pesewas": product["price_pesewas"],
                "ships_internationally": product["ships_internationally"],
                "qty": qty,
                "line_total_pesewas": line_total,
            }
        )

    discount = None
    discount_amount = 0
    if discount_code:
        discount, discount_amount, discount_error = get_discount_for_subtotal(
            db, discount_code, subtotal,
            customer_id=session.get("customer_id"),
            customer_email=customer_email,
        )
        if discount_error:
            return jsonify({"error": discount_error}), 400

    shipping_cost = ship_result["shipping_cost_pesewas"]
    total = subtotal - discount_amount + shipping_cost
    order_ref = generate_order_ref()

    cur = db.cursor()
    cur.execute(
        """INSERT INTO orders
           (order_ref, customer_id, customer_name, customer_email, customer_phone, shipping_address,
            shipping_city, shipping_country, shipping_zone_id, shipping_cost_pesewas, subtotal_pesewas,
            discount_code_id, discount_code, discount_amount_pesewas, total_pesewas, status, customer_notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?)""",
        (
            order_ref, session.get("customer_id"), customer_name, customer_email, customer_phone,
            shipping_address, shipping_city, shipping_country, ship_result["zone_id"], shipping_cost,
            subtotal, discount["id"] if discount else None, discount["code"] if discount else None,
            discount_amount, total, customer_notes,
        ),
    )
    order_id = cur.lastrowid

    for oi in order_items:
        cur.execute(
            """INSERT INTO order_items
               (order_id, product_id, product_name, product_price_pesewas, ships_internationally, qty,
                line_total_pesewas)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                order_id, oi["product_id"], oi["product_name"], oi["product_price_pesewas"],
                oi["ships_internationally"], oi["qty"], oi["line_total_pesewas"],
            ),
        )
    if discount:
        cur.execute("UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?", (discount["id"],))
    db.commit()

    order = {"order_ref": order_ref, "customer_email": customer_email, "total_pesewas": total}

    try:
        gateway = get_gateway()
        callback_url = url_for("pages.checkout", _external=True)
        payment = gateway.initialize(order, callback_url)
    except PaystackNotConfigured as e:
        return jsonify({"error": str(e), "order_ref": order_ref}), 503
    except PaystackError as e:
        return jsonify({"error": f"Payment initialization failed: {e}", "order_ref": order_ref}), 502

    db.execute(
        """INSERT INTO payments (order_id, gateway, reference, status, amount_pesewas)
           VALUES (?, 'paystack', ?, 'pending', ?)""",
        (order_id, payment["reference"], total),
    )
    db.commit()

    return jsonify(
        {
            "order_ref": order_ref,
            "total_pesewas": total,
            "authorization_url": payment["authorization_url"],
        }
    )


@api_orders_bp.route("/orders/<order_ref>")
def get_order(order_ref):
    db = get_db()
    order = db.execute("SELECT * FROM orders WHERE order_ref = ?", (order_ref,)).fetchone()
    if order is None:
        return jsonify({"error": "Order not found"}), 404
    items = db.execute("SELECT * FROM order_items WHERE order_id = ?", (order["id"],)).fetchall()
    return jsonify(
        {
            "order_ref": order["order_ref"],
            "status": order["status"],
            "customer_name": order["customer_name"],
            "customer_email": order["customer_email"],
            "shipping_address": order["shipping_address"],
            "shipping_city": order["shipping_city"],
            "shipping_country": order["shipping_country"],
            "shipping_cost_pesewas": order["shipping_cost_pesewas"],
            "subtotal_pesewas": order["subtotal_pesewas"],
            "discount_code": order["discount_code"],
            "discount_amount_pesewas": order["discount_amount_pesewas"],
            "total_pesewas": order["total_pesewas"],
            "items": [
                {
                    "product_name": i["product_name"],
                    "qty": i["qty"],
                    "product_price_pesewas": i["product_price_pesewas"],
                    "line_total_pesewas": i["line_total_pesewas"],
                }
                for i in items
            ],
        }
    )


@api_orders_bp.route("/orders/track", methods=["POST"])
def track_order():
    data = request.get_json(force=True, silent=True) or {}
    order_ref = (data.get("order_ref") or "").strip()
    customer_email = (data.get("customer_email") or "").strip().lower()
    if not order_ref or not customer_email:
        return jsonify({"error": "Order reference and email are required"}), 400

    db = get_db()
    order = db.execute(
        "SELECT * FROM orders WHERE order_ref = ? AND lower(customer_email) = ?",
        (order_ref, customer_email),
    ).fetchone()
    if order is None:
        return jsonify({"error": "No order matched that reference and email"}), 404

    items = db.execute("SELECT * FROM order_items WHERE order_id = ?", (order["id"],)).fetchall()
    return jsonify(
        {
            "order_ref": order["order_ref"],
            "status": order["status"],
            "customer_name": order["customer_name"],
            "shipping_city": order["shipping_city"],
            "shipping_country": order["shipping_country"],
            "shipping_cost_pesewas": order["shipping_cost_pesewas"],
            "subtotal_pesewas": order["subtotal_pesewas"],
            "discount_code": order["discount_code"],
            "discount_amount_pesewas": order["discount_amount_pesewas"],
            "total_pesewas": order["total_pesewas"],
            "created_at": order["created_at"],
            "updated_at": order["updated_at"],
            "items": [
                {
                    "product_name": i["product_name"],
                    "qty": i["qty"],
                    "line_total_pesewas": i["line_total_pesewas"],
                }
                for i in items
            ],
        }
    )
