"""
Automated Test Suite for Database-Backed Corporate Authentication & Staff Governance.
Verifies registration, approval workflows, role switching, suspension, and RBAC route guards.
"""
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.db.session import SessionLocal, init_db
from backend.app.services.security import bootstrap_initial_users

client = TestClient(app)


@pytest.fixture(autouse=True)
def ensure_db_and_admin():
    """Ensures test database tables and initial bootstrap users are populated."""
    init_db()
    with SessionLocal() as db:
        bootstrap_initial_users(db)


def test_login_success_admin():
    """Verifies that the Super Admin can authenticate with default bootstrapped credentials."""
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["user"]["role"] == "ADMIN"
    assert data["user"]["fullName"] == "System Administrator"
    assert data["token"].startswith("lf_")


def test_login_success_bootstrapped_staff():
    """Verifies that seeded staff (Sarah & John) can authenticate."""
    res_sarah = client.post(
        "/api/v1/auth/login",
        json={"username": "sarah.approver", "password": "password123"}
    )
    assert res_sarah.status_code == 200
    assert res_sarah.json()["user"]["role"] == "APPROVER"

    res_john = client.post(
        "/api/v1/auth/login",
        json={"username": "john.accountant", "password": "password123"}
    )
    assert res_john.status_code == 200
    assert res_john.json()["user"]["role"] == "ACCOUNTANT"


def test_login_invalid_password():
    """Verifies that incorrect credentials receive HTTP 401 Unauthorized."""
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrong_password"}
    )
    assert response.status_code == 401
    assert "Invalid corporate username or password" in response.json()["detail"]


def test_staff_self_registration_and_admin_approval_lifecycle():
    """
    Verifies end-to-end staff lifecycle:
    1. Staff registers -> Status is PENDING_APPROVAL.
    2. Staff tries to log in before approval -> HTTP 403 Forbidden.
    3. Admin logs in and inspects pending queue.
    4. Admin approves applicant with role.
    5. Staff logs in successfully with HTTP 200.
    """
    # 1. Staff registers
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "username": "clara.maker",
            "email": "clara.smith@enterprise.com",
            "password": "clarapassword123",
            "full_name": "Clara Smith",
            "requested_role": "ACCOUNTANT",
            "department": "Accounts Payable"
        }
    )
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert reg_data["status"] == "PENDING_APPROVAL"
    user_id = reg_data["user_id"]

    # 2. Clara attempts login -> Blocked
    login_blocked = client.post(
        "/api/v1/auth/login",
        json={"username": "clara.maker", "password": "clarapassword123"}
    )
    assert login_blocked.status_code == 403
    assert "pending Administrator approval" in login_blocked.json()["detail"]

    # 3. Admin logs in
    admin_login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"}
    )
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["token"]
    auth_header = {"Authorization": f"Bearer {admin_token}"}

    # Inspect staff queue
    staff_list = client.get("/api/v1/admin/staff", headers=auth_header)
    assert staff_list.status_code == 200
    assert staff_list.json()["pending_count"] >= 1

    # 4. Admin approves Clara as Maker
    approve_res = client.post(
        f"/api/v1/admin/staff/{user_id}/approve",
        headers=auth_header,
        json={"approved_role": "ACCOUNTANT", "notes": "Approved for AP team."}
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "ACTIVE"
    assert approve_res.json()["role"] == "ACCOUNTANT"

    # 5. Clara logs in successfully
    clara_login = client.post(
        "/api/v1/auth/login",
        json={"username": "clara.maker", "password": "clarapassword123"}
    )
    assert clara_login.status_code == 200
    assert clara_login.json()["user"]["username"] == "clara.maker"


def test_admin_update_role_and_suspend():
    """Verifies that an Admin can change a user's role and suspend their account."""
    # Register and approve test user
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "username": "david.checker",
            "email": "david@enterprise.com",
            "password": "davidpassword123",
            "full_name": "David Miller",
            "requested_role": "APPROVER"
        }
    ).json()
    u_id = reg["user_id"]

    # Admin auth
    adm = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"}).json()
    auth_header = {"Authorization": f"Bearer {adm['token']}"}

    client.post(f"/api/v1/admin/staff/{u_id}/approve", headers=auth_header, json={"approved_role": "ACCOUNTANT"})

    # Admin promotes David to APPROVER
    role_res = client.patch(f"/api/v1/admin/staff/{u_id}/role", headers=auth_header, json={"role": "APPROVER"})
    assert role_res.status_code == 200
    assert role_res.json()["role"] == "APPROVER"

    # Admin suspends David
    sus_res = client.patch(f"/api/v1/admin/staff/{u_id}/status", headers=auth_header, json={"status": "SUSPENDED", "reason": "Audit review"})
    assert sus_res.status_code == 200
    assert sus_res.json()["status"] == "SUSPENDED"

    # David login should now be blocked with HTTP 403
    d_login = client.post("/api/v1/auth/login", json={"username": "david.checker", "password": "davidpassword123"})
    assert d_login.status_code == 403
    assert "suspended" in d_login.json()["detail"].lower()


def test_non_admin_cannot_access_staff_portal():
    """Verifies that staff accountants and approvers cannot access admin endpoints."""
    john_login = client.post("/api/v1/auth/login", json={"username": "john.accountant", "password": "password123"}).json()
    john_header = {"Authorization": f"Bearer {john_login['token']}"}

    res = client.get("/api/v1/admin/staff", headers=john_header)
    assert res.status_code == 403
    assert "Administrative privileges required" in res.json()["detail"]


def test_admin_direct_register_staff():
    """Verifies that an Admin can directly provision an active staff account."""
    adm = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"}).json()
    auth_header = {"Authorization": f"Bearer {adm['token']}"}

    res = client.post(
        "/api/v1/admin/staff/register",
        headers=auth_header,
        json={
            "username": "emma.finance",
            "email": "emma@enterprise.local",
            "password": "emmapassword123",
            "full_name": "Emma Watson",
            "role": "ACCOUNTANT",
            "department": "Accounts Payable Operations",
            "status": "ACTIVE"
        }
    )
    assert res.status_code == 201
    data = res.json()
    assert data["username"] == "emma.finance"
    assert data["role"] == "ACCOUNTANT"
    assert data["status"] == "ACTIVE"
    assert data["approvedBy"] == "admin"

    # Verify Emma can immediately log in
    emma_login = client.post(
        "/api/v1/auth/login",
        json={"username": "emma.finance", "password": "emmapassword123"}
    )
    assert emma_login.status_code == 200
    assert emma_login.json()["user"]["username"] == "emma.finance"
    assert emma_login.json()["user"]["role"] == "ACCOUNTANT"
