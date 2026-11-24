import logging
import sys
from logging.handlers import RotatingFileHandler

from app.core.config import settings


def setup_logging():
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(level)
    root.addHandler(handler)

    # Structured JSON-like for sensitive actions
    audit_logger = logging.getLogger("aicms.audit")
    audit_logger.setLevel(level)
    audit_logger.addHandler(handler)
    audit_logger.propagate = False

    return root


log = setup_logging()
