from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openrouter_api_key: str
    api_base: str = "https://llm-proxy.int.tractian.com"
    # Análise jurídica é o nó de maior exigência de precisão do pipeline —
    # o modelo é configurável (env LEGAL_MODEL) para permitir subir de tier
    # sem tocar código.
    legal_model: str = "openai/claude-sonnet-4.6"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


def get_settings() -> Settings:
    return Settings()
