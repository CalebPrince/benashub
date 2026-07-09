"""SMTP email sending, configured from Admin > Settings (settings table).

All sends are fire-and-forget on a background thread so a slow or broken
SMTP server never blocks or fails checkout/registration. send_test_email()
is the synchronous exception, used by the admin panel to surface config errors.
"""

import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from html import escape

from .settings import get_setting

SETTING_KEYS = (
    "smtp_host",
    "smtp_port",
    "smtp_username",
    "smtp_password",
    "smtp_encryption",  # 'tls' (STARTTLS), 'ssl', or 'none'
    "mail_from_name",
    "mail_from_email",
    "admin_notify_email",
)


def load_mail_config(db):
    """Read SMTP settings into a plain dict (safe to pass to another thread).

    Returns None when email isn't configured yet.
    """
    config = {key: get_setting(db, key, "") or "" for key in SETTING_KEYS}
    if not config["smtp_host"] or not config["mail_from_email"]:
        return None
    config["smtp_port"] = int(config["smtp_port"] or 587)
    config["smtp_encryption"] = (config["smtp_encryption"] or "tls").lower()
    config["mail_from_name"] = config["mail_from_name"] or "Benas Hub"
    return config


def _deliver(config, to_email, subject, html_body, text_body):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((config["mail_from_name"], config["mail_from_email"]))
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    if config["smtp_encryption"] == "ssl":
        server = smtplib.SMTP_SSL(config["smtp_host"], config["smtp_port"], timeout=20)
    else:
        server = smtplib.SMTP(config["smtp_host"], config["smtp_port"], timeout=20)
    try:
        if config["smtp_encryption"] == "tls":
            server.starttls()
        if config["smtp_username"]:
            server.login(config["smtp_username"], config["smtp_password"])
        server.sendmail(config["mail_from_email"], [to_email], msg.as_string())
    finally:
        server.quit()


def _send_async(config, to_email, subject, html_body, text_body):
    def worker():
        try:
            _deliver(config, to_email, subject, html_body, text_body)
        except Exception as e:  # never let email failures break the request
            print(f"[mailer] failed to send '{subject}' to {to_email}: {e}")

    threading.Thread(target=worker, daemon=True).start()


def _format_money(pesewas):
    return f"GHS {pesewas / 100:,.2f}"


def _layout(title, body_html):
    return f"""\
<div style="background:#f7f6f4;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e3df;">
    <div style="background:#141414;padding:16px 24px;">
      <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:1px;">BENAS HUB</span>
      <span style="color:#e0263d;font-size:11px;display:block;letter-spacing:1px;">ORGANIC HOUSEHOLD &amp; HEALTH</span>
    </div>
    <div style="padding:24px;color:#222222;font-size:14px;line-height:1.6;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#141414;">{title}</h2>
      {body_html}
    </div>
    <div style="padding:16px 24px;border-top:3px solid #e0263d;color:#888888;font-size:12px;">
      Benas Hub &middot; Tema, Ghana &middot; +233 55 588 3070 &middot; benas4real@gmail.com
    </div>
  </div>
</div>"""


def _order_items_html(items):
    rows = "".join(
        f"""<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eeeeee;">{escape(i["product_name"])}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eeeeee;text-align:center;">{i["qty"]}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eeeeee;text-align:right;">{_format_money(i["line_total_pesewas"])}</td>
        </tr>"""
        for i in items
    )
    return f"""\
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
  <tr>
    <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #141414;">Item</th>
    <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #141414;">Qty</th>
    <th style="padding:6px 8px;text-align:right;border-bottom:2px solid #141414;">Total</th>
  </tr>
  {rows}
</table>"""


def _order_items_text(items):
    return "\n".join(
        f"  {i['product_name']} x{i['qty']} — {_format_money(i['line_total_pesewas'])}" for i in items
    )


