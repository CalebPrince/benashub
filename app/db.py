import os
import sqlite3

from flask import current_app, g


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DB_PATH"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(app):
    db_path = app.config["DB_PATH"]
    is_new = not os.path.exists(db_path)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    if is_new:
        schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
        with open(schema_path, "r", encoding="utf-8") as f:
            conn.executescript(f.read())
        conn.commit()

        from . import seed

        seed.seed(conn, app.config)
        conn.commit()
    else:
        # Idempotent migrations for databases created before these tables/columns existed.
        conn.execute(
            """CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                phone TEXT,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                body TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE (product_id, customer_id)
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS discount_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
                value INTEGER NOT NULL,
                min_subtotal_pesewas INTEGER NOT NULL DEFAULT 0,
                max_uses INTEGER,
                used_count INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                expires_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS customer_wishlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE (customer_id, product_id)
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS password_resets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                used_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )"""
        )
        existing_columns = {row["name"] for row in conn.execute("PRAGMA table_info(orders)")}
        if "customer_id" not in existing_columns:
            conn.execute("ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id)")
        if "discount_code_id" not in existing_columns:
            conn.execute("ALTER TABLE orders ADD COLUMN discount_code_id INTEGER REFERENCES discount_codes(id)")
        if "discount_code" not in existing_columns:
            conn.execute("ALTER TABLE orders ADD COLUMN discount_code TEXT")
        if "discount_amount_pesewas" not in existing_columns:
            conn.execute("ALTER TABLE orders ADD COLUMN discount_amount_pesewas INTEGER NOT NULL DEFAULT 0")
        product_columns = {row["name"] for row in conn.execute("PRAGMA table_info(products)")}
        if "extended_description" not in product_columns:
            conn.execute("ALTER TABLE products ADD COLUMN extended_description TEXT")
        if "usage_instructions" not in product_columns:
            conn.execute("ALTER TABLE products ADD COLUMN usage_instructions TEXT")
        if "delivery_notes" not in product_columns:
            conn.execute("ALTER TABLE products ADD COLUMN delivery_notes TEXT")
        if "badges" not in product_columns:
            conn.execute("ALTER TABLE products ADD COLUMN badges TEXT")
        if "gallery_images" not in product_columns:
            conn.execute("ALTER TABLE products ADD COLUMN gallery_images TEXT")
        if "bundle_product_ids" not in product_columns:
            conn.execute("ALTER TABLE products ADD COLUMN bundle_product_ids TEXT")
        if "meta_title" not in product_columns:
            conn.execute("ALTER TABLE products ADD COLUMN meta_title TEXT")
        if "meta_description" not in product_columns:
            conn.execute("ALTER TABLE products ADD COLUMN meta_description TEXT")
        review_columns = {row["name"] for row in conn.execute("PRAGMA table_info(reviews)")}
        if "is_approved" not in review_columns:
            conn.execute("ALTER TABLE reviews ADD COLUMN is_approved INTEGER NOT NULL DEFAULT 1")
        if "is_featured" not in review_columns:
            conn.execute("ALTER TABLE reviews ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0")
        if "admin_reply" not in review_columns:
            conn.execute("ALTER TABLE reviews ADD COLUMN admin_reply TEXT")
        conn.commit()

    conn.close()


def init_app(app):
    app.teardown_appcontext(close_db)
    init_db(app)
