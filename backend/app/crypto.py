"""Encryption at rest for external data-source credentials (Fernet / AES-128-CBC + HMAC)."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings


def _fernet() -> Fernet:
    key = get_settings().secret_encryption_key
    if not key:
        raise RuntimeError("SECRET_ENCRYPTION_KEY is not configured")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest()))


def encrypt(plaintext: str) -> bytes:
    return _fernet().encrypt(plaintext.encode())


def decrypt(ciphertext: bytes | None) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet().decrypt(bytes(ciphertext)).decode()
    except InvalidToken as e:
        raise RuntimeError("Cannot decrypt data-source password: SECRET_ENCRYPTION_KEY changed?") from e
