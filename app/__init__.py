import os

from flask import Flask

from .config import Config
from . import db as db_module


def create_app():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    app = Flask(
        __name__,
        template_folder=os.path.join(base_dir, "templates"),
        static_folder=os.path.join(base_dir, "static"),
        static_url_path="/static",
    )
    app.config.from_object(Config)

    db_module.init_app(app)

    from .blueprints.pages import pages_bp
    from .blueprints.api_catalog import api_catalog_bp
    from .blueprints.api_shipping import api_shipping_bp
    from .blueprints.api_orders import api_orders_bp
    from .blueprints.api_payments import api_payments_bp
    from .blueprints.api_admin import api_admin_bp
    from .blueprints.api_customers import api_customers_bp

    app.register_blueprint(pages_bp)
    app.register_blueprint(api_catalog_bp, url_prefix="/api")
    app.register_blueprint(api_shipping_bp, url_prefix="/api")
    app.register_blueprint(api_orders_bp, url_prefix="/api")
    app.register_blueprint(api_payments_bp, url_prefix="/api")
    app.register_blueprint(api_admin_bp, url_prefix="/api/admin")
    app.register_blueprint(api_customers_bp, url_prefix="/api/customers")

    return app