def send_welcome_email(db, name, to_email):
    config = load_mail_config(db)
    if config is None:
        return
    first_name = name.split(" ")[0] if name else "there"
    subject = "Welcome to Benas Hub"
    html = _layout(
        f"Welcome, {escape(first_name)}!",
        """<p>Your Benas Hub account is ready. You can now check out faster, view your order
        history, and manage your details from the <strong>My Account</strong> page.</p>
        <p>Happy shopping!</p>""",
    )
    text = (
        f"Welcome, {first_name}!\n\n"
        "Your Benas Hub account is ready. You can now check out faster, view your order "
        "history, and manage your details from the My Account page.\n\nHappy shopping!"
    )
    _send_async(config, to_email, subject, html, text)


def send_order_confirmation_email(db, order, items):
    config = load_mail_config(db)
    if config is None:
        return
    subject = f"Order confirmed — {order['order_ref']}"
    totals_html = f"""\
<p style="margin:4px 0;">Subtotal: {_format_money(order["subtotal_pesewas"])}<br>
Shipping: {_format_money(order["shipping_cost_pesewas"])}<br>
<strong>Total paid: {_format_money(order["total_pesewas"])}</strong></p>"""
    html = _layout(
        "Thank you — your payment is confirmed",
        f"""<p>Hi {escape(order["customer_name"])},</p>
        <p>We've received your payment for order <strong>{order["order_ref"]}</strong>.
        We're getting it ready for delivery to:</p>
        <p style="color:#555555;">{escape(order["shipping_address"])}, {escape(order["shipping_city"])}, {escape(order["shipping_country"])}</p>
        {_order_items_html(items)}
        {totals_html}
        <p>We'll be in touch when your order ships. You can also check its status any time
        from the <strong>My Account</strong> page.</p>""",
    )
    text = (
        f"Hi {order['customer_name']},\n\n"
        f"We've received your payment for order {order['order_ref']}.\n"
        f"Delivery to: {order['shipping_address']}, {order['shipping_city']}, {order['shipping_country']}\n\n"
        f"{_order_items_text(items)}\n\n"
        f"Subtotal: {_format_money(order['subtotal_pesewas'])}\n"
        f"Shipping: {_format_money(order['shipping_cost_pesewas'])}\n"
        f"Total paid: {_format_money(order['total_pesewas'])}\n\n"
        "We'll be in touch when your order ships."
    )
    _send_async(config, order["customer_email"], subject, html, text)


def send_admin_new_order_email(db, order, items):
    config = load_mail_config(db)
    if config is None or not config["admin_notify_email"]:
        return
    subject = f"New paid order — {order['order_ref']} ({_format_money(order['total_pesewas'])})"
    html = _layout(
        "New paid order",
        f"""<p><strong>{order["order_ref"]}</strong> — {_format_money(order["total_pesewas"])}</p>
        <p>{escape(order["customer_name"])} &middot; {escape(order["customer_email"])} &middot; {escape(order["customer_phone"] or "")}<br>
        {escape(order["shipping_address"])}, {escape(order["shipping_city"])}, {escape(order["shipping_country"])}</p>
        {_order_items_html(items)}
        <p>Open the admin panel &gt; Orders to process it.</p>""",
    )
    text = (
        f"New paid order {order['order_ref']} — {_format_money(order['total_pesewas'])}\n"
        f"{order['customer_name']} · {order['customer_email']} · {order['customer_phone']}\n"
        f"{order['shipping_address']}, {order['shipping_city']}, {order['shipping_country']}\n\n"
        f"{_order_items_text(items)}\n\nOpen the admin panel > Orders to process it."
    )
    _send_async(config, config["admin_notify_email"], subject, html, text)


def send_test_email(db, to_email):
    """Synchronous send used by the admin Settings test button; raises on failure."""
    config = load_mail_config(db)
    if config is None:
        raise RuntimeError("Email is not configured yet — set the SMTP host and from address first")
    html = _layout(
        "Test email",
        "<p>Your Benas Hub email settings are working. Order confirmations, "
        "welcome emails, and admin notifications will be sent from this address.</p>",
    )
    text = (
        "Your Benas Hub email settings are working. Order confirmations, "
        "welcome emails, and admin notifications will be sent from this address."
    )
    _deliver(config, to_email, "Benas Hub — test email", html, text)
