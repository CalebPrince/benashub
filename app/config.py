import os
import secrets

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
    DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "benashub.db"))

    ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")  # if unset, seed.py generates + prints one

    PAYMENT_GATEWAY = os.environ.get("PAYMENT_GATEWAY", "paystack")
    PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY")

    UPLOAD_DIR = os.path.join(BASE_DIR, "static", "img", "products")
    ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB

    SITE_NAME = "Benas Hub"
    CURRENCY = "GHS"
