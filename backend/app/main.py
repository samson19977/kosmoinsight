from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.api import auth, customers, payments, products, health, analytics, predictions, uploads, reports

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="KosmoInsight AI API",
    description="Smart Health & PayGo Analytics Platform for Kosmotive",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, set to your Vercel URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(customers.router, prefix="/api/customers", tags=["Customers"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(products.router, prefix="/api/products", tags=["Products"])
app.include_router(health.router, prefix="/api/health-sessions", tags=["Health"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(predictions.router, prefix="/api/predict", tags=["AI Predictions"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["Data Upload"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])


@app.get("/")
def root():
    return {"message": "KosmoInsight AI API is running", "docs": "/docs"}


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
