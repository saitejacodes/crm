from datetime import timedelta

from app.services import checkin_token, today
from conftest import login


def plan_id(client, h, name="Monthly"):
    return next(p["id"] for p in client.get("/api/plans", headers=h).json() if p["name"] == name)


def add_member(client, h, phone="9876543210", **extra):
    r = client.post("/api/members", headers=h, json={"name": "Ravi Kumar", "phone": phone, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def set_upi(client, owner):
    r = client.put("/api/settings", headers=owner, json={
        "gym_name": "Iron Paradise", "upi_id": "ironparadise@okaxis", "upi_payee_name": "Iron Paradise",
        "expiry_alert_days": 7})
    assert r.status_code == 200, r.text


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"phone": "9000000000", "password": "nope"})
    assert r.status_code == 401


def test_phone_normalised_with_country_code(client):
    r = client.post("/api/auth/login", json={"phone": "+91 90000 00000", "password": "ownerpass"})
    assert r.status_code == 200


def test_new_member_with_desk_payment_is_active(client, owner):
    m = add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    assert m["code"] == "M0001"
    assert m["status"] == "active"
    assert m["end_date"] == str(today() + timedelta(days=29))
    pays = client.get(f"/api/members/{m['id']}/payments", headers=owner).json()
    assert pays[0]["status"] == "verified" and pays[0]["receipt_no"].startswith("R")


def test_member_without_plan_is_new_and_cannot_check_in(client, owner):
    m = add_member(client, owner)
    assert m["status"] == "new"
    r = client.post(f"/api/attendance/manual/{m['id']}", headers=owner)
    assert r.status_code == 402


def test_duplicate_phone_rejected(client, owner):
    add_member(client, owner)
    r = client.post("/api/members", headers=owner, json={"name": "Other", "phone": "9876543210"})
    assert r.status_code == 409


def test_renewal_stacks_after_current_period(client, owner):
    pid = plan_id(client, owner)
    m = add_member(client, owner, plan_id=pid, payment_method="cash")
    r = client.post(f"/api/members/{m['id']}/payments", headers=owner,
                    json={"plan_id": plan_id(client, owner, "Quarterly"), "method": "upi", "utr": "123456789012"})
    assert r.status_code == 201, r.text
    mss = client.get(f"/api/members/{m['id']}/memberships", headers=owner).json()
    newest, first = mss[0], mss[1]
    assert newest["start_date"] == str(today() + timedelta(days=30))
    assert newest["end_date"] == str(today() + timedelta(days=30 + 89))
    assert first["end_date"] == str(today() + timedelta(days=29))
    # status reflects the full stacked period
    assert client.get(f"/api/members/{m['id']}", headers=owner).json()["end_date"] == newest["end_date"]


def test_member_upi_flow_verify(client, owner):
    set_upi(client, owner)
    m = add_member(client, owner)
    mh = login(client, "9876543210", "9876543210")  # default password = phone
    pid = plan_id(client, mh)
    link = client.get(f"/api/me/upi/{pid}", headers=mh).json()
    assert link["link"].startswith("upi://pay?pa=ironparadise%40okaxis") and "am=1000.00" in link["link"]

    r = client.post("/api/me/payments", headers=mh, json={"plan_id": pid, "utr": "4321 0987 6543"})
    assert r.status_code == 201, r.text
    pay = r.json()
    assert pay["status"] == "pending" and pay["utr"] == "432109876543"
    assert client.get("/api/me", headers=mh).json()["status"] == "new"

    # second pending submission blocked
    assert client.post("/api/me/payments", headers=mh, json={"plan_id": pid, "utr": "999999999999"}).status_code == 409

    assert client.get("/api/dashboard", headers=owner).json()["pending_payments"] == 1
    r = client.post(f"/api/payments/{pay['id']}/verify", headers=owner)
    assert r.status_code == 200 and r.json()["status"] == "verified"
    me = client.get("/api/me", headers=mh).json()
    assert me["status"] == "active" and me["days_left"] == 29
    # can't verify twice
    assert client.post(f"/api/payments/{pay['id']}/verify", headers=owner).status_code == 400
    assert m["id"] == me["id"]


