from datetime import timedelta

from app.services import today
from conftest import login
from test_flows import add_member, plan_id, set_upi


def make_offer(client, h, **kw):
    body = {"name": "Diwali Offer", "kind": "percent", "value": 20,
            "starts_on": str(today() - timedelta(days=1)), "ends_on": str(today() + timedelta(days=5)), **kw}
    return client.post("/api/offers", headers=h, json=body)


# ---------------- offers ----------------

def test_only_owner_manages_offers(client, owner):
    client.post("/api/users", headers=owner, json={"name": "Desk", "phone": "9111111111", "password": "staff123", "role": "staff"})
    staff = login(client, "9111111111", "staff123")
    assert make_offer(client, staff).status_code == 403
    assert make_offer(client, owner).status_code == 201
    assert client.get("/api/offers", headers=staff).status_code == 200


def test_auto_offer_applies_at_desk_and_shows_in_payment(client, owner):
    make_offer(client, owner)  # 20% on everything
    m = add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    pay = client.get(f"/api/members/{m['id']}/payments", headers=owner).json()[0]
    assert pay["amount"] == 800 and pay["discount"] == 200 and pay["discount_note"] == "Diwali Offer"
    assert pay["list_price"] == 1000


def test_offer_dates_and_plan_scope(client, owner):
    q_id = plan_id(client, owner, "Quarterly")
    make_offer(client, owner, kind="flat", value=500, plan_ids=[q_id])
    make_offer(client, owner, name="Next month", value=50,
               starts_on=str(today() + timedelta(days=10)), ends_on=str(today() + timedelta(days=20)))
    quotes = {q["plan_name"]: q for q in client.get("/api/quotes", headers=owner).json()}
    assert quotes["Monthly"]["price"] == 1000  # not in plan list, future offer not running
    assert quotes["Quarterly"]["price"] == 2200 and quotes["Quarterly"]["offer_name"] == "Diwali Offer"


def test_best_offer_wins_and_code_offer(client, owner):
    make_offer(client, owner, value=10)
    r = make_offer(client, owner, name="Anniversary", value=30, code="anniv30")
    assert r.json()["code"] == "ANNIV30"
    set_upi(client, owner)
    add_member(client, owner)
    mh = login(client, "9876543210", "9876543210")
    pid = plan_id(client, mh)
    assert client.get(f"/api/me/upi/{pid}", headers=mh).json()["amount"] == 900  # auto 10%
    link = client.get(f"/api/me/upi/{pid}?code=ANNIV30", headers=mh).json()
    assert link["amount"] == 700 and "am=700.00" in link["link"]
    assert client.get(f"/api/me/upi/{pid}?code=WRONG", headers=mh).status_code == 400
    pay = client.post("/api/me/payments", headers=mh, json={"plan_id": pid, "utr": "123412341234", "code": "anniv30"}).json()
    assert pay["amount"] == 700


def test_new_members_only_offer(client, owner):
    make_offer(client, owner, name="Join now", new_members_only=True)
    old = add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")  # first plan: gets offer
    r = client.post(f"/api/members/{old['id']}/payments", headers=owner, json={"plan_id": plan_id(client, owner), "method": "cash"})
    assert r.json()["amount"] == 1000  # renewal: no new-member discount


def test_custom_discount_owner_only(client, owner):
    client.post("/api/users", headers=owner, json={"name": "Desk", "phone": "9111111111", "password": "staff123", "role": "staff"})
    staff = login(client, "9111111111", "staff123")
    m = add_member(client, owner)
    body = {"plan_id": plan_id(client, owner), "method": "cash", "amount": 600, "discount_reason": "Family of owner"}
    assert client.post(f"/api/members/{m['id']}/payments", headers=staff, json=body).status_code == 403
    r = client.post(f"/api/members/{m['id']}/payments", headers=owner, json=body)
    assert r.status_code == 201 and r.json()["amount"] == 600 and r.json()["discount"] == 400
    assert client.post(f"/api/members/{m['id']}/payments", headers=owner, json={**body, "amount": 5000}).status_code == 400


def test_offer_validation(client, owner):
    assert make_offer(client, owner, value=95).status_code == 422
    assert make_offer(client, owner, ends_on=str(today() - timedelta(days=5))).status_code == 422
    make_offer(client, owner, code="NEWYEAR")
    assert make_offer(client, owner, name="Dup", code="newyear").status_code == 409


# ---------------- fingerprint machine ----------------

SN = "CQZ7232460123"


def device_cmds(client):
    return client.get(f"/iclock/getrequest?SN={SN}").text


def ack_all(client, text):
    ids = [line.split(":")[1] for line in text.strip().splitlines() if line.startswith("C:")]
    body = "\n".join(f"ID={i}&Return=0&CMD=DATA" for i in ids)
    assert client.post(f"/iclock/devicecmd?SN={SN}", content=body).text == "OK"


def test_unknown_machine_is_ignored_until_owner_adds_it(client, owner):
    add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    assert "GET OPTION FROM: " + SN in client.get(f"/iclock/cdata?SN={SN}&options=all").text
    r = client.post(f"/iclock/cdata?SN={SN}&table=ATTLOG", content=f"1\t{today()} 06:10:00\t0\t1\t0\n")
    assert r.text == "OK"
    assert client.get("/api/attendance", headers=owner).json() == []
    assert device_cmds(client) == "OK"
    devs = client.get("/api/devices", headers=owner).json()
    assert devs[0]["serial"] == SN and devs[0]["is_active"] is False


