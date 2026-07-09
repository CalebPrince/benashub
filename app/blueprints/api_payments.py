import hashlib
import hmac
import json

from flask import Blueprint, jsonify, request

from ..db import get_db
from ..mailer import send_admin_new_order_email, send_order_confirmation_email
from ..payments import get_gateway
from ..payments.paystack import PaystackError, PaystackNotConfigured
from ..settings import get_setting

api_payments_bp = Blueprint("api_payments", __name__)


def _apply_verified_payment(db, reference, result):
    payment = db.execute("SELECT * FROM payments WHERE reference = ?", (reference,)).fetchone()
    if payment is None:
        return None
    if payment["status"] == "success":
        return payment  # already processed; idempotent no-op

    new_status = "success" if result["status"] == "success" else "failed"
    db.execute(
        "UPDATE payments SET status = ?, raw_response = ?, updated_at = datetime('now') WHERE id = ?",
        (new_status, json.dumps(result.get("raw", {})), payment["id"]),
    )
    order_status = "paid" if new_status == "success" else "payment_failed"
    db.execute(
        "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?",
        (order_status, payment["order_id"]),
    )
    db.commit()

    if new_status == "success":
        # The already-processed guard above means these send at most once per order.
        order = db.execute("SELECT * FROM orders WHERE id = ?", (payment["order_id"],)).fetchone()
        items = db.execute("SELECT * FROM order_items WHERE order_id = ?", (payment["order_id"],)).fetchall()
        send_order_confirmation_email(db, order, items)
        send_admin_new_order_email(db, order, items)

    return payment


@api_payments_bp.route("/payments/verify", methods=["POST"])
def verify_payment():
    data = request.get_json(force=True, silent=True) or {}
    reference = data.get("reference")
    if not reference:
        return jsonify({"error": "reference is required"}), 400

    db = get_db()
    try:
        gateway = get_gateway()
        result = gateway.verify(reference)
    except PaystackNotConfigured as e:
        return jsonify({"error": str(e)}), 503
    except PaystackError as e:
        return jsonify({"error": str(e)}), 502

    payment = _apply_verified_payment(db, reference, result)
    if payment is None:
        return jsonify({"error": "Unknown payment reference"}), 404

    order = db.execute("SELECT order_ref, status FROM orders WHERE id = ?", (payment["order_id"],)).fetchone()
    return jsonify({"order_ref": order["order_ref"], "status": order["status"]})


@api_payments_bp.route("/payments/paystack/webhook", methods=["POST"])
def paystack_webhook():
    secret = get_setting(get_db(), "paystack_secret_key")
    if not secret:
        return jsonify({"error": "not configured"}), 503

    signature = request.headers.get("x-paystack-signature", "")
    computed = hmac.new(secret.encode("utf-8"), request.data, hashlib.sha512).hexdigest()
    if not hmac.compare_digest(signature, computed):
        return jsonify({"error": "invalid signature"}), 401

    payload = request.get_json(force=True, silent=True) or {}
    if payload.get("event") == "charge.success":
        reference = payload.get("data", {}).get("reference")
        if reference:
            db = get_db()
            try:
                gateway = get_gateway()
                result = gateway.verify(reference)
                _apply_verified_payment(db, reference, result)
            except (PaystackNotConfigured, PaystackError):
                pass

    return jsonify({"received": True})
