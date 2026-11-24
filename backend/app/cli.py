"""Operational commands.

  python -m app.cli migrate      alembic upgrade head
  python -m app.cli bootstrap    create the first admin (+ demo content if SEED_DEMO)
  python -m app.cli init         migrate + bootstrap (the Helm migration Job runs this)
"""
import logging
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import func, select

from .config import get_settings
from .db import SessionLocal
from .models import User
from .security import hash_password

log = logging.getLogger("open-metrics")
ROOT = Path(__file__).resolve().parent.parent


def migrate() -> None:
    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")


def bootstrap() -> None:
    s = get_settings()
    with SessionLocal() as db:
        if not db.scalar(select(func.count()).select_from(User)):
            if not s.admin_password:
                sys.exit("ADMIN_PASSWORD must be set to create the first administrator")
            db.add(User(username=s.admin_username, display_name="Administrator",
                        password_hash=hash_password(s.admin_password), role="admin"))
            db.commit()
            print(f"created administrator {s.admin_username!r}")
        if s.seed_demo:
            from .seed import seed_demo

            print("demo content seeded" if seed_demo(db) else "boards exist; demo seed skipped")


def main(argv: list[str]) -> None:
    logging.basicConfig(level=logging.INFO)
    cmd = argv[1] if len(argv) > 1 else "init"
    if cmd in ("migrate", "init"):
        migrate()
        print("migrations applied")
    if cmd in ("bootstrap", "init"):
        bootstrap()
    if cmd not in ("migrate", "bootstrap", "init"):
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
