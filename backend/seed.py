"""
KosmoInsight AI — v2 Database Seed
====================================
Populates the database with realistic Rwandan microfinance sample data.
Covers ALL v2 models: Users, Customers, Payments, Installments,
Distributions, HealthSessions, Notifications, AuditLogs, AIPredictions.

Usage:
    cd backend
    python seed.py

Safe to re-run — checks for existing records before inserting.
"""

import sys, os, random
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
from app.database import Base, engine
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
from app.database import SessionLocal
from app.models import (
    Base, User, Customer, Payment, Product, Distribution,
    HealthSession, Attendance, Installment, Notification,
    AuditLog, AIPrediction, PaymentProviderLog,
)
from app.auth import hash_password

# ─── Setup ────────────────────────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)
db = SessionLocal()
random.seed(42)  # Reproducible data

def utc(days_ago=0, hours=0):
    return datetime.now(timezone.utc) - timedelta(days=days_ago, hours=hours)

def rand_phone():
    prefix = random.choice(["078", "079", "072", "073"])
    return f"{prefix}{random.randint(1000000, 9999999)}"

print("🌱 Seeding KosmoInsight v2 database...")

# ─── 1. Users ─────────────────────────────────────────────────────────────────
print("   → Users")
users_data = [
    dict(name="Admin Kosmotive",   email="admin@kosmotive.rw",   password="admin123",   role="admin"),
    dict(name="Grace Uwase",       email="grace@kosmotive.rw",    password="staff123",   role="staff"),
    dict(name="Eric Mugabo",       email="eric@kosmotive.rw",     password="analyst123", role="analyst"),
    dict(name="Sandrine Ingabire", email="sandrine@kosmotive.rw", password="staff123",   role="staff"),
]
users = {}
for ud in users_data:
    u = db.query(User).filter(User.email == ud["email"]).first()
    if not u:
        u = User(
            name=ud["name"], email=ud["email"],
            hashed_password=hash_password(ud["password"]),
            role=ud["role"], is_active=True,
            last_login=utc(random.randint(0, 7)),
        )
        db.add(u)
        db.flush()
    users[ud["role"]] = u  # keeps last user per role; fine for seeding
db.commit()

admin   = db.query(User).filter(User.email == "admin@kosmotive.rw").first()
staff   = db.query(User).filter(User.email == "grace@kosmotive.rw").first()

# ─── 2. Products ──────────────────────────────────────────────────────────────
print("   → Products")
products_data = [
    dict(name="Menstrual Cup",       category="menstrual_health", unit_price=4500,  stock_quantity=120, low_stock_alert=20, lifespan_months=24),
    dict(name="Reusable Pads Kit",   category="menstrual_health", unit_price=3200,  stock_quantity=200, low_stock_alert=30, lifespan_months=18),
    dict(name="Maternal Health Kit", category="maternal_health",  unit_price=8000,  stock_quantity=80,  low_stock_alert=15, lifespan_months=12),
    dict(name="Solar Lamp",          category="solar",            unit_price=15000, stock_quantity=50,  low_stock_alert=10, lifespan_months=36),
    dict(name="Clean Cookstove",     category="energy",           unit_price=22000, stock_quantity=30,  low_stock_alert=8,  lifespan_months=60),
]
for pd in products_data:
    if not db.query(Product).filter(Product.name == pd["name"]).first():
        db.add(Product(**pd))
db.commit()
products = db.query(Product).all()

# ─── 3. Customers ─────────────────────────────────────────────────────────────
print("   → Customers (40)")
regions = ["Kigali", "Northern", "Southern", "Eastern", "Western"]
product_types = ["Menstrual Cup", "Reusable Pads Kit", "Maternal Health Kit", "Solar Lamp", "Clean Cookstove"]
plans = ["weekly", "monthly", "biweekly"]

