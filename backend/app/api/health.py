from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import HealthSession, Attendance
from app.schemas import HealthSessionCreate, HealthSessionOut
from app.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[HealthSessionOut])
def list_sessions(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(HealthSession).order_by(HealthSession.created_at.desc()).all()


@router.post("/", response_model=HealthSessionOut, status_code=201)
def create_session(
    data: HealthSessionCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> HealthSession:
    session = HealthSession(**data.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> None:
    session: Optional[HealthSession] = db.query(HealthSession).filter(
        HealthSession.id == session_id
    ).first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    db.query(Attendance).filter(Attendance.session_id == session_id).delete()
    db.delete(session)
    db.commit()


@router.get("/{session_id}/attendance")
def get_attendance(
    session_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> dict:
    session: Optional[HealthSession] = db.query(HealthSession).filter(
        HealthSession.id == session_id
    ).first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    attendees = db.query(Attendance).filter(Attendance.session_id == session_id).all()
    # Use bool() to avoid SQLAlchemy Column[bool] type checker warning
    actual = sum(1 for a in attendees if bool(a.attended))
    expected = int(session.expected_attendance or 1)
    return {
        "session": HealthSessionOut.model_validate(session),
        "expected": expected,
        "actual_attendance": actual,
        "attendance_rate": round((actual / max(expected, 1)) * 100, 1),
        "attendees": attendees,
    }


@router.post("/{session_id}/attendance", status_code=201)
def record_attendance(
    session_id: int,
    attendee_name: str,
    attended: bool = True,
    feedback_score: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> dict:
    record = Attendance(
        session_id=session_id,
        attendee_name=attendee_name,
        attended=attended,
        feedback_score=feedback_score,
    )
    db.add(record)
    db.commit()
    return {"message": "Attendance recorded"}
