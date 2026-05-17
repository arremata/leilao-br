from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openrouter_api_key: str
    tavily_api_key: str
    api_base: str = "https://llm-proxy.int.tractian.com"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


def get_settings() -> Settings:
    return Settings()