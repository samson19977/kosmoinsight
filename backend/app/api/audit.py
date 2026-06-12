"""
Audit Log API — admin-only access to the full audit trail.
New in v2.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import AuditLog
from app.schemas import AuditLogOut
from app.auth import require_admin

router = APIRouter()


@router.get("/", response_model=List[AuditLogOut])
def list_audit_logs(
    user_id:    Optional[int] = Query(None),
    resource:   Optional[str] = Query(None),
    action:     Optional[str] = Query(None),
    skip:       int           = Query(default=0, ge=0),
    limit:      int           = Query(default=100, ge=1, le=500),
    db:         Session       = Depends(get_db),
    _=Depends(require_admin),
):
    """Admin only — full system audit trail."""
    q = db.query(AuditLog)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if resource:
        q = q.filter(AuditLog.resource == resource)
    if action:
        q = q.filter(AuditLog.action == action)
    return q.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
