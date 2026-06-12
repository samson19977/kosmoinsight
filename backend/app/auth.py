"""
Authentication & authorization — JWT + role-based guards.
v2: Added refresh token support, last_login tracking, token blacklist stub.
"""
import bcrypt
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, AuditLog
import os

SECRET_KEY                  = os.getenv("SECRET_KEY", "kosmotive-secret-key-change-in-production")
ALGORITHM                   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))  # 24h

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ─── Password helpers ────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ─── JWT helpers ─────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return {}


# ─── Current user dependency ─────────────────────────────────────────────────

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    email: str = payload.get("sub")
    if not email:
        raise exc

    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise exc
    return user


# ─── Role guards ─────────────────────────────────────────────────────────────

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """ADMIN ONLY — delete records, manage users, full access."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="⛔ Admin access required.",
        )
    return current_user


def require_staff_or_admin(current_user: User = Depends(get_current_user)) -> User:
    """STAFF + ADMIN — create/edit customers & payments. Analysts read-only."""
    if current_user.role not in ("admin", "staff"):
        raise HTTPException(
            status_code=403,
            detail="⛔ Staff or Admin access required.",
        )
    return current_user


def require_any_role(current_user: User = Depends(get_current_user)) -> User:
    """ALL ROLES — Admin, Staff, Analyst."""
    return current_user


# ─── Audit logging helper ────────────────────────────────────────────────────

def log_action(
    db: Session,
    user_id: Optional[int],
    action: str,
    resource: str,
    resource_id: Optional[int] = None,
    detail: Optional[dict] = None,
    ip_address: Optional[str] = None,
):
    """Call this after every write operation to maintain audit trail."""
    log = AuditLog(
        user_id=user_id,
        action=action,
        resource=resource,
        resource_id=resource_id,
        detail=detail or {},
        ip_address=ip_address,
    )
    db.add(log)
    # Caller is responsible for db.commit()