def test_reused_utr_rejected(client, owner):
    set_upi(client, owner)
    add_member(client, owner)
    add_member(client, owner, phone="9876500000")
    a = login(client, "9876543210", "9876543210")
    b = login(client, "9876500000", "9876500000")
    pid = plan_id(client, a)
    assert client.post("/api/me/payments", headers=a, json={"plan_id": pid, "utr": "111122223333"}).status_code == 201
    assert client.post("/api/me/payments", headers=b, json={"plan_id": pid, "utr": "111122223333"}).status_code == 409


def test_reject_payment_cancels_membership(client, owner):
    set_upi(client, owner)
    add_member(client, owner)
    mh = login(client, "9876543210", "9876543210")
    pay = client.post("/api/me/payments", headers=mh, json={"plan_id": plan_id(client, mh), "utr": "555566667777"}).json()
    r = client.post(f"/api/payments/{pay['id']}/reject", headers=owner, json={"note": "Not in bank statement"})
    assert r.json()["status"] == "rejected"
    mss = client.get("/api/me/memberships", headers=mh).json()
    assert mss[0]["status"] == "cancelled"
    # member can submit again after rejection
    assert client.post("/api/me/payments", headers=mh, json={"plan_id": plan_id(client, mh), "utr": "555566667778"}).status_code == 201


def test_qr_checkin_once_per_day(client, owner):
    add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    mh = login(client, "9876543210", "9876543210")
    tok = client.get("/api/attendance/kiosk-token", headers=owner).json()["token"]
    r1 = client.post("/api/me/checkin", headers=mh, json={"token": tok})
    r2 = client.post("/api/me/checkin", headers=mh, json={"token": tok})
    assert r1.json()["created"] is True and r2.json()["created"] is False
    assert len(client.get("/api/attendance", headers=owner).json()) == 1
    assert client.get("/api/dashboard", headers=owner).json()["checkins_today"] == 1


def test_qr_checkin_bad_or_old_token(client, owner):
    import time
    from app.services import get_gym
    from app.db import SessionLocal
    add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    mh = login(client, "9876543210", "9876543210")
    assert client.post("/api/me/checkin", headers=mh, json={"token": "deadbeef"}).status_code == 400
    with SessionLocal() as db:
        secret = get_gym(db).checkin_secret
    old = checkin_token(secret, time.time() - 600)
    assert client.post("/api/me/checkin", headers=mh, json={"token": old}).status_code == 400


def test_roles_and_permissions(client, owner):
    r = client.post("/api/users", headers=owner, json={"name": "Desk Staff", "phone": "9111111111",
                                                       "password": "staff123", "role": "staff"})
    assert r.status_code == 201
    r = client.post("/api/users", headers=owner, json={"name": "Coach Arjun", "phone": "9222222222",
                                                       "password": "coach123", "role": "trainer"})
    trainer_id = r.json()["id"]
    staff = login(client, "9111111111", "staff123")
    trainer = login(client, "9222222222", "coach123")

    a = add_member(client, staff, trainer_id=trainer_id)
    add_member(client, staff, phone="9876500000")
    mh = login(client, "9876543210", "9876543210")

    # staff: no revenue, no settings, no plan edits
    d = client.get("/api/dashboard", headers=staff).json()
    assert "revenue_by_month" not in d
    assert "revenue_by_month" in client.get("/api/dashboard", headers=owner).json()
    assert client.put("/api/settings", headers=staff, json={"gym_name": "X"}).status_code == 403
    assert client.post("/api/plans", headers=staff, json={"name": "Hack", "duration_days": 1, "price": 0}).status_code == 403
    assert client.get("/api/payments/export.csv", headers=staff).status_code == 403

    # trainer sees only assigned members and can write workout
    lst = client.get("/api/members", headers=trainer).json()
    assert [m["id"] for m in lst] == [a["id"]]
    assert client.get(f"/api/members/{a['id'] + 1}", headers=trainer).status_code == 403
    r = client.put(f"/api/members/{a['id']}/workout", headers=trainer,
                   json={"workout": "Mon: Chest\nTue: Back", "diet": "High protein"})
    assert r.status_code == 200 and r.json()["trainer_name"] == "Coach Arjun"
    assert client.get("/api/me/workout", headers=mh).json()["workout"].startswith("Mon: Chest")

    # member can't reach staff endpoints
    assert client.get("/api/members", headers=mh).status_code == 403
    assert client.get("/api/dashboard", headers=mh).status_code == 403
    assert client.get("/api/members").status_code == 401


