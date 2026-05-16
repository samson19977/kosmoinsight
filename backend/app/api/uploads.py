"""
Data upload endpoint — accepts CSV/Excel files, validates columns, imports into DB.
"""

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
import pandas as pd
import io
import os
from datetime import datetime
from app.database import get_db
from app.models import Customer, Payment, UploadedFile
from app.auth import get_current_user

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Auto-clean uploaded data."""
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    df = df.dropna(how="all")
    df = df.fillna("")
    for col in df.select_dtypes(include=["object"]).columns:
        df[col] = df[col].astype(str).str.strip()
    return df


@router.post("/customers")
async def upload_customers(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Upload CSV/Excel with customer data. Required columns: name, phone"""
    if not file.filename.endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported")

    content = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {str(e)}")

    df = clean_dataframe(df)

    required = {"name", "phone"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {missing}")

    imported = 0
    errors = []
    for _, row in df.iterrows():
        try:
            customer = Customer(
                name=row.get("name", ""),
                phone=row.get("phone", ""),
                location=row.get("location") or None,
                region=row.get("region") or None,
                product_type=row.get("product_type") or row.get("product") or None,
                payment_plan=row.get("payment_plan") or "monthly",
                created_by=current_user.id,
            )
            db.add(customer)
            imported += 1
        except Exception as e:
            errors.append(str(e))

    # Save upload record
    upload_record = UploadedFile(
        filename=f"customers_{datetime.utcnow().timestamp()}.csv",
        original_name=file.filename,
        file_type="customers",
        rows_imported=imported,
        status="success" if not errors else "partial",
        error_message="; ".join(errors[:5]) if errors else None,
        uploaded_by=current_user.id,
    )
    db.add(upload_record)
    db.commit()

    return {
        "message": "Upload complete",
        "rows_imported": imported,
        "errors": len(errors),
        "preview": df.head(5).to_dict(orient="records"),
    }


@router.get("/preview")
async def preview_file(file: UploadFile = File(...), _=Depends(get_current_user)):
    """Preview first 10 rows of any CSV/Excel upload."""
    content = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    df = clean_dataframe(df)
    return {
        "columns": list(df.columns),
        "rows": len(df),
        "preview": df.head(10).to_dict(orient="records"),
    }


@router.get("/history")
def get_upload_history(db: Session = Depends(get_db), _=Depends(get_current_user)):
    records = db.query(UploadedFile).order_by(UploadedFile.created_at.desc()).limit(20).all()
    return records
