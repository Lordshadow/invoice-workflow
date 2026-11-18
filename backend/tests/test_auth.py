"""
Automated Test Suite for Authentication and Access Control API.
Verifies login endpoints, role retrieval, invalid credentials handling, and persona listings.
"""
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_login_success_executive_approver():
    """Verifies that an Executive Approver can authenticate successfully."""
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "sarah.approver", "password": "password123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["user"]["role"] == "APPROVER"
    assert data["user"]["fullName"] == "Sarah Jenkins"
    assert data["token"].startswith("lf_tok_")


def test_login_success_staff_accountant():
    """Verifies that a Staff Accountant can authenticate successfully."""
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "john.accountant", "password": "password123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["user"]["role"] == "ACCOUNTANT"
    assert data["user"]["fullName"] == "John Doe"


def test_login_success_admin_alias():
    """Verifies that an administrator can authenticate with alias 'admin'."""
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "password123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["role"] == "SUPERVISOR"
    assert data["user"]["fullName"] == "Alex Vance"


def test_login_invalid_username():
    """Verifies that an unknown user receives HTTP 401 Unauthorized."""
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "unknown.hacker", "password": "password123"}
    )
    assert response.status_code == 401
    assert "Invalid corporate credentials" in response.json()["detail"]


def test_login_empty_password():
    """Verifies that a blank/short password receives HTTP 400 Bad Request."""
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "sarah.approver", "password": ""}
    )
    assert response.status_code == 400


def test_list_personas_endpoint():
    """Verifies that GET /api/v1/auth/users lists all available corporate personas."""
    response = client.get("/api/v1/auth/users")
    assert response.status_code == 200
    users = response.json()
    assert len(users) == 3
    roles = {u["role"] for u in users}
    assert "APPROVER" in roles
    assert "ACCOUNTANT" in roles
    assert "SUPERVISOR" in roles
