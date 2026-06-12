"""
Payment Provider Abstraction Layer
===================================
All mobile money / bank integrations plug in here.
Currently returns a "simulated" response so the system runs without any real API keys.

HOW TO ADD A REAL PROVIDER (e.g. MTN MoMo):
1. Create a new class inheriting from BasePaymentProvider
2. Implement initiate_payment() and verify_payment()
3. Register it in PROVIDERS dict at the bottom
4. Set ACTIVE_PROVIDER=mtn_momo in .env

The rest of the codebase never changes — only this file.
"""
from abc import ABC, abstractmethod
from typing import Optional
import os
import logging

logger = logging.getLogger(__name__)


class BasePaymentProvider(ABC):
    """Interface every payment provider must implement."""

    @abstractmethod
    async def initiate_payment(self, phone: str, amount: float, reference: str) -> dict:
        """
        Kick off a payment request.
        Returns: {"status": "pending"|"success"|"failed", "transaction_ref": str, "message": str}
        """
        ...

    @abstractmethod
    async def verify_payment(self, transaction_ref: str) -> dict:
        """
        Poll the provider to confirm payment was received.
        Returns: {"status": "confirmed"|"pending"|"failed", "amount": float}
        """
        ...


class SimulatedProvider(BasePaymentProvider):
    """
    Placeholder — always succeeds locally.
    Replace with a real class once MTN / Airtel APIs are contracted.
    """
    PROVIDER_NAME = "simulated"

    async def initiate_payment(self, phone: str, amount: float, reference: str) -> dict:
        logger.info(f"[SIM] Initiating payment: {phone} / {amount} RWF / ref={reference}")
        return {
            "status": "pending",
            "transaction_ref": f"SIM-{reference}",
            "message": "Payment simulated. Integrate real provider to go live.",
            "provider": self.PROVIDER_NAME,
        }

    async def verify_payment(self, transaction_ref: str) -> dict:
        logger.info(f"[SIM] Verifying: {transaction_ref}")
        return {
            "status": "confirmed",
            "transaction_ref": transaction_ref,
            "amount": 0.0,
            "provider": self.PROVIDER_NAME,
        }


class MTNMoMoProvider(BasePaymentProvider):
    """
    MTN Mobile Money — stub ready for real credentials.
    Docs: https://momodeveloper.mtn.com/
    Set env vars: MTN_SUBSCRIPTION_KEY, MTN_API_USER, MTN_API_KEY, MTN_ENVIRONMENT
    """
    PROVIDER_NAME = "mtn_momo"

    def __init__(self):
        self.subscription_key = os.getenv("MTN_SUBSCRIPTION_KEY")
        self.api_user         = os.getenv("MTN_API_USER")
        self.api_key          = os.getenv("MTN_API_KEY")
        self.environment      = os.getenv("MTN_ENVIRONMENT", "sandbox")
        self.base_url         = (
            "https://sandbox.momodeveloper.mtn.com"
            if self.environment == "sandbox"
            else "https://proxy.momoapi.mtn.com"
        )

    async def initiate_payment(self, phone: str, amount: float, reference: str) -> dict:
        # TODO: Implement once credentials are available
        # POST {base_url}/collection/v1_0/requesttopay
        raise NotImplementedError("MTN MoMo integration pending credentials.")

    async def verify_payment(self, transaction_ref: str) -> dict:
        # TODO: GET {base_url}/collection/v1_0/requesttopay/{transaction_ref}
        raise NotImplementedError("MTN MoMo integration pending credentials.")


class AirtelMoneyProvider(BasePaymentProvider):
    """
    Airtel Money — stub ready for real credentials.
    Docs: https://developers.airtel.africa/
    Set env vars: AIRTEL_CLIENT_ID, AIRTEL_CLIENT_SECRET, AIRTEL_ENVIRONMENT
    """
    PROVIDER_NAME = "airtel_money"

    def __init__(self):
        self.client_id     = os.getenv("AIRTEL_CLIENT_ID")
        self.client_secret = os.getenv("AIRTEL_CLIENT_SECRET")
        self.environment   = os.getenv("AIRTEL_ENVIRONMENT", "sandbox")

    async def initiate_payment(self, phone: str, amount: float, reference: str) -> dict:
        raise NotImplementedError("Airtel Money integration pending credentials.")

    async def verify_payment(self, transaction_ref: str) -> dict:
        raise NotImplementedError("Airtel Money integration pending credentials.")


# ─── Provider registry ───────────────────────────────────────────────────────

PROVIDERS: dict[str, type[BasePaymentProvider]] = {
    "simulated":    SimulatedProvider,
    "mtn_momo":     MTNMoMoProvider,
    "airtel_money": AirtelMoneyProvider,
}


def get_provider(name: Optional[str] = None) -> BasePaymentProvider:
    """Return the active payment provider instance."""
    provider_name = name or os.getenv("ACTIVE_PROVIDER", "simulated")
    cls = PROVIDERS.get(provider_name)
    if cls is None:
        logger.warning(f"Unknown provider '{provider_name}', falling back to simulated.")
        cls = SimulatedProvider
    return cls()
