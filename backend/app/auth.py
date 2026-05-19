from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
import os

SECRET_KEY = os.getenv("SECRET_KEY", "kosmotive-secret-key-change-in-production-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise exc
    except JWTError:
        raise exc
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise exc
    return user

# ─── Role Guards ─────────────────────────────────────────────────────────────

def require_admin(current_user: User = Depends(get_current_user)):
    """ADMIN ONLY — delete records, manage users, full access."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="⛔ Admin access required. Only Admin can perform this action."
        )
    return current_user

def require_staff_or_admin(current_user: User = Depends(get_current_user)):
    """STAFF + ADMIN — add customers, record payments. Analyst blocked."""
    if current_user.role not in ("admin", "staff"):
        raise HTTPException(
            status_code=403,
            detail="⛔ Staff or Admin access required. Analysts can only view data."
        )
    return current_user

def require_any_role(current_user: User = Depends(get_current_user)):
    """ALL ROLES — Admin, Staff, Analyst can all view."""
    return current_user
