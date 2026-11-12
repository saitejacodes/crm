import os
from zoneinfo import ZoneInfo


class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./gym.db")
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    jwt_hours: int = int(os.getenv("JWT_HOURS", "720"))  # 30 days
    owner_phone: str = os.getenv("OWNER_PHONE", "9999999999")
    owner_password: str = os.getenv("OWNER_PASSWORD", "admin123")
    owner_name: str = os.getenv("OWNER_NAME", "Gym Owner")
    cors_origins: list[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
    ]
    tz = ZoneInfo(os.getenv("GYM_TIMEZONE", "Asia/Kolkata"))
    checkin_window_seconds: int = 60
    # used only the first time the app starts; the owner can change them in Settings
    gym_name: str = os.getenv("GYM_NAME", "SV Fitness Gym")
    gym_phone: str = os.getenv("GYM_PHONE", "9666645114")
    gym_address: str = os.getenv("GYM_ADDRESS", "Shivaji Marg, Vinayaka Hills, Vignanapuri Teachers Colony, B.N Reddy Nagar, Hyderabad 500112")
    gym_timings: str = os.getenv("GYM_TIMINGS", "Mon to Sat 5 AM to 9 PM, Sun 6 AM to 10 AM")


settings = Settings()
