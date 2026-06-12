"""
Notifications API — view, create, and manage notification queue.
New in v2.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Notification
from app.schemas import NotificationCreate, NotificationOut
from app.auth import get_current_user, require_staff_or_admin

router = APIRouter()


@router.get("/", response_model=List[NotificationOut])
def list_notifications(
    customer_id: Optional[int] = Query(None),
    channel:     Optional[str] = Query(None),
    status:      Optional[str] = Query(None),
    skip:        int           = Query(default=0, ge=0),
    limit:       int           = Query(default=50, ge=1, le=200),
    db:          Session       = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(Notification)
    if customer_id:
        q = q.filter(Notification.customer_id == customer_id)
    if channel:
        q = q.filter(Notification.channel == channel)
    if status:
        q = q.filter(Notification.status == status)
    return q.order_by(Notification.created_at.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=NotificationOut, status_code=201)
def create_notification(
    data:        NotificationCreate,
    db:          Session = Depends(get_db),
    current_user=Depends(require_staff_or_admin),
):
    """Manually queue a notification (SMS / email / in-app)."""
    n = Notification(**data.model_dump(), created_by_id=current_user.id)
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Count of pending in-app notifications — for frontend badge."""
    count = db.query(Notification).filter(
        Notification.channel == "in_app",
        Notification.status == "pending",
    ).count()
    return {"unread": count}