def test_disabled_member_cannot_login(client, owner):
    m = add_member(client, owner)
    client.patch(f"/api/members/{m['id']}", headers=owner, json={"is_active": False})
    r = client.post("/api/auth/login", json={"phone": "9876543210", "password": "9876543210"})
    assert r.status_code == 403


def test_change_password(client, owner):
    add_member(client, owner)
    mh = login(client, "9876543210", "9876543210")
    assert client.post("/api/auth/password", headers=mh, json={"old_password": "x", "new_password": "newpass1"}).status_code == 400
    assert client.post("/api/auth/password", headers=mh, json={"old_password": "9876543210", "new_password": "newpass1"}).status_code == 200
    login(client, "9876543210", "newpass1")


def test_status_filters_and_search(client, owner):
    add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    add_member(client, owner, phone="9876500000")
    assert len(client.get("/api/members?status=active", headers=owner).json()) == 1
    assert len(client.get("/api/members?status=new", headers=owner).json()) == 1
    assert len(client.get("/api/members?q=98765000", headers=owner).json()) == 1
    assert len(client.get("/api/members?q=m0001", headers=owner).json()) == 1


def test_csv_export_and_revenue(client, owner):
    add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    r = client.get("/api/payments/export.csv", headers=owner)
    assert r.status_code == 200 and "Ravi Kumar" in r.text and "1000" in r.text
    d = client.get("/api/dashboard", headers=owner).json()
    assert d["revenue_this_month"] == 1000 and d["revenue_today"] == 1000
    assert len(d["revenue_by_month"]) == 6


def test_upi_not_configured(client, owner):
    add_member(client, owner)
    mh = login(client, "9876543210", "9876543210")
    r = client.get(f"/api/me/upi/{plan_id(client, mh)}", headers=mh)
    assert r.status_code == 400


def _shift_memberships(member_id, days):
    from app.db import SessionLocal
    from app.models import Membership
    with SessionLocal() as db:
        for ms in db.query(Membership).filter_by(member_id=member_id):
            ms.start_date += timedelta(days=days)
            ms.end_date += timedelta(days=days)
        db.commit()


def test_expiring_expired_and_lapsed_renewal(client, owner):
    m = add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    _shift_memberships(m["id"], -25)  # 4 days left
    got = client.get(f"/api/members/{m['id']}", headers=owner).json()
    assert got["status"] == "expiring" and got["days_left"] == 4
    assert [x["id"] for x in client.get("/api/dashboard", headers=owner).json()["expiring"]] == [m["id"]]

    _shift_memberships(m["id"], -10)  # expired 6 days ago
    got = client.get(f"/api/members/{m['id']}", headers=owner).json()
    assert got["status"] == "expired"
    assert client.post(f"/api/attendance/manual/{m['id']}", headers=owner).status_code == 402

    # renewing a lapsed member starts from today, not from the old end date
    client.post(f"/api/members/{m['id']}/payments", headers=owner, json={"plan_id": plan_id(client, owner), "method": "cash"})
    got = client.get(f"/api/members/{m['id']}", headers=owner).json()
    assert got["status"] == "active" and got["end_date"] == str(today() + timedelta(days=29))
    assert client.post(f"/api/attendance/manual/{m['id']}", headers=owner).status_code == 200