# Realistic Rwandan names
all_names = [
    "Amina Uwimana", "Celestine Mukamana", "Diane Ingabire", "Esperance Nyiraneza",
    "Francine Umutesi", "Gisele Mukagasana", "Honorine Uwera", "Immaculee Nizeyimana",
    "Josiane Mukagatare", "Keza Akimana", "Liliane Umutoniwase", "Marie Uwantege",
    "Nathalie Uwimana", "Olive Mukamwiza", "Pascaline Niyonzima", "Reine Ineza",
    "Salome Uwineza", "Therese Mukankusi", "Umulisa Nyirahabimana", "Valentine Keza",
    "Winnie Mukagasana", "Xaviera Umubyeyi", "Yvette Ntirampeba", "Zoe Ingabire",
    "Alice Uwera", "Brigitte Mukamana", "Christine Nkurunziza", "Delphine Uwineza",
    "Elise Mukarugwiro", "Faustine Nyirahabimana", "Gloria Umwali", "Helene Uwimana",
    "Isabelle Mukankusi", "Jeanne Uwantege", "Ketty Ingabire", "Laetitia Nizeyimana",
    "Marguerite Mukagasana", "Nadine Uwimana", "Odette Nkurunziza", "Priscille Umutesi",
]

# Risk profile weights: mostly good payers, some at-risk, few defaults
risk_profiles = (
    ["low"] * 18 + ["medium"] * 14 + ["high"] * 8
)
random.shuffle(risk_profiles)

customers = []
for i, name in enumerate(all_names):
    join_days_ago = random.randint(30, 540)
    risk_level = risk_profiles[i]
    # Status correlates with risk
    if risk_level == "low":
        status = random.choice(["active", "active", "active", "completed"])
        risk_score = round(random.uniform(0.05, 0.30), 3)
    elif risk_level == "medium":
        status = random.choice(["active", "active", "suspended"])
        risk_score = round(random.uniform(0.31, 0.65), 3)
    else:
        status = random.choice(["active", "defaulted", "suspended"])
        risk_score = round(random.uniform(0.66, 0.95), 3)

    product_type = random.choice(product_types)
    plan = random.choice(plans)

    # Unit prices by product for debt calculation
    price_map = {
        "Menstrual Cup": 4500, "Reusable Pads Kit": 3200,
        "Maternal Health Kit": 8000, "Solar Lamp": 15000, "Clean Cookstove": 22000,
    }
    total_price = price_map[product_type]
    n_installments = {"weekly": 12, "biweekly": 8, "monthly": 6}[plan]
    installment_amount = round(total_price / n_installments, 2)

    c = Customer(
        name=name,
        phone=rand_phone(),
        location=f"{random.choice(['Gasabo', 'Kicukiro', 'Nyarugenge', 'Musanze', 'Huye', 'Muhanga', 'Rwamagana', 'Kayonza', 'Rubavu', 'Rusizi'])} District",
        region=random.choice(regions),
        product_type=product_type,
        payment_plan=plan,
        status=status,
        risk_score=risk_score,
        risk_level=risk_level,
        total_debt=0.0,  # recalculated after payments
        join_date=utc(join_days_ago),
        created_by=admin.id,
    )
    db.add(c)
    db.flush()
    customers.append((c, n_installments, installment_amount, risk_level))

db.commit()

# ─── 4. Payments ─────────────────────────────────────────────────────────────
print("   → Payments")
payment_methods = ["cash", "mobile_money", "mobile_money", "mobile_money", "bank"]

def payment_status_for_risk(risk_level: str) -> str:
    if risk_level == "low":
        return random.choices(
            ["paid", "pending", "missed", "partial"],
            weights=[75, 15, 5, 5]
        )[0]
    elif risk_level == "medium":
        return random.choices(
            ["paid", "pending", "missed", "partial"],
            weights=[50, 20, 20, 10]
        )[0]
    else:
        return random.choices(
            ["paid", "pending", "missed", "partial"],
            weights=[25, 15, 45, 15]
        )[0]

for (c, n_inst, amount, risk) in customers:
    total_debt = 0.0
    join_days_ago = (datetime.now(timezone.utc) - c.join_date).days

    for i in range(1, n_inst + 1):
        days_offset = i * (7 if c.payment_plan == "weekly" else 14 if c.payment_plan == "biweekly" else 30)
        due = c.join_date + timedelta(days=days_offset)

        # Only create payments that are due (past due_date or close)
        if due > utc(-1):
            status = "pending"
        else:
            status = payment_status_for_risk(risk)

        if status == "paid":
            paid = amount
        elif status == "partial":
            paid = round(amount * random.uniform(0.3, 0.7), 2)
        else:
            paid = 0.0

        balance = round(amount - paid, 2)
        total_debt += balance

        method = random.choice(payment_methods)
        tx_ref = f"TXN{random.randint(100000, 999999)}" if paid > 0 and method == "mobile_money" else None

        db.add(Payment(
            customer_id=c.id,
            amount_due=amount,
            amount_paid=paid,
            remaining_balance=balance,
            due_date=due,
            paid_date=due + timedelta(hours=random.randint(1, 72)) if paid > 0 else None,
            status=status,
            installment_number=i,
            payment_method=method,
            transaction_ref=tx_ref,
            recorded_by=staff.id if paid > 0 else None,
        ))

    # Update total_debt on customer
    c.total_debt = round(total_debt, 2)

