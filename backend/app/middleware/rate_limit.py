"""
Rate limiting middleware using slowapi (wraps limits library).
Applied globally in main.py — configurable via RATE_LIMIT_PER_MINUTE env var.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
import os

RATE_LIMIT = os.getenv("RATE_LIMIT_PER_MINUTE", "60")

limiter = Limiter(key_func=get_remote_address, default_limits=[f"{RATE_LIMIT}/minute"])
