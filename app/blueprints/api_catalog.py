from flask import Blueprint, jsonify, request

from ..db import get_db

api_catalog_bp = Blueprint("api_catalog", __name__)


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

    sql = "SELECT p.* FROM products p JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1"
    params = []
    if category:
        sql += " AND c.slug = ?"
        params.append(category)
    if q:
        sql += " AND p.name LIKE ?"
        params.append(f"%{q}%")
    sql += " ORDER BY p.created_at DESC"

    rows = db.execute(sql, params).fetchall()
    return jsonify([product_to_dict(r) for r in rows])


@api_catalog_bp.route("/products/<slug>")
def get_product(slug):
    db = get_db()
    row = db.execute("SELECT * FROM products WHERE slug = ? AND is_active = 1", (slug,)).fetchone()
    if row is None:
        return jsonify({"error": "Product not found"}), 404
    return jsonify(product_to_dict(row))
