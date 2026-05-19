"""
Customers API — Role rules:
  GET list/view  → Admin, Staff, Analyst (everyone)
  POST create    → Admin, Staff only
  PATCH update   → Admin, Staff only
  DELETE         → Admin ONLY
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from app.database import get_db
from app.models import Customer, Payment
from app.schemas import CustomerCreate, CustomerUpdate, CustomerOut
from app.auth import get_current_user, require_staff_or_admin, require_admin

router = APIRouter()


@router.get("/", response_model=List[CustomerOut])
def list_customers(
    search: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),  # ALL roles can view
):
    q = db.query(Customer)
    if search:
        q = q.filter(or_(
            Customer.name.ilike(f"%{search}%"),
            Customer.phone.ilike(f"%{search}%"),
            Customer.location.ilike(f"%{search}%"),
        ))
    if region:
        q = q.filter(Customer.region == region)
    if status:
        q = q.filter(Customer.status == status)
    if risk_level:
        q = q.filter(Customer.risk_level == risk_level)
    return q.offset(skip).limit(limit).all()


@router.post("/", response_model=CustomerOut, status_code=201)
def create_customer(
    data: CustomerCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_staff_or_admin),  # Staff + Admin only
):
    customer = Customer(**data.model_dump(), created_by=current_user.id)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),  # ALL roles
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_staff_or_admin),  # Staff + Admin only
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=204)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),  # ADMIN ONLY
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(customer)
    db.commit()


@router.get("/{customer_id}/payments")
def get_customer_payments(
    customer_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    payments = db.query(Payment).filter(Payment.customer_id == customer_id).all()
    return {
        "customer": CustomerOut.model_validate(customer),
        "payments": payments,
        "total_paid": sum(p.amount_paid for p in payments),
        "total_due": sum(p.amount_due for p in payments),
        "missed_count": sum(1 for p in payments if p.status == "missed"),
    }