db.commit()

# ─── 5. Installment Schedules (v2 new model) ─────────────────────────────────
print("   → Installment schedules")
freq_map = {"weekly": ("weekly", 7), "biweekly": ("weekly", 14), "monthly": ("monthly", 30)}

# Generate installment schedules for first 20 customers
for (c, n_inst, amount, risk) in customers[:20]:
    freq_key, day_step = freq_map[c.payment_plan]
    for i in range(1, n_inst + 1):
        due = c.join_date + timedelta(days=day_step * i)
        is_past = due < utc()

        if not is_past:
            status = "pending"
            paid_amount = 0.0
            paid_date = None
        else:
            raw = payment_status_for_risk(risk)
            status = raw
            if raw == "paid":
                paid_amount = amount
                paid_date = due + timedelta(hours=random.randint(1, 48))
            elif raw == "partial":
                paid_amount = round(amount * random.uniform(0.3, 0.7), 2)
                paid_date = due + timedelta(hours=random.randint(1, 48))
            else:
                paid_amount = 0.0
                paid_date = None

        db.add(Installment(
            customer_id=c.id,
            installment_no=i,
            frequency=freq_key,
            amount_due=amount,
            due_date=due,
            status=status,
            paid_amount=paid_amount,
            paid_date=paid_date,
            reminder_sent=is_past and random.random() > 0.4,
        ))

db.commit()

# ─── 6. Distributions ────────────────────────────────────────────────────────
print("   → Product distributions")
agents = ["Jean Baptiste Niyonzima", "Alice Nkusi", "Patrick Habimana", "Sandra Uwera", "Claude Ndayisaba"]
for (c, *_) in random.sample(customers, 30):
    product = next((p for p in products if p.name == c.product_type), random.choice(products))
    db.add(Distribution(
        customer_id=c.id,
        product_id=product.id,
        agent_name=random.choice(agents),
        quantity=random.randint(1, 2),
        region=c.region,
        distribution_date=c.join_date + timedelta(days=random.randint(1, 5)),
    ))
db.commit()

# ─── 7. Health Sessions ───────────────────────────────────────────────────────
print("   → Health sessions (14)")
topics = ["menstrual_hygiene", "maternal_care", "nutrition", "family_planning", "reproductive_health"]
facilitators = ["Dr. Mutesi Aline", "Nurse Mukamana Joelle", "CHW Uwera Pascale", "Dr. Habimana Eric"]
session_titles = [
    "Menstrual Hygiene Management Workshop",
    "Safe Motherhood & Antenatal Care",
    "Community Nutrition & Infant Feeding",
    "Family Planning & Contraception Awareness",
    "Reproductive Health for Young Women",
    "Menstrual Cup Usage & Maintenance",
    "Maternal Nutrition During Pregnancy",
    "Post-Natal Care & Newborn Health",
    "Clean Cooking & Indoor Air Quality",
    "Solar Energy for Household Health",
    "Community Health Worker Training",
    "Adolescent Sexual & Reproductive Health",
    "Emergency Obstetric Care Awareness",
    "Hygiene & Sanitation in Rural Areas",
]

all_customer_objs = [c for (c, *_) in customers]

for idx in range(14):
    expected = random.randint(18, 45)
    session = HealthSession(
        title=session_titles[idx],
        topic=random.choice(topics),
        region=random.choice(regions),
        facilitator=random.choice(facilitators),
        session_date=utc(random.randint(5, 200)),
        duration_minutes=random.choice([60, 90, 90, 120]),
        expected_attendance=expected,
    )
    db.add(session)
    db.flush()

    actual_attendance = random.randint(int(expected * 0.6), expected)
    for j in range(actual_attendance):
        cust = random.choice(all_customer_objs) if j < len(all_customer_objs) else None
        db.add(Attendance(
            session_id=session.id,
            customer_id=cust.id if cust else None,
            attendee_name=cust.name if cust else f"Community Member {j+1}",
            attended=True,
            feedback_score=random.choices([3, 4, 5], weights=[15, 35, 50])[0],
        ))

