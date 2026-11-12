"""
Integration tests for authentication endpoints.
"""
import urllib.request
import urllib.parse
import urllib.error
import json
import uuid

BASE_URL = "http://127.0.0.1:8000"

def test_registration_and_login():
    unique_user = f"Agent_{uuid.uuid4().hex[:6]}"
    password = "SecretPassword123!"

    # 1. Register new user
    reg_payload = json.dumps({
        "username": unique_user,
        "password": password,
        "email": f"{unique_user.lower()}@test.com"
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/api/auth/register",
        data=reg_payload,
        headers={"Content-Type": "application/json"}
    )
    res = urllib.request.urlopen(req)
    assert res.getcode() == 201
    body = json.loads(res.read().decode("utf-8"))
    assert "access_token" in body
    assert body["user"]["username"] == unique_user
    print(f"✅ 1. Registration SUCCESS for {unique_user}")

    # 2. Login with correct credentials
    login_payload = urllib.parse.urlencode({
        "username": unique_user,
        "password": password
    }).encode("utf-8")

    req_login = urllib.request.Request(
        f"{BASE_URL}/api/auth/login",
        data=login_payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    res_login = urllib.request.urlopen(req_login)
    assert res_login.getcode() == 200
    login_body = json.loads(res_login.read().decode("utf-8"))
    assert "access_token" in login_body
    print(f"✅ 2. Login SUCCESS for {unique_user}")

    # 3. Duplicate registration should return 409
    try:
        urllib.request.urlopen(req)
        assert False, "Duplicate registration should have failed"
    except urllib.error.HTTPError as e:
        assert e.code == 409
        print(f"✅ 3. Duplicate registration correctly rejected with 409 Conflict")

    # 4. Wrong password should return 401
    wrong_login_payload = urllib.parse.urlencode({
        "username": unique_user,
        "password": "WrongPassword!"
    }).encode("utf-8")
    req_wrong = urllib.request.Request(
        f"{BASE_URL}/api/auth/login",
        data=wrong_login_payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    try:
        urllib.request.urlopen(req_wrong)
        assert False, "Wrong password should have failed"
    except urllib.error.HTTPError as e:
        assert e.code == 401
        print(f"✅ 4. Wrong password correctly rejected with 401 Unauthorized")

    # 5. Guest login
    guest_payload = json.dumps({"display_name": "GhostHunter"}).encode("utf-8")
    req_guest = urllib.request.Request(
        f"{BASE_URL}/api/auth/guest",
        data=guest_payload,
        headers={"Content-Type": "application/json"}
    )
    res_guest = urllib.request.urlopen(req_guest)
    assert res_guest.getcode() == 200
    guest_body = json.loads(res_guest.read().decode("utf-8"))
    assert guest_body["user"]["is_guest"] is True
    print(f"✅ 5. Guest login SUCCESS ({guest_body['user']['username']})")

if __name__ == "__main__":
    test_registration_and_login()
    print("🎉 All Authentication Integration Tests Passed!")
