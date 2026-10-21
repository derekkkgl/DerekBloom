"""Shared test setup. Every test runs with the network switched off and an empty cache."""

import socket

import pytest
from fastapi.testclient import TestClient

from app.core.cache import cache
from app.main import app


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Any accidental call to Yahoo, CoinGecko, or a feed fails loudly."""

    def blocked(*args, **kwargs):
        raise RuntimeError("Network access is disabled in tests")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setattr(socket, "getaddrinfo", blocked)


@pytest.fixture(autouse=True)
def empty_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def client():
    return TestClient(app)


class FakeClock:
    def __init__(self, start: float = 1_000_000.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture
def clock():
    return FakeClock()
