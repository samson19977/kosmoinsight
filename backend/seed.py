"""
Run this once to populate the database with realistic sample data.
Usage: python seed.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine
from app.models import Base, User, Customer, Payment, Product, Distribution, HealthSession, Attendance
from app.auth import hash_password
from datetime import datetime, timedelta
import random

Base.metadata.create_all(bind=engine)
db = SessionLocal()

# ── Users ────────────────────────────────────────────────────────────────────
users = [
    User(name="Admin Kosmotive", email="admin@kosmotive.rw", hashed_password=hash_password("admin123"), role="admin"),
    User(name="Grace Uwase", email="grace@kosmotive.rw", hashed_password=hash_password("staff123"), role="staff"),
    User(name="Eric Mugabo", email="eric@kosmotive.rw", hashed_password=hash_password("analyst123"), role="analyst"),
]
for u in users:
    existing = db.query(User).filter(User.email == u.email).first()
    if not existing:
        db.add(u)
db.commit()

admin = db.query(User).filter(User.email == "admin@kosmotive.rw").first()

# ── Products ─────────────────────────────────────────────────────────────────
products_data = [
    dict(name="Menstrual Cup", category="menstrual_health", unit_price=4500, stock_quantity=120, lifespan_months=24),
    dict(name="Reusable Pads Kit", category="menstrual_health", unit_price=3200, stock_quantity=200, lifespan_months=18),
    dict(name="Maternal Health Kit", category="maternal_health", unit_price=8000, stock_quantity=80, lifespan_months=12),
    dict(name="Solar Lamp", category="solar", unit_price=15000, stock_quantity=50, lifespan_months=36),
    dict(name="Clean Cookstove", category="energy", unit_price=22000, stock_quantity=30, lifespan_months=60),
]
for pd_data in products_data:
    if not db.query(Product).filter(Product.name == pd_data["name"]).first():
        db.add(Product(**pd_data))
db.commit()

# ── Customers ────────────────────────────────────────────────────────────────
regions = ["Kigali", "Northern", "Southern", "Eastern", "Western"]
product_types = ["Menstrual Cup", "Reusable Pads Kit", "Maternal Health Kit", "Solar Lamp"]
plans = ["weekly", "monthly", "biweekly"]
names = [
    "Amina Uwimana", "Celestine Mukamana", "Diane Ingabire", "Esperance Nyiraneza",
    "Francine Umutesi", "Gisele Mukagasana", "Honorine Uwera", "Immaculee Nizeyimana",
    "Josiane Mukagatare", "Keza Akimana", "Liliane Umutoniwase", "Marie Uwantege",
    "Nathalie Uwimana", "Olive Mukamwiza", "Pascaline Niyonzima", "Reine Ineza",
    "Salome Uwineza", "Therese Mukankusi", "Umulisa Nyirahabimana", "Valentine Keza",
    "Winnie Mukagasana", "Xaviera Umubyeyi", "Yvette Ntirampeba", "Zoe Ingabire",
    "Alice Uwera", "Brigitte Mukamana", "Christine Nkurunziza", "Delphine Uwineza",
]

customers = []
for i, name in enumerate(names):
    join_date = datetime.utcnow() - timedelta(days=random.randint(30, 500))
    c = Customer(
        name=name,
        phone=f"07{random.randint(20000000, 89999999)}",
        location=f"{random.choice(regions)} District",
        region=random.choice(regions),
        product_type=random.choice(product_types),
        payment_plan=random.choice(plans),
        status=random.choice(["active", "active", "active", "completed", "suspended"]),
        join_date=join_date,
        created_by=admin.id,
    )
    db.add(c)
    customers.append(c)
db.commit()

# ── Payments ─────────────────────────────────────────────────────────────────
statuses = ["paid", "paid", "paid", "pending", "missed", "partial"]
for c in customers:
    installments = random.randint(3, 12)
    amount_due = random.choice([3200, 4500, 8000, 15000]) / installments
    for i in range(1, installments + 1):
        due = c.join_date + timedelta(days=30 * i)
        status = random.choice(statuses)
        paid = amount_due if status == "paid" else (amount_due * 0.5 if status == "partial" else 0)
        db.add(Payment(
            customer_id=c.id,
            amount_due=round(amount_due, 2),
            amount_paid=round(paid, 2),
            remaining_balance=round(amount_due - paid, 2),
            due_date=due,
            paid_date=due if status == "paid" else None,
            status=status,
            installment_number=i,
        ))
db.commit()

# ── Distributions ────────────────────────────────────────────────────────────
prods = db.query(Product).all()
agents = ["Jean Baptiste", "Alice Nkusi", "Patrick Habimana", "Sandra Uwera"]
for c in random.sample(customers, min(20, len(customers))):
    db.add(Distribution(
        customer_id=c.id,
        product_id=random.choice(prods).id,
        agent_name=random.choice(agents),
        quantity=random.randint(1, 3),
        region=c.region,
    ))
db.commit()

# ── Health Sessions ───────────────────────────────────────────────────────────
topics = ["menstrual_hygiene", "maternal_care", "nutrition", "family_planning"]
for i in range(8):
    session = HealthSession(
        title=f"Community Health Workshop #{i+1}",
        topic=random.choice(topics),
        region=random.choice(regions),
        facilitator=random.choice(["Dr. Mutesi", "Nurse Mukamana", "CHW Uwera"]),
        session_date=datetime.utcnow() - timedelta(days=random.randint(5, 180)),
        duration_minutes=random.choice([60, 90, 120]),
        expected_attendance=random.randint(15, 40),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    for j in range(random.randint(10, session.expected_attendance)):
        db.add(Attendance(
            session_id=session.id,
            attendee_name=f"Participant {j+1}",
            attended=True,
            feedback_score=random.randint(3, 5),
        ))
db.commit()

db.close()
print("✅ Sample data seeded successfully!")
print("   Login: admin@kosmotive.rw / admin123")
print("   Login: grace@kosmotive.rw / staff123")
print("   Login: eric@kosmotive.rw / analyst123")
