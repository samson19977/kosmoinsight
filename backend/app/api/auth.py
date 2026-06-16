"""
Auth API — register, login, me, user management.
v2: last_login tracking, admin user list, user update/deactivate.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Optional
from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserOut, Token, UserUpdate
from app.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_admin, log_action,
)

router = APIRouter()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)) -> User:
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        name=user_in.name,
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        role=user_in.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    user: Optional[User] = db.query(User).filter(User.email == form_data.username).first()
    if user is None or not verify_password(form_data.password, str(user.hashed_password)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not bool(user.is_active):
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact admin.")

    # Track last login
    user.last_login = datetime.now(timezone.utc)  # type: ignore[assignment]
    log_action(
        db, int(user.id), "login", "User", int(user.id),  # type: ignore[arg-type]
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    token = create_access_token({"sub": str(user.email), "role": str(user.role)})
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


# ─── Admin: manage users ──────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list:
    """Admin only — list all system users."""
    return db.query(User).order_by(User.created_at.desc()).all()  # type: ignore[return-value]


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> User:
    """Admin only — update role or activate/deactivate a user."""
    user: Optional[User] = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    log_action(
        db, int(current_user.id), "update_user", "User", user_id,  # type: ignore[arg-type]
        detail=data.model_dump(exclude_none=True),
    )
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> None:
    """Admin only — permanently delete a user."""
    user: Optional[User] = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if int(user.id) == int(current_user.id):  # type: ignore[arg-type]
        raise HTTPException(status_code=400, detail="Cannot delete yourself.")
    db.delete(user)
    log_action(db, int(current_user.id), "delete_user", "User", user_id)  # type: ignore[arg-type]
    db.commit()
