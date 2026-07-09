import json


def get_zone_for_country(db, country):
    rows = db.execute("SELECT * FROM shipping_rates WHERE is_active = 1").fetchall()
    for row in rows:
        countries = json.loads(row["countries"])
        if country in countries:
            return row
    return None


def estimate(db, country, items):
    """items: list of {product_id, qty}.

    Returns a dict describing the shipping zone, cost, and which cart items
    are eligible/excluded for that destination. Used by both the public
    estimate endpoint and order creation, so the two never drift apart.
    """
    zone = get_zone_for_country(db, country)
    if zone is None:
        return {
            "zone_id": None,
            "zone_name": None,
            "zone_type": None,
            "deliverable": False,
            "shipping_cost_pesewas": 0,
            "eligible_items": [],
            "excluded_items": [],
            "error": f"We don't currently ship to {country}.",
        }

    eligible = []
    excluded = []
    for item in items:
        product = db.execute(
            "SELECT id, name, ships_internationally FROM products WHERE id = ? AND is_active = 1",
            (item["product_id"],),
        ).fetchone()
        if product is None:
            continue
        qty = int(item.get("qty", 1))
        entry = {"product_id": product["id"], "name": product["name"], "qty": qty}
        if zone["zone_type"] == "domestic" or product["ships_internationally"]:
            eligible.append(entry)
        else:
            excluded.append(entry)

    total_eligible_qty = sum(e["qty"] for e in eligible)
    if total_eligible_qty == 0:
        cost = 0
    else:
        cost = zone["base_rate_pesewas"] + zone["per_item_rate_pesewas"] * max(0, total_eligible_qty - 1)

    return {
        "zone_id": zone["id"],
        "zone_name": zone["zone_name"],
        "zone_type": zone["zone_type"],
        "deliverable": total_eligible_qty > 0,
        "shipping_cost_pesewas": cost,
        "eligible_items": eligible,
        "excluded_items": excluded,
    }
