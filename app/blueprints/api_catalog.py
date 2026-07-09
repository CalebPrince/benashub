from flask import Blueprint, jsonify, request, session

from ..db import get_db

api_catalog_bp = Blueprint("api_catalog", __name__)

PRODUCT_SELECT = """
    SELECT p.*, COALESCE(AVG(r.rating), 0) AS avg_rating, COUNT(r.id) AS review_count
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN reviews r ON r.product_id = p.id
"""


def product_to_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "slug": row["slug"],
        "description": row["description"],
        "price_pesewas": row["price_pesewas"],
        "stock_qty": row["stock_qty"],
        "ships_internationally": bool(row["ships_internationally"]),
        "image_url": row["image_url"],
        "category_id": row["category_id"],
        "avg_rating": round(row["avg_rating"], 1),
        "review_count": row["review_count"],
    }


@api_catalog_bp.route("/categories")
def list_categories():
    db = get_db()
    rows = db.execute("SELECT * FROM categories ORDER BY sort_order, name").fetchall()
    return jsonify(
        [{"id": r["id"], "name": r["name"], "slug": r["slug"], "description": r["description"]} for r in rows]
    )


@api_catalog_bp.route("/products")
def list_products():
    db = get_db()
    category = request.args.get("category")
    q = request.args.get("q")

    sql = PRODUCT_SELECT + " WHERE p.is_active = 1"
    params = []
    if category:
        sql += " AND c.slug = ?"
        params.append(category)
    if q:
        sql += " AND p.name LIKE ?"
        params.append(f"%{q}%")
    sql += " GROUP BY p.id ORDER BY p.created_at DESC"

    rows = db.execute(sql, params).fetchall()
    return jsonify([product_to_dict(r) for r in rows])


@api_catalog_bp.route("/products/<slug>")
def get_product(slug):
    db = get_db()
    row = db.execute(
        PRODUCT_SELECT + " WHERE p.slug = ? AND p.is_active = 1 GROUP BY p.id", (slug,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "Product not found"}), 404
    return jsonify(product_to_dict(row))


# --- reviews ---

@api_catalog_bp.route("/products/<slug>/reviews")
def list_reviews(slug):
    db = get_db()
    product = db.execute("SELECT id FROM products WHERE slug = ? AND is_active = 1", (slug,)).fetchone()
    if product is None:
        return jsonify({"error": "Product not found"}), 404
    rows = db.execute(
        """SELECT r.rating, r.body, r.created_at, r.customer_id, cu.name AS customer_name
           FROM reviews r JOIN customers cu ON r.customer_id = cu.id
           WHERE r.product_id = ? ORDER BY r.created_at DESC""",
        (product["id"],),
    ).fetchall()
    return jsonify(
        {
            "reviews": [
                {
                    # First name + last initial, e.g. "Ama O."
                    "customer_name": _display_name(r["customer_name"]),
                    "is_mine": r["customer_id"] == session.get("customer_id"),
                    "rating": r["rating"],
                    "body": r["body"],
                    "created_at": r["created_at"],
                }
                for r in rows
            ],
        }
    )


def _display_name(full_name):
    parts = (full_name or "").split()
    if not parts:
        return "Customer"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


@api_catalog_bp.route("/products/<slug>/reviews", methods=["POST"])
def create_review(slug):
    customer_id = session.get("customer_id")
    if not customer_id:
        return jsonify({"error": "Log in to write a review"}), 401

    data = request.get_json(force=True, silent=True) or {}
    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        return jsonify({"error": "Rating must be a number from 1 to 5"}), 400
    if not 1 <= rating <= 5:
        return jsonify({"error": "Rating must be from 1 to 5"}), 400
    body = (data.get("body") or "").strip()
    if len(body) > 2000:
        return jsonify({"error": "Review is too long (2000 characters max)"}), 400

    db = get_db()
    product = db.execute("SELECT id FROM products WHERE slug = ? AND is_active = 1", (slug,)).fetchone()
    if product is None:
        return jsonify({"error": "Product not found"}), 404

    # One review per customer per product; writing again replaces the old one.
    db.execute(
        """INSERT INTO reviews (product_id, customer_id, rating, body) VALUES (?, ?, ?, ?)
           ON CONFLICT(product_id, customer_id)
           DO UPDATE SET rating = excluded.rating, body = excluded.body, updated_at = datetime('now')""",
        (product["id"], customer_id, rating, body),
    )
    db.commit()
    return jsonify({"ok": True}), 201
