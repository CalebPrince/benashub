from functools import wraps

from flask import jsonify, session


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("admin_id"):
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)

    return wrapper
