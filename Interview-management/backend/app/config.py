from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_", case_sensitive=False)
    app_name: str = "interview-management"
    env: str = "dev"
    aws_region: str = "ap-south-1"
    table_name: str = "interview-management-dev"
    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""
    cors_origin: str = "http://localhost:5173"
    demo_mode: bool = False
    default_timezone: str = "Asia/Kolkata"
    reservation_slot_minutes: int = 15
    reservation_buffer_minutes: int = 15


settings = Settings()

