import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from .config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"


def hash_password(password: str, iterations: int = 390000, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt_hex, hash_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest):
    s = get_settings()
    if body.email.strip().lower() != s.admin_email.lower() or not verify_password(
        body.password, s.admin_password_hash
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciais invalidas")
    expire = datetime.now(timezone.utc) + timedelta(minutes=s.jwt_expire_minutes)
    token = jwt.encode({"sub": body.email, "exp": expire}, s.jwt_secret, algorithm=ALGORITHM)
    return LoginResponse(access_token=token, email=body.email)


def require_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token ausente")
    try:
        payload = jwt.decode(creds.credentials, get_settings().jwt_secret, algorithms=[ALGORITHM])
        return payload["sub"]
    except (JWTError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token invalido ou expirado")