def test_paid_member_pushed_and_punch_becomes_attendance(client, owner):
    m = add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    r = client.post("/api/devices", headers=owner, json={"serial": SN, "name": "Entrance"})
    assert r.status_code == 201 and r.json()["pending_commands"] == 1
    cmds = device_cmds(client)
    assert cmds.startswith("C:") and f"DATA UPDATE USERINFO PIN={m['id']}\tName=Ravi Kumar" in cmds
    ack_all(client, cmds)
    assert client.get("/api/devices", headers=owner).json()[0]["pending_commands"] == 0
    assert client.get("/api/devices", headers=owner).json()[0]["online"] is True

    r = client.post(f"/iclock/cdata?SN={SN}&table=ATTLOG&Stamp=999",
                    content=f"{m['id']}\t{today()} 06:10:00\t0\t1\t0\n{m['id']}\t{today()} 07:30:00\t1\t1\t0\n")
    assert r.text == "OK: 2"
    att = client.get("/api/attendance", headers=owner).json()
    assert len(att) == 1 and att[0]["method"] == "finger" and att[0]["check_in_at"].endswith("06:10:00")


def _expire(member_id):
    from app.db import SessionLocal
    from app.models import Membership
    with SessionLocal() as db:
        for ms in db.query(Membership).filter_by(member_id=member_id):
            ms.start_date -= timedelta(days=40)
            ms.end_date -= timedelta(days=40)
        db.commit()


def test_expiry_removes_from_machine_and_renewal_restores_fingerprint(client, owner):
    m = add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    client.post("/api/devices", headers=owner, json={"serial": SN})
    ack_all(client, device_cmds(client))
    # member enrols finger at the machine; it uploads the template
    tmpl = f"FP PIN={m['id']}\tFID=6\tSize=1184\tValid=1\tTMP=TU9DS0ZJTkdFUlBSSU5U\n"
    assert client.post(f"/iclock/cdata?SN={SN}&table=OPERLOG", content=tmpl).text == "OK: 1"
    assert client.get(f"/api/members/{m['id']}", headers=owner).json()["has_fingerprint"] is True

    _expire(m["id"])
    assert client.post("/api/devices/sync", headers=owner).json().get("disabled") == 1
    cmds = device_cmds(client)
    assert f"DATA DELETE USERINFO PIN={m['id']}" in cmds
    ack_all(client, cmds)
    # expired member punches anyway (machine without door lock): no attendance, shows on dashboard
    client.post(f"/iclock/cdata?SN={SN}&table=ATTLOG", content=f"{m['id']}\t{today()} 18:00:00\t0\t1\t0\n")
    assert client.get("/api/attendance", headers=owner).json() == []
    assert client.get("/api/dashboard", headers=owner).json()["blocked_punches_today"][0]["member_id"] == m["id"]

    # renew -> user and the saved fingerprint go back on the machine
    client.post(f"/api/members/{m['id']}/payments", headers=owner, json={"plan_id": plan_id(client, owner), "method": "cash"})
    cmds = device_cmds(client)
    assert f"DATA UPDATE USERINFO PIN={m['id']}" in cmds
    assert f"DATA UPDATE FINGERTMP PIN={m['id']}\tFID=6\tSize=1184\tValid=1\tTMP=TU9DS0ZJTkdFUlBSSU5U" in cmds


def test_upi_confirmation_enables_on_machine(client, owner):
    set_upi(client, owner)
    client.post("/api/devices", headers=owner, json={"serial": SN})
    add_member(client, owner)
    mh = login(client, "9876543210", "9876543210")
    pay = client.post("/api/me/payments", headers=mh, json={"plan_id": plan_id(client, mh), "utr": "777788889999"}).json()
    assert device_cmds(client) == "OK"  # not paid yet
    client.post(f"/api/payments/{pay['id']}/verify", headers=owner)
    assert "DATA UPDATE USERINFO" in device_cmds(client)


def test_no_fingerprint_backup_means_not_removed(client, owner):
    m = add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    client.post("/api/devices", headers=owner, json={"serial": SN})
    ack_all(client, device_cmds(client))
    _expire(m["id"])
    assert client.post("/api/devices/sync", headers=owner).json().get("needs_fingerprint_backup") == 1
    assert "DELETE" not in device_cmds(client)
    att = client.get("/api/devices/attention", headers=owner).json()
    assert att["cannot_block"][0]["id"] == m["id"]


def test_disabling_account_removes_from_machine(client, owner):
    m = add_member(client, owner, plan_id=plan_id(client, owner), payment_method="cash")
    client.post("/api/devices", headers=owner, json={"serial": SN})
    ack_all(client, device_cmds(client))
    client.post(f"/iclock/cdata?SN={SN}&table=OPERLOG", content=f"FP PIN={m['id']}\tFID=1\tSize=10\tValid=1\tTMP=QUJD\n")
    client.patch(f"/api/members/{m['id']}", headers=owner, json={"is_active": False})
    assert f"DATA DELETE USERINFO PIN={m['id']}" in device_cmds(client)


def test_device_owner_only(client, owner):
    client.post("/api/users", headers=owner, json={"name": "Desk", "phone": "9111111111", "password": "staff123", "role": "staff"})
    staff = login(client, "9111111111", "staff123")
    assert client.post("/api/devices", headers=staff, json={"serial": SN}).status_code == 403
    assert client.post("/api/devices/sync", headers=staff).status_code == 403
