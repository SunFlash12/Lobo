"""Backend regression tests for Lobo Live Lab (Node.js/Express, localhost:3100)."""
import os
import time
import subprocess
import pytest
import requests

BASE_URL = "http://localhost:3100"
PASSWORD = "Bladestrex"


@pytest.fixture(scope="session")
def session_cookie():
    r = requests.post(f"{BASE_URL}/login", json={"password": PASSWORD}, allow_redirects=False)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    cookie = r.cookies.get("lobo_lab_session")
    assert cookie
    return {"lobo_lab_session": cookie}


# --- Auth ---
class TestAuth:
    def test_login_success_sets_cookie(self):
        r = requests.post(f"{BASE_URL}/login", json={"password": PASSWORD})
        assert r.status_code == 200
        assert r.cookies.get("lobo_lab_session")

    def test_login_wrong_password_401(self):
        r = requests.post(f"{BASE_URL}/login", json={"password": "wrong"})
        assert r.status_code == 401

    def test_dashboard_without_cookie_redirects(self):
        r = requests.get(f"{BASE_URL}/dashboard", allow_redirects=False)
        assert r.status_code in (301, 302)
        assert "/login" in r.headers.get("location", "")

    def test_dashboard_with_cookie_200(self, session_cookie):
        r = requests.get(f"{BASE_URL}/dashboard", cookies=session_cookie)
        assert r.status_code == 200


# --- Overlays (public) ---
class TestOverlays:
    @pytest.mark.parametrize("path", ["alerts", "chat", "goal", "stats", "ticker"])
    def test_overlay_public_200(self, path):
        r = requests.get(f"{BASE_URL}/overlay/{path}")
        assert r.status_code == 200


# --- Public config ---
class TestPublicConfig:
    def test_public_config_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/public/config")
        assert r.status_code == 200
        data = r.json()
        assert "config" in data
        assert "counters" in data
        assert "status" in data


# --- Auth-gated endpoints reject unauthenticated ---
class TestAuthGating:
    @pytest.mark.parametrize("method,path,body", [
        ("GET", "/api/status", None),
        ("GET", "/api/config", None),
        ("GET", "/api/log", None),
        ("POST", "/api/demo/fire", {"type": "follow"}),
        ("POST", "/api/counters/reset", {}),
    ])
    def test_requires_auth_401(self, method, path, body):
        r = requests.request(method, f"{BASE_URL}{path}", json=body)
        assert r.status_code == 401, f"{method} {path} => {r.status_code}"


# --- CRITICAL: demo/fire regression across all 8 event types ---
class TestDemoFireAllTypes:
    EVENT_TYPES = ["follow", "gift", "like", "share", "subscribe", "comment", "join", "viewers"]

    def test_each_event_type_reaches_log(self, session_cookie):
        # Snapshot log length before
        before = requests.get(f"{BASE_URL}/api/log", cookies=session_cookie).json().get("log", [])
        before_ids = {e.get("id") for e in before}

        # Fire each event type
        for t in self.EVENT_TYPES:
            r = requests.post(f"{BASE_URL}/api/demo/fire", json={"type": t}, cookies=session_cookie)
            assert r.status_code in (200, 201, 204), f"fire {t} => {r.status_code} {r.text}"

        # gift streaks buffer ~3s; wait for finalisation
        time.sleep(4)

        after = requests.get(f"{BASE_URL}/api/log", cookies=session_cookie).json().get("log", [])
        new_events = [e for e in after if e.get("id") not in before_ids]
        seen_types = {e.get("type") for e in new_events}

        missing = [t for t in self.EVENT_TYPES if t not in seen_types]
        assert not missing, f"Missing event types in log after fire: {missing}. Seen: {seen_types}"


# --- Rolling log cap 500 ---
class TestLogCap:
    def test_log_never_exceeds_500(self, session_cookie):
        # Fire a bunch of lightweight events (like)
        for _ in range(60):
            requests.post(f"{BASE_URL}/api/demo/fire", json={"type": "like"}, cookies=session_cookie)
        r = requests.get(f"{BASE_URL}/api/log", cookies=session_cookie)
        assert r.status_code == 200
        log = r.json().get("log", [])
        assert len(log) <= 500


# --- Config PUT deep-merge ---
class TestConfigDeepMerge:
    def test_put_config_deep_merges(self, session_cookie):
        payload = {"config": {"goal": {"label": "TEST_LABEL_X", "target": 99}}}
        r = requests.put(f"{BASE_URL}/api/config", json=payload, cookies=session_cookie)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/config", cookies=session_cookie)
        cfg = r2.json().get("config", {})
        assert cfg.get("goal", {}).get("label") == "TEST_LABEL_X"
        assert cfg.get("goal", {}).get("target") == 99
        # Other keys still present
        assert "alerts" in cfg or "chat" in cfg  # deep-merge preserved DEFAULT_CONFIG siblings


# --- Counter reset + persistence ---
class TestCountersPersistence:
    def test_reset_zeroes_counters(self, session_cookie):
        r = requests.post(f"{BASE_URL}/api/counters/reset", cookies=session_cookie)
        assert r.status_code in (200, 204)
        time.sleep(1.5)  # allow debounced persist
        s = requests.get(f"{BASE_URL}/api/status", cookies=session_cookie).json()
        counters = s.get("counters", {})
        assert counters.get("followers", 0) == 0
        assert counters.get("sessionLikes", 0) == 0

    def test_follow_counter_increments(self, session_cookie):
        requests.post(f"{BASE_URL}/api/counters/reset", cookies=session_cookie)
        time.sleep(1.2)
        for _ in range(3):
            requests.post(f"{BASE_URL}/api/demo/fire", json={"type": "follow"}, cookies=session_cookie)
        time.sleep(0.5)
        s = requests.get(f"{BASE_URL}/api/status", cookies=session_cookie).json()
        assert s["counters"]["followers"] == 3

    def test_counter_persists_across_restart(self, session_cookie):
        # Set a known state: reset, fire 5 follows, wait for persist
        requests.post(f"{BASE_URL}/api/counters/reset", cookies=session_cookie)
        time.sleep(1.2)
        for _ in range(5):
            requests.post(f"{BASE_URL}/api/demo/fire", json={"type": "follow"}, cookies=session_cookie)
        time.sleep(2)  # debounce is 1s

        # Restart node process
        subprocess.run("pkill -f 'node server/index'", shell=True)
        time.sleep(2)
        subprocess.Popen(
            "cd /app/lobo-live-lab && DEMO_MODE=true PORT=3100 nohup node server/index.js > /tmp/lobo.log 2>&1 &",
            shell=True,
        )
        # Wait for server
        for _ in range(20):
            try:
                if requests.get(f"{BASE_URL}/login", timeout=1).status_code == 200:
                    break
            except Exception:
                pass
            time.sleep(0.5)

        # Re-login (cookie may still be valid but do a fresh one to be safe)
        r = requests.post(f"{BASE_URL}/login", json={"password": PASSWORD})
        cookie = {"lobo_lab_session": r.cookies.get("lobo_lab_session")}
        s = requests.get(f"{BASE_URL}/api/status", cookies=cookie).json()
        assert s["counters"]["followers"] == 5, f"expected 5, got {s['counters']}"
