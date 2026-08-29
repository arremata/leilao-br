from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openrouter_api_key: str
    api_base: str = "https://llm-proxy.int.tractian.com"

    # The shared backend .env also contains database/worker settings that do
    # not belong to the LLM configuration model.
    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


def get_settings() -> Settings:
    return Settings()
