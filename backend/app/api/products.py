from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Product, Distribution
from app.schemas import ProductCreate, ProductOut, DistributionCreate, DistributionOut
from app.auth import get_current_user

router = APIRouter()

@router.get("/", response_model=List[ProductOut])
def list_products(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Product).all()

@router.post("/", response_model=ProductOut, status_code=201)
def create_product(data: ProductCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    product = Product(**data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

@router.get("/distributions", response_model=List[DistributionOut])
def list_distributions(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Distribution).all()

@router.post("/distributions", response_model=DistributionOut, status_code=201)
def create_distribution(data: DistributionCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    dist = Distribution(**data.model_dump())
    db.add(dist)
    # Decrease stock
    if data.product_id:
        product = db.query(Product).filter(Product.id == data.product_id).first()
        if product:
            product.stock_quantity = max(0, product.stock_quantity - data.quantity)
    db.commit()
    db.refresh(dist)
    return dist
