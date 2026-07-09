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

    shipping_cost = ship_result["shipping_cost_pesewas"]
    total = subtotal + shipping_cost
    order_ref = generate_order_ref()

    cur = db.cursor()
    cur.execute(
        """INSERT INTO orders
           (order_ref, customer_id, customer_name, customer_email, customer_phone, shipping_address,
            shipping_city, shipping_country, shipping_zone_id, shipping_cost_pesewas, subtotal_pesewas,
            total_pesewas, status, customer_notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?)""",
        (
            order_ref, session.get("customer_id"), customer_name, customer_email, customer_phone,
            shipping_address, shipping_city, shipping_country, ship_result["zone_id"], shipping_cost,
            subtotal, total, customer_notes,
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
