from functools import wraps

from flask import jsonify, session


def customer_login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("customer_id"):
            return jsonify({"error": "Please log in to continue"}), 401
        return f(*args, **kwargs)

    return wrapper