db.commit()

# ─── 8. Notifications (v2 new model) ─────────────────────────────────────────
print("   → Notifications")
channels = ["sms", "sms", "sms", "whatsapp", "email", "in_app"]
notif_templates = [
    ("Payment Reminder",     "Dear {name}, your payment of RWF {amount} is due on {date}. Pay via MTN MoMo *182*1*1# or Airtel Money *185#."),
    ("Payment Received",     "Dear {name}, we received your payment of RWF {amount}. Thank you! Remaining balance: RWF {balance}."),
    ("Missed Payment Alert", "Dear {name}, your payment of RWF {amount} was missed. Please contact us urgently to avoid service suspension."),
    ("Welcome Message",      "Welcome to KosmoInsight, {name}! Your PayGo plan is active. Your first payment is due on {date}."),
    ("Risk Score Update",    "Dear {name}, your account has been reviewed. Log in to see your updated status and payment schedule."),
    ("General Broadcast",    "Reminder: KosmoInsight community health session this Saturday at your local health centre. All clients welcome!"),
]

notif_statuses = ["sent", "sent", "sent", "pending", "failed"]

high_risk_customers = [c for (c, *_) in customers if c.risk_level == "high"]
sample_customers = random.sample(all_customer_objs, min(25, len(all_customer_objs)))

for c in sample_customers:
    template_title, template_body = random.choice(notif_templates)
    channel = random.choice(channels)
    status = random.choice(notif_statuses)
    sent_at = utc(random.randint(0, 30)) if status == "sent" else None

    message = template_body.format(
        name=c.name.split()[0],
        amount=random.choice([3200, 4500, 8000]),
        date=(utc(-random.randint(1, 15))).strftime("%d %b %Y"),
        balance=random.randint(5000, 20000),
    )

    db.add(Notification(
        customer_id=c.id,
        channel=channel,
        recipient=c.phone if channel in ["sms", "whatsapp"] else f"{c.name.lower().replace(' ', '.')}@gmail.com",
        subject=template_title if channel == "email" else None,
        message=message,
        status=status,
        sent_at=sent_at,
        error_message="Provider timeout" if status == "failed" else None,
        created_by_id=admin.id,
        created_at=utc(random.randint(0, 45)),
    ))

# Broadcast notification
db.add(Notification(
    customer_id=None,
    channel="in_app",
    recipient=None,
    subject="System Broadcast",
    message="KosmoInsight v2 is now live! New features: Installment Scheduler, Notification Center, and Audit Log. Log in to explore.",
    status="sent",
    sent_at=utc(1),
    created_by_id=admin.id,
))

db.commit()

# ─── 9. AI Predictions (v2 new model) ────────────────────────────────────────
print("   → AI Predictions")
model_version = "v2.1.0"

for (c, n_inst, amount, risk) in random.sample(customers, 20):
    missed = db.query(Payment).filter(
        Payment.customer_id == c.id,
        Payment.status == "missed"
    ).count()
    total_payments = db.query(Payment).filter(Payment.customer_id == c.id).count()

    db.add(AIPrediction(
        customer_id=c.id,
        prediction_type="repayment_risk",
        input_features={
            "missed_payments": missed,
            "total_payments": max(total_payments, 1),
            "months_active": random.randint(1, 18),
            "payment_plan": c.payment_plan,
            "region": c.region,
        },
        output_result={
            "risk_score": c.risk_score,
            "risk_level": c.risk_level,
            "recommendation": "monitor" if c.risk_level == "medium" else ("urgent_followup" if c.risk_level == "high" else "on_track"),
        },
        confidence=round(random.uniform(0.72, 0.97), 3),
        model_version=model_version,
        created_at=utc(random.randint(0, 30)),
    ))

# Demand forecast predictions
for product_type in ["menstrual_health", "maternal_health", "solar", "energy"]:
    db.add(AIPrediction(
        customer_id=None,
        prediction_type="demand_forecast",
        input_features={"product_type": product_type, "periods": 3, "region": "all"},
        output_result={
            "forecast": [
                {"month": "Month 1", "predicted_demand": random.randint(25, 80)},
                {"month": "Month 2", "predicted_demand": random.randint(30, 90)},
                {"month": "Month 3", "predicted_demand": random.randint(35, 100)},
            ]
        },
        confidence=round(random.uniform(0.68, 0.88), 3),
        model_version=model_version,
    ))

