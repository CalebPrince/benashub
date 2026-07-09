import os
import secrets

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_or_create_secret_key():
    """Prefer the SECRET_KEY env var; otherwise persist a generated key to a
    gitignored file so sessions survive server restarts (the dev server
    restarts on every code change, which would otherwise log everyone out)."""
    key = os.environ.get("SECRET_KEY")
    if key:
        return key
    key_path = os.path.join(BASE_DIR, ".secret_key")
    try:
        with open(key_path, "r", encoding="utf-8") as f:
            key = f.read().strip()
        if key:
            return key
    except OSError:
        pass
    key = secrets.token_hex(32)
    with open(key_path, "w", encoding="utf-8") as f:
        f.write(key)
    return key


class Config:
    SECRET_KEY = _load_or_create_secret_key()
    DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "benashub.db"))

    ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")  # if unset, seed.py generates + prints one

    PAYMENT_GATEWAY = os.environ.get("PAYMENT_GATEWAY", "paystack")
    # Payment provider API keys are NOT stored here — the admin sets them from
    # Admin > Settings in the dashboard, and they're kept in the settings table.

    UPLOAD_DIR = os.path.join(BASE_DIR, "static", "img", "products")
    ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB

    SITE_NAME = "Benas Hub"
    CURRENCY = "GHS"
