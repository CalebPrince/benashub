import requests

from . import PaymentGateway
from ..db import get_db
from ..settings import get_setting

PAYSTACK_BASE_URL = "https://api.paystack.co"


class PaystackNotConfigured(Exception):
    pass


class PaystackError(Exception):
    pass


class PaystackGateway(PaymentGateway):
    def _secret_key(self):
        key = get_setting(get_db(), "paystack_secret_key")
        if not key:
            raise PaystackNotConfigured(
                "Payment is not configured yet. Add your Paystack secret key in Admin > Settings."
            )
        return key

    def initialize(self, order, callback_url):
        key = self._secret_key()
        resp = requests.post(
            f"{PAYSTACK_BASE_URL}/transaction/initialize",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "email": order["customer_email"],
                "amount": order["total_pesewas"],
                "currency": "GHS",
                "callback_url": callback_url,
                "reference": order["order_ref"],
                "metadata": {"order_ref": order["order_ref"]},
            },
            timeout=15,
        )
        data = resp.json()
        if not resp.ok or not data.get("status"):
            raise PaystackError(data.get("message", "Failed to initialize payment"))
        return {
            "authorization_url": data["data"]["authorization_url"],
            "reference": data["data"]["reference"],
        }

    def verify(self, reference):
        key = self._secret_key()
        resp = requests.get(
            f"{PAYSTACK_BASE_URL}/transaction/verify/{reference}",
            headers={"Authorization": f"Bearer {key}"},
            timeout=15,
        )
        data = resp.json()
        if not resp.ok or not data.get("status"):
            raise PaystackError(data.get("message", "Failed to verify payment"))
        tx = data["data"]
        return {
            "status": "success" if tx.get("status") == "success" else "failed",
            "amount_pesewas": tx.get("amount"),
            "raw": tx,
        }
