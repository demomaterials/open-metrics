"""Password hashing (Argon2id) and opaque server-side session tokens."""
import hashlib
import secrets
import threading
import time
from collections import defaultdict

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()
# Hash used to equalise timing when the username does not exist.
_DUMMY_HASH = _hasher.hash("timing-equaliser")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def new_session_token() -> tuple[str, str]:
    """Returns (token for the cookie, sha256 stored in the database)."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def validate_password_strength(password: str) -> None:
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters")


class LoginThrottle:
    """In-process brute-force guard: N failures per key within a window locks the key."""

    def __init__(self, max_failures: int = 8, window_s: int = 300):
        self.max_failures = max_failures
        self.window_s = window_s
        self._fail: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> list[float]:
        recent = [t for t in self._fail[key] if now - t < self.window_s]
        self._fail[key] = recent
        return recent

    def blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._prune(key, time.monotonic())) >= self.max_failures

    def failure(self, key: str) -> None:
        with self._lock:
            self._fail[key].append(time.monotonic())

    def success(self, key: str) -> None:
        with self._lock:
            self._fail.pop(key, None)


login_throttle = LoginThrottle()