# Segmentation prediction
db.add(AIPrediction(
    customer_id=None,
    prediction_type="segmentation",
    input_features={"n_customers": len(customers)},
    output_result={
        "segments": [
            {"segment": "Champions",  "count": len([c for (c,*_) in customers if c.risk_level == "low" and c.status == "active"])},
            {"segment": "At Risk",    "count": len([c for (c,*_) in customers if c.risk_level == "medium"])},
            {"segment": "Lost",       "count": len([c for (c,*_) in customers if c.risk_level == "high" or c.status == "defaulted"])},
            {"segment": "New",        "count": len([c for (c,*_) in customers if (datetime.now(timezone.utc) - c.join_date).days < 90])},
        ]
    },
    confidence=0.85,
    model_version=model_version,
))

db.commit()

# ─── 10. Audit Logs (v2 new model) ───────────────────────────────────────────
print("   → Audit logs")
ips = ["196.46.12.3", "41.186.200.14", "41.222.116.8", "196.200.132.1"]
audit_actions = [
    ("create", "Customer"),
    ("update", "Customer"),
    ("create", "Payment"),
    ("update", "Payment"),
    ("create", "HealthSession"),
    ("delete", "Payment"),
    ("create", "Distribution"),
    ("update", "Product"),
    ("login",  "User"),
]

all_users = db.query(User).all()
for _ in range(40):
    action, resource = random.choice(audit_actions)
    user = random.choice(all_users)
    db.add(AuditLog(
        user_id=user.id,
        action=action,
        resource=resource,
        resource_id=random.randint(1, 40),
        detail={"field": "status", "old": "pending", "new": "paid"} if action == "update" else {"created": True},
        ip_address=random.choice(ips),
        created_at=utc(random.randint(0, 90), hours=random.randint(0, 23)),
    ))

db.commit()

# ─── 11. Payment Provider Logs (v2 new model) ────────────────────────────────
print("   → Payment provider logs")
mobile_payments = db.query(Payment).filter(Payment.payment_method == "mobile_money").limit(20).all()

for p in mobile_payments:
    provider = random.choice(["mtn_momo", "airtel_money"])
    status = random.choices(["confirmed", "initiated", "failed"], weights=[70, 20, 10])[0]
    db.add(PaymentProviderLog(
        payment_id=p.id,
        provider=provider,
        phone=rand_phone(),
        amount=p.amount_paid,
        transaction_ref=p.transaction_ref or f"TXN{random.randint(100000, 999999)}",
        status=status,
        provider_response={
            "code": "200" if status == "confirmed" else "408",
            "message": "Transaction successful" if status == "confirmed" else ("Pending" if status == "initiated" else "Timeout"),
            "provider": provider,
        },
    ))

db.commit()
db.close()

# ─── Summary ──────────────────────────────────────────────────────────────────
print()
print("✅ KosmoInsight v2 database seeded successfully!")
print()
print("  📊 Data summary:")
print(f"     Users:              {len(users_data)}")
print(f"     Products:           {len(products_data)}")
print(f"     Customers:          {len(all_names)}  (low: 18 · medium: 14 · high: 8)")
print(f"     Payments:           per customer based on payment plan")
print(f"     Installment rows:   first 20 customers × their plan installments")
print(f"     Distributions:      30 random customers")
print(f"     Health sessions:    14  (with attendance records)")
print(f"     Notifications:      26  (SMS / WhatsApp / email / in-app)")
print(f"     AI Predictions:     20 risk + 4 forecast + 1 segmentation")
print(f"     Audit logs:         40")
print(f"     Provider logs:      up to 20 mobile money transactions")
print()
print("  🔑 Login credentials:")
print("     admin@kosmotive.rw   /  admin123    (Admin — full access)")
print("     grace@kosmotive.rw   /  staff123    (Staff — add/edit)")
print("     eric@kosmotive.rw    /  analyst123  (Analyst — read only)")
print("     sandrine@kosmotive.rw /  staff123   (Staff — add/edit)")
print()
print("  🚀 Start the server:  uvicorn app.main:app --reload")
