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


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    data: "ProductUpdate",
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    from app.schemas import ProductUpdate
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()


@router.get("/low-stock")
def low_stock_alert(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Return all products at or below their low_stock_alert threshold."""
    products = db.query(Product).filter(
        Product.stock_quantity <= Product.low_stock_alert,
        Product.is_active == True,
    ).all()
    return products
