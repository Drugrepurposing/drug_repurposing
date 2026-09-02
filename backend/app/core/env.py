"""
Load configuration from a local .env file.

Why this exists: setting DATABASE_URL by hand in every new terminal is a
reliable source of confusion. A server started in a shell that happens not to
have it silently runs without persistence, and the symptom - signup appearing
to hang, history coming back empty - looks nothing like the cause.

The rules are deliberate:

- A REAL environment variable always wins over the file. In production the
  platform sets DATABASE_URL in the process environment and there is no .env
  file at all, so this function does nothing there. It cannot override a
  deployment.
- The file is never committed. `.gitignore` already covers `.env`, which is why
  the credential can live in it safely, and why `.env.example` exists to
  document the keys without their values.
- No third-party dependency. python-dotenv would do this, but the format we
  need is ten lines of parsing and one fewer package to install is worth more
  than the extra features.
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# backend/app/core/env.py -> backend/.env
DEFAULT_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

_loaded = False


def load_env_file(path: Path = DEFAULT_ENV_PATH) -> int:
    """
    Copy KEY=value lines from `path` into os.environ, skipping any key already
    present. Returns how many values were applied. Safe to call more than once
    and safe to call when the file does not exist.
    """
    global _loaded
    if _loaded:
        return 0
    _loaded = True

    if not path.is_file():
        return 0

    applied = 0
    try:
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()

            # Allow the value to be quoted, which matters for connection
            # strings containing characters a shell would otherwise mangle.
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]

            # An empty value means "not configured", not "configured as empty".
            # This matters: ALLOWED_ORIGINS is documented as defaulting to "*"
            # when unset, but os.getenv returns "" rather than the default once
            # the key exists - which silently produced a CORS policy allowing
            # no origins at all, and a frontend blocked from its own backend.
            # A key left blank in the file is skipped so the code's own default
            # still applies.
            if not key or not value or key in os.environ:
                continue

            os.environ[key] = value
            applied += 1
    except OSError as exc:
        logger.warning("Could not read %s: %s", path, exc)
        return 0

    if applied:
        # Never log the values - one of them is a database password.
        logger.info("Loaded %d setting(s) from %s", applied, path.name)
    return applied
