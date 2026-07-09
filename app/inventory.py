from .settings import get_setting


def _threshold(db):
    try:
        return max(0, int(get_setting(db, "low_stock_threshold", "5") or 5))
    except (TypeError, ValueError):
        return 5


def _send_alert_email(db, products, threshold):
    from .mailer import send_low_stock_alert_email

    if products:
        send_low_stock_alert_email(db, products, threshold)


def check_low_stock_alerts(db, product_ids=None):
    """Resolve recovered stock and notify admins about newly low products."""
    threshold = _threshold(db)
    scope_sql = ""
    scope_params = []
    if product_ids:
        placeholders = ",".join("?" for _ in product_ids)
        scope_sql = f" AND p.id IN ({placeholders})"
        scope_params = list(product_ids)

    resolved = db.execute(
        f"""UPDATE product_low_stock_alerts
            SET resolved_at = datetime('now')
            WHERE resolved_at IS NULL
              AND product_id IN (
                SELECT p.id FROM products p
                WHERE (p.is_active = 0 OR p.stock_qty > ?){scope_sql}
              )""",
        [threshold, *scope_params],
    )

    low_rows = db.execute(
        f"""SELECT p.id, p.name, p.stock_qty
            FROM products p
            WHERE p.is_active = 1
              AND p.stock_qty <= ?
              {scope_sql}
              AND NOT EXISTS (
                SELECT 1 FROM product_low_stock_alerts a
                WHERE a.product_id = p.id AND a.resolved_at IS NULL
              )
            ORDER BY p.stock_qty, p.name""",
        [threshold, *scope_params],
    ).fetchall()

    new_alerts = []
    for row in low_rows:
        db.execute(
            """INSERT INTO product_low_stock_alerts
               (product_id, product_name, stock_qty, threshold)
               VALUES (?, ?, ?, ?)""",
            (row["id"], row["name"], row["stock_qty"], threshold),
        )
        new_alerts.append(
            {"id": row["id"], "name": row["name"], "stock_qty": row["stock_qty"]}
        )

    if new_alerts or resolved.rowcount:
        db.commit()
    if new_alerts:
        _send_alert_email(db, new_alerts, threshold)

    return new_alerts
