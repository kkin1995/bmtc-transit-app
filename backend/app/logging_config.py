"""Structured JSON logging configuration (OPS-04)."""

import json
import logging
from datetime import datetime, timezone

# Attributes present on every LogRecord by default — anything NOT in this
# set that appears on a record's __dict__ came from `extra=` and should be
# included in the JSON payload.
_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()) | {
    "message",
    "asctime",
}


class JsonFormatter(logging.Formatter):
    """Formats a LogRecord as a single-line JSON object.

    Merges in any `extra=` fields passed to the logging call. Never raises —
    non-JSON-serializable extra values are coerced to their str() repr via
    json.dumps(default=str).
    """

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED:
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    """Configure the root logger with a single JSON-formatted StreamHandler.

    Must be called once at import time, before the app handles any request —
    without this, the root logger has NO handlers and defaults to WARNING,
    so every logger.info() call in this codebase silently emits nothing.

    Idempotent: calling this more than once still leaves exactly one handler.
    """
    root = logging.getLogger()
    root.setLevel(level)
    handler = logging.StreamHandler()  # journald captures stdout/stderr of the systemd unit
    handler.setFormatter(JsonFormatter())
    root.handlers.clear()
    root.addHandler(handler)
