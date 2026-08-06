import os
from unittest.mock import patch

from config import Settings


def test_settings_loads_from_env():
    env = {
        "OPENROUTER_API_KEY": "test-openrouter",
    }
    with patch.dict(os.environ, env, clear=True):
        settings = Settings()
        assert settings.openrouter_api_key == "test-openrouter"
