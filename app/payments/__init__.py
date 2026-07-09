from flask import current_app


class PaymentGateway:
    """Interface every payment gateway module must implement."""

    def initialize(self, order, callback_url):
        """Start a payment for an order. Returns {authorization_url, reference}."""
        raise NotImplementedError

    def verify(self, reference):
        """Check a payment's status with the provider. Returns {status, amount_pesewas, raw}."""
        raise NotImplementedError


def get_gateway():
    name = current_app.config.get("PAYMENT_GATEWAY", "paystack")
    if name == "paystack":
        from .paystack import PaystackGateway

        return PaystackGateway()
    raise ValueError(f"Unknown payment gateway: {name}")
