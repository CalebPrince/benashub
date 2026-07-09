import json

from flask import Blueprint, jsonify, request

from .. import shipping
from ..db import get_db

api_shipping_bp = Blueprint("api_shipping", __name__)


@api_shipping_bp.route("/shipping/zones")
def list_zones():
    db = get_db()
    rows = db.execute("SELECT * FROM shipping_rates WHERE is_active = 1").fetchall()
    return jsonify(
        [
            {
                "id": r["id"],
                "zone_name": r["zone_name"],
                "zone_type": r["zone_type"],
                "countries": json.loads(r["countries"]),
            }
            for r in rows
        ]
    )


@api_shipping_bp.route("/shipping/estimate", methods=["POST"])
def estimate_shipping():
    data = request.get_json(force=True, silent=True) or {}
    country = data.get("country")
    items = data.get("items", [])
    if not country:
        return jsonify({"error": "country is required"}), 400

    db = get_db()
    result = shipping.estimate(db, country, items)
    return jsonify(result)
