from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.configs.settings import settings

PATH = "/api/projects"


def _token(secret=None, **overrides) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": "1",
        "role": "admin",
        "iss": "gg-cms-factory-proxy",
        "aud": "content-factory",
        "iat": now,
        "exp": now + timedelta(minutes=1),
    }
    claims.update(overrides)
    return jwt.encode(claims, secret or settings.factory_proxy_secret, algorithm="HS256")


@pytest.fixture
def client():
    return TestClient(app)


def _get(client, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.get(PATH, headers=headers)


def test_valid_service_token_is_accepted(client):
    assert _get(client, _token()).status_code != 401


@pytest.mark.parametrize(
    "token_kwargs",
    [
        {"secret": "some-other-secret-0123456789abcdef0123"},
        {"iss": "gg-cms"},
        {"aud": "gg-cms-web"},
        {"exp": datetime.now(timezone.utc) - timedelta(seconds=30)},
        {"exp": datetime.now(timezone.utc) + timedelta(hours=1)},
    ],
)
def test_invalid_service_tokens_are_rejected(client, token_kwargs):
    assert _get(client, _token(**token_kwargs)).status_code == 401


def test_missing_token_is_rejected(client):
    assert _get(client).status_code == 401


def test_unconfigured_secret_fails_closed(client, monkeypatch):
    token = _token()
    monkeypatch.setattr(settings, "factory_proxy_secret", "")
    assert _get(client, token).status_code == 503
